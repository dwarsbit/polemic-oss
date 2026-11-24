//! The files outside a project that `import_assets` may copy in: the
//! ones the user just picked in a native dialog Rust-side or dropped
//! on the window. A script in the webview can name any path, so it
//! could otherwise copy ~/.ssh/id_rsa into a project and read it back.
//! Each path is admitted once, for a few minutes.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// How long a picked or dropped file stays importable.
const TTL: Duration = Duration::from_secs(10 * 60);

fn admitted() -> &'static Mutex<HashMap<PathBuf, Instant>> {
    static ADMITTED: OnceLock<Mutex<HashMap<PathBuf, Instant>>> = OnceLock::new();
    ADMITTED.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Admit files the user chose; paths that don't resolve are skipped.
/// Returns the canonical paths of the files admitted.
pub fn admit<I, P>(paths: I) -> Vec<PathBuf>
where
    I: IntoIterator<Item = P>,
    P: AsRef<Path>,
{
    let now = Instant::now();
    let Ok(mut set) = admitted().lock() else {
        return Vec::new();
    };
    set.retain(|_, at| now.duration_since(*at) < TTL);
    let mut out = Vec::new();
    for path in paths {
        if let Ok(canonical) = std::fs::canonicalize(path.as_ref()) {
            set.insert(canonical.clone(), now);
            out.push(canonical);
        }
    }
    out
}

/// Whether a canonical path was admitted, and still is; it is used up.
pub fn take(canonical: &Path) -> bool {
    let Ok(mut set) = admitted().lock() else {
        return false;
    };
    match set.remove(canonical) {
        Some(at) => at.elapsed() < TTL,
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admits_each_picked_file_once() {
        let dir = std::env::temp_dir().join(format!("polemic-imports-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("figure.png");
        std::fs::write(&file, b"png").unwrap();
        let other = dir.join("secret.txt");
        std::fs::write(&other, b"secret").unwrap();
        let canonical = std::fs::canonicalize(&file).unwrap();

        assert!(!take(&canonical));
        assert_eq!(
            admit([&file, &dir.join("missing.png")]),
            vec![canonical.clone()]
        );
        assert!(!take(&std::fs::canonicalize(&other).unwrap()));
        assert!(take(&canonical));
        assert!(!take(&canonical));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
