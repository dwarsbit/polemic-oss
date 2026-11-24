//! The Zotero desktop integration's transport. Zotero's local API
//! (127.0.0.1:23119) drops connections that carry an Origin header,
//! so the webview can never fetch it directly — requests go through
//! here instead, as plain HTTP on the loopback interface.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

const NO_ANSWER: &str = "Zotero stopped answering. Check that Zotero is open and try again.";

const HOST: &str = "127.0.0.1:23119";

/// Split an HTTP response into its status code and body.
fn parse_response(raw: &[u8]) -> Result<(u16, String), String> {
    let text = String::from_utf8_lossy(raw);
    let (head, body) = match text.find("\r\n\r\n") {
        Some(index) => (&text[..index], text[index + 4..].to_string()),
        None => return Err("Zotero gave an answer Polemic can't read. Try again.".into()),
    };
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or("Zotero gave an answer Polemic can't read. Try again.")?;
    Ok((status, body))
}

/// GET one path of the local Zotero API; returns the JSON body.
/// No Origin header is sent, so Zotero answers instead of dropping
/// the connection as it does for webview fetches.
pub fn local_get(path: &str, query: &str) -> Result<String, String> {
    // Both go into the raw request line: allow only URL-safe characters,
    // so neither can smuggle extra headers or requests.
    let path_ok = path
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-'));
    let query_ok = query
        .chars()
        .all(|c| c.is_ascii_graphic() && !matches!(c, '#'));
    if !path_ok || !query_ok {
        return Err("invalid Zotero request".into());
    }
    let mut stream = TcpStream::connect(HOST).map_err(|_| {
        "Could not reach Zotero. Check that Zotero is open on this computer.".to_string()
    })?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|_| NO_ANSWER.to_string())?;
    let request = format!(
        "GET /api/{path}?{query} HTTP/1.1\r\nHost: localhost:23119\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|_| NO_ANSWER.to_string())?;
    let mut raw = Vec::new();
    stream
        .read_to_end(&mut raw)
        .map_err(|_| NO_ANSWER.to_string())?;
    let (status, body) = parse_response(&raw)?;
    if !(200..300).contains(&status) {
        return Err(format!(
            "Zotero answered {status}. Check that Zotero is up to date."
        ));
    }
    Ok(body)
}

const CLOUD: &str = "https://api.zotero.org";

/// The Zotero web API address for one request of a cloud source. Only
/// the paths the sources search uses, so a script can't aim the key at
/// anything else.
fn cloud_url(user_id: &str, path: &str, query: &str) -> Result<String, String> {
    let invalid = || "invalid Zotero request".to_string();
    let collection_items = path
        .strip_prefix("collections/")
        .and_then(|rest| rest.strip_suffix("/items"))
        .is_some_and(|key| {
            !key.is_empty() && key.len() <= 16 && key.chars().all(|c| c.is_ascii_alphanumeric())
        });
    let user_path = matches!(path, "items" | "collections") || collection_items;
    if path != "keys/current" && !user_path {
        return Err(invalid());
    }
    if user_path && (user_id.is_empty() || !user_id.chars().all(|c| c.is_ascii_digit())) {
        return Err("Add your Zotero user ID in Settings → Sources.".into());
    }
    let base = if user_path {
        format!("{CLOUD}/users/{user_id}/{path}")
    } else {
        format!("{CLOUD}/{path}")
    };
    let mut url = url::Url::parse(&base).map_err(|_| invalid())?;
    url.set_query(Some(query).filter(|q| !q.is_empty()));
    if url.host_str() != Some("api.zotero.org") || url.fragment().is_some() {
        return Err(invalid());
    }
    Ok(url.into())
}

/// One GET against the Zotero web API for a cloud source, with the
/// source's key from the settings: the webview only ever has
/// `secrets::KEPT` in its place.
#[tauri::command]
pub async fn zotero_cloud_fetch(
    app: tauri::AppHandle,
    source_id: String,
    path: String,
    query: String,
) -> Result<String, String> {
    let settings = crate::settings::snapshot(&app)?;
    let source = settings
        .sources
        .iter()
        .find(|s| s.id == source_id && s.kind == "zotero-cloud")
        .ok_or("This Zotero connection was removed. Add it again in Settings → Sources.")?;
    let key = source
        .api_key
        .as_deref()
        .filter(|key| !key.is_empty() && *key != crate::secrets::KEPT)
        .ok_or("Add your Zotero API key in Settings → Sources.")?;
    let url = cloud_url(source.user_id.as_deref().unwrap_or(""), &path, &query)?;
    let response = reqwest::Client::new()
        .get(url)
        .header("Zotero-API-Key", key)
        .header("Zotero-API-Version", "3")
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| crate::errors::no_answer("Zotero", e.is_timeout()))?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(format!(
            "Zotero answered {status}. Check that Zotero is up to date."
        ));
    }
    response
        .text()
        .await
        .map_err(|_| "Zotero gave an answer Polemic can't read. Try again.".into())
}

/// One GET against the local Zotero API, for the webview.
#[tauri::command]
pub fn zotero_local_fetch(path: String, query: String) -> Result<String, String> {
    local_get(&path, &query)
}

#[cfg(test)]
mod tests {
    #[test]
    fn cloud_requests_stay_on_the_sources_paths() {
        assert_eq!(
            cloud_url("42", "items", "format=json&q=x").unwrap(),
            "https://api.zotero.org/users/42/items?format=json&q=x"
        );
        assert_eq!(
            cloud_url("42", "collections/ABCD1234/items", "").unwrap(),
            "https://api.zotero.org/users/42/collections/ABCD1234/items"
        );
        assert_eq!(
            cloud_url("", "keys/current", "").unwrap(),
            "https://api.zotero.org/keys/current"
        );
        for path in [
            "keys/abc",
            "users/1/items",
            "items/../keys",
            "collections/../../x/items",
            "//evil.example/items",
        ] {
            assert!(cloud_url("42", path, "").is_err(), "{path}");
        }
        assert!(cloud_url("42@evil.example", "items", "").is_err());
        // A fragment can't end the query early: it is escaped.
        assert_eq!(
            cloud_url("42", "items", "a#b").unwrap(),
            "https://api.zotero.org/users/42/items?a%23b"
        );
    }

    use super::*;

    #[test]
    fn parses_status_and_body() {
        let raw = b"HTTP/1.0 200 OK\r\nContent-Type: application/json\r\n\r\n[{\"key\":\"A\"}]";
        let (status, body) = parse_response(raw).unwrap();
        assert_eq!(status, 200);
        assert_eq!(body, "[{\"key\":\"A\"}]");
    }

    #[test]
    fn rejects_error_status() {
        let raw = b"HTTP/1.0 404 Not Found\r\n\r\n[]";
        let (status, _) = parse_response(raw).unwrap();
        assert_eq!(status, 404);
    }

    #[test]
    fn rejects_request_smuggling() {
        assert!(local_get("users/0/items HTTP/1.1\r\nX: y", "").is_err());
        assert!(local_get("users/0/items", "q=a\r\nX: y").is_err());
        assert!(local_get("users/0/items", "q=a b").is_err());
    }

    #[test]
    fn rejects_incomplete_response() {
        assert!(parse_response(b"HTTP/1.0 200 OK\r\n").is_err());
    }

    /// Hits the real local Zotero server; run explicitly with
    /// `cargo test zotero -- --ignored`.
    #[test]
    #[ignore = "needs a running Zotero with the API enabled"]
    fn live_probe_answers_items() {
        let body = local_get("users/0/items", "limit=1").unwrap();
        assert!(body.starts_with('['));
    }
}
