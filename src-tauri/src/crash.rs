//! A panic on the Rust side, kept for the page to report. The hook writes what panicked and
//! where to `last-crash.json` in the app's data folder. At the next start the page takes it
//! (`take_last_crash`) and sends it as an error report when "Send error reports" is on, with
//! the same scrubbing as every other report. Nothing leaves the computer from here.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// The most of a panic message kept: the start says what went wrong.
const MAX_MESSAGE_CHARS: usize = 2_000;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Crash {
    pub message: String,
    /// The source file and line that panicked, e.g. src/files.rs:120.
    pub location: Option<String>,
    pub thread: Option<String>,
    /// The app version that panicked, which may be older than the one reporting it.
    pub version: String,
}

fn crash_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("last-crash.json"))
}

fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    let message = payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "panic without a message".into());
    message.chars().take(MAX_MESSAGE_CHARS).collect()
}

fn write_crash(path: &Path, crash: &Crash) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_vec(crash) {
        let _ = std::fs::write(path, json);
    }
}

/// The crash kept at `path`, if any; the file goes, so each crash is reported once.
fn read_crash(path: &Path) -> Option<Crash> {
    let bytes = std::fs::read(path).ok()?;
    let _ = std::fs::remove_file(path);
    serde_json::from_slice(&bytes).ok()
}

/// Keeps every panic from now on, after the default hook has printed it.
pub fn install(app: &AppHandle) {
    let Some(path) = crash_path(app) else {
        return;
    };
    let version = app.package_info().version.to_string();
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        previous(info);
        let crash = Crash {
            message: panic_message(info.payload()),
            location: info
                .location()
                .map(|l| format!("{}:{}", l.file(), l.line())),
            thread: std::thread::current().name().map(str::to_string),
            version: version.clone(),
        };
        write_crash(&path, &crash);
    }));
}

/// The last panic since the page last asked, if there was one.
#[tauri::command]
pub fn take_last_crash(app: AppHandle) -> Option<Crash> {
    read_crash(&crash_path(&app)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_crash_is_read_once() {
        let dir = std::env::temp_dir().join(format!("polemic-crash-{}", std::process::id()));
        let path = dir.join("last-crash.json");
        let crash = Crash {
            message: "index out of bounds".into(),
            location: Some("src/files.rs:120".into()),
            thread: Some("main".into()),
            version: "0.25.0".into(),
        };
        write_crash(&path, &crash);
        assert_eq!(read_crash(&path), Some(crash));
        assert_eq!(read_crash(&path), None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_message_is_kept_short() {
        let long = "x".repeat(MAX_MESSAGE_CHARS + 10);
        assert_eq!(panic_message(&long).len(), MAX_MESSAGE_CHARS);
        assert_eq!(panic_message(&"boom"), "boom");
        assert_eq!(panic_message(&42), "panic without a message");
    }
}
