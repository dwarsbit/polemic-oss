//! The assistant on Scholarkit's model, for Plus and Pro: each turn goes to
//! the account's server (`POST /api/assistant/turn`) with the account's
//! token, and its answer streams back as server-sent events. The tools run
//! in the webview, as with an own key. Failures come back as
//! `assistant:<code>:<message>`, with the server's code, so the webview can
//! say what to do (sign in, upgrade, wait for next month).

use crate::account;
use crate::ai::{AgentEvent, AiRequests};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tauri::ipc::Channel;
use tokio::sync::Notify;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantTurnArgs {
    pub messages: Vec<Value>,
    pub tools: Vec<Value>,
    /// Chosen by the webview; names the turn for `ai_cancel`.
    pub request_id: u32,
}

fn notice(code: &str, message: &str) -> String {
    format!("assistant:{code}:{message}")
}

/// Reads the server's events: `text` pieces, then `done` with the whole
/// message, or `error`.
#[derive(Default)]
pub struct ServerEvents {
    buffer: String,
    pub reply: Option<Value>,
    pub failure: Option<String>,
}

impl ServerEvents {
    /// Takes more of the stream; returns the text pieces in it.
    pub fn feed(&mut self, text: &str) -> Vec<String> {
        self.buffer.push_str(&text.replace("\r\n", "\n"));
        let mut deltas = Vec::new();
        while let Some(end) = self.buffer.find("\n\n") {
            let block: String = self.buffer.drain(..end + 2).collect();
            if let Some(delta) = self.block(&block) {
                deltas.push(delta);
            }
        }
        deltas
    }

    /// What is left once the stream ends.
    pub fn finish(&mut self) -> Vec<String> {
        let rest = std::mem::take(&mut self.buffer);
        self.block(&rest).into_iter().collect()
    }

    fn block(&mut self, block: &str) -> Option<String> {
        let data: Vec<&str> = block
            .lines()
            .filter_map(|line| line.strip_prefix("data:"))
            .map(str::trim_start)
            .collect();
        if data.is_empty() {
            return None;
        }
        let event: Value = serde_json::from_str(&data.join("\n")).ok()?;
        match event["type"].as_str() {
            Some("text") => event["delta"].as_str().map(str::to_string),
            Some("done") => {
                let message = &event["message"];
                let mut reply = json!({
                    "role": "assistant",
                    "content": message["content"].as_str().unwrap_or(""),
                });
                if let Some(calls) = message["tool_calls"].as_array().filter(|c| !c.is_empty()) {
                    reply["tool_calls"] = Value::Array(calls.clone());
                }
                self.reply = Some(reply);
                None
            }
            Some("error") => {
                self.failure = Some(notice(
                    event["error"].as_str().unwrap_or("model_unavailable"),
                    event["message"].as_str().unwrap_or(""),
                ));
                None
            }
            _ => None,
        }
    }
}

/// The notice for a refused turn: the server's code, else one for its status.
pub fn refused(status: u16, body: &str) -> String {
    let body: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let code = body["error"].as_str().unwrap_or(match status {
        401 => "unauthorized",
        413 => "too_long",
        502 | 504 => "model_unavailable",
        _ => "failed",
    });
    notice(code, body["message"].as_str().unwrap_or(""))
}

fn client() -> Result<reqwest::Client, String> {
    // A turn may stream for minutes; the server stops it after three.
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(240))
        .user_agent(concat!("Polemic/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

/// One assistant turn on Scholarkit's model: streams the reply text over
/// `on_event` and returns the complete assistant message.
#[tauri::command]
pub async fn assistant_turn(
    app: tauri::AppHandle,
    args: AssistantTurnArgs,
    on_event: Channel<AgentEvent>,
    requests: tauri::State<'_, AiRequests>,
) -> Result<Value, String> {
    let server = account::server_of(&app)?;
    let Some(token) = account::token_with(&server, &account::STORE) else {
        return Err(notice("unauthorized", "Sign in to use the assistant."));
    };
    let stop = Arc::new(Notify::new());
    requests.insert(args.request_id, stop.clone())?;
    let result = tokio::select! {
        result = run(&server, &token, &args, &on_event) => result,
        _ = stop.notified() => Err("cancelled".into()),
    };
    requests.remove(args.request_id);
    result
}

async fn run(
    server: &str,
    token: &str,
    args: &AssistantTurnArgs,
    on_event: &Channel<AgentEvent>,
) -> Result<Value, String> {
    let mut response = client()?
        .post(format!("{server}/api/assistant/turn"))
        .bearer_auth(token)
        .json(&json!({ "app": "polemic", "messages": args.messages, "tools": args.tools }))
        .send()
        .await
        .map_err(|_| notice("offline", ""))?;
    let status = response.status();
    if !status.is_success() {
        if status == reqwest::StatusCode::UNAUTHORIZED {
            account::forget_rejected_with(server, token, &account::STORE);
        }
        let body = response.text().await.unwrap_or_default();
        return Err(refused(status.as_u16(), &body));
    }
    let mut events = ServerEvents::default();
    // Bytes of a UTF-8 character split across chunks wait here.
    let mut pending: Vec<u8> = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| notice("model_unavailable", ""))?
    {
        pending.extend_from_slice(&chunk);
        let valid = match std::str::from_utf8(&pending) {
            Ok(_) => pending.len(),
            Err(e) => e.valid_up_to(),
        };
        let text = String::from_utf8_lossy(&pending[..valid]).into_owned();
        pending.drain(..valid);
        for delta in events.feed(&text) {
            let _ = on_event.send(AgentEvent::Text { delta });
        }
    }
    for delta in events.finish() {
        let _ = on_event.send(AgentEvent::Text { delta });
    }
    if let Some(failure) = events.failure {
        return Err(failure);
    }
    events.reply.ok_or_else(|| notice("model_unavailable", ""))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_text_and_the_whole_message_split_anywhere() {
        let stream = concat!(
            "data: {\"type\":\"text\",\"delta\":\"Add \"}\n\n",
            "data: {\"type\":\"text\",\"delta\":\"booktabs.\"}\r\n\r\n",
            "data: {\"type\":\"done\",\"message\":{\"role\":\"assistant\",\"content\":\"Add booktabs.\",",
            "\"tool_calls\":[{\"id\":\"c1\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{}\"}}]},",
            "\"usedPercent\":12}\n\n"
        );
        let mut events = ServerEvents::default();
        let mut text = String::new();
        for piece in stream.as_bytes().chunks(9) {
            for delta in events.feed(std::str::from_utf8(piece).unwrap()) {
                text.push_str(&delta);
            }
        }
        events.finish();
        assert_eq!(text, "Add booktabs.");
        let reply = events.reply.unwrap();
        assert_eq!(reply["content"], "Add booktabs.");
        assert_eq!(reply["tool_calls"][0]["function"]["name"], "read_file");
        assert!(events.failure.is_none());
    }

    #[test]
    fn passes_on_the_servers_notices() {
        let mut events = ServerEvents::default();
        events.feed(
            "data: {\"type\":\"error\",\"error\":\"model_unavailable\",\"message\":\"Stopped.\"}",
        );
        events.finish();
        assert_eq!(
            events.failure.as_deref(),
            Some("assistant:model_unavailable:Stopped.")
        );
        assert_eq!(
            refused(403, "{\"error\":\"plus_needed\",\"message\":\"Upgrade.\"}"),
            "assistant:plus_needed:Upgrade."
        );
        assert_eq!(refused(502, "<html>"), "assistant:model_unavailable:");
        assert_eq!(refused(401, ""), "assistant:unauthorized:");
    }
}
