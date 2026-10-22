//! Which file paths the webview may make Rust read or write.
//!
//! A command that takes a path from JavaScript is only as safe as that path. If the webview
//! could name any path, a single script-injection bug would become "write any file / read any
//! PDF or image on this computer". So the file dialogs are opened FROM RUST
//! (`dialog_pick_file`, `dialog_pick_save`): the user picks, Rust remembers the path, and the
//! path-taking commands call `require`, which accepts only
//!
//! * a path the user picked in a Rust-owned dialog (or dropped on the window), or
//! * a path inside the app's own data folder.
//!
//! Anything else is `PATH_NOT_ALLOWED`. The webview has no `dialog` plugin permission, so it
//! cannot open a dialog behind Rust's back.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, OnceLock};

use serde::Deserialize;
use tauri_plugin_dialog::{DialogExt, FilePath};

static GRANTED: LazyLock<Mutex<HashSet<PathBuf>>> = LazyLock::new(Default::default);
static APP_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Set once at startup: paths inside this folder never need a grant.
pub fn set_app_dir(dir: &Path) {
    let _ = APP_DIR.set(normalise(dir));
}

/// Canonical form of a path that may not exist yet (a save target): the parent is resolved
/// and the file name appended, so a grant made for the target matches the later check.
fn normalise(p: &Path) -> PathBuf {
    if let Ok(c) = p.canonicalize() {
        return c;
    }
    match (p.parent().and_then(|d| d.canonicalize().ok()), p.file_name()) {
        (Some(dir), Some(name)) => dir.join(name),
        _ => p.to_path_buf(),
    }
}

pub fn grant(path: &Path) {
    if let Ok(mut g) = GRANTED.lock() {
        g.insert(normalise(path));
    }
}

fn allowed(path: &str, app_dir: Option<&Path>) -> bool {
    if path.trim().is_empty() || path.contains('\0') {
        return false;
    }
    let p = normalise(Path::new(path));
    if GRANTED.lock().map(|g| g.contains(&p)).unwrap_or(false) {
        return true;
    }
    // `normalise` resolved symlinks and `..`, so a prefix test cannot be walked out of.
    app_dir.map_or(false, |dir| p.starts_with(dir))
}

/// Ok when `path` was picked by the user in a Rust-owned dialog or lies in the app data folder.
pub fn require(path: &str) -> Result<(), String> {
    if allowed(path, APP_DIR.get().map(|d| d.as_path())) {
        Ok(())
    } else {
        Err("PATH_NOT_ALLOWED".to_string())
    }
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DialogFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DialogOptions {
    pub title: Option<String>,
    pub default_path: Option<String>,
    pub filters: Vec<DialogFilter>,
}

fn into_path(p: Option<FilePath>) -> Option<PathBuf> {
    p.and_then(|f| f.into_path().ok())
}

/// "Open file" dialog, shown by Rust. Returns the picked path (now allowed) or null.
#[tauri::command]
pub async fn dialog_pick_file(app: tauri::AppHandle, options: Option<DialogOptions>) -> Result<Option<String>, String> {
    let o = options.unwrap_or_default();
    let mut b = app.dialog().file();
    if let Some(t) = &o.title {
        b = b.set_title(t);
    }
    for f in &o.filters {
        let exts: Vec<&str> = f.extensions.iter().map(|e| e.as_str()).collect();
        b = b.add_filter(&f.name, &exts);
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    b.pick_file(move |p| {
        let _ = tx.send(into_path(p));
    });
    let picked = rx.await.map_err(|_| "DIALOG_FAILED".to_string())?;
    Ok(picked.map(|p| {
        grant(&p);
        p.to_string_lossy().to_string()
    }))
}

/// "Save as" dialog, shown by Rust. Returns the chosen path (now allowed) or null.
#[tauri::command]
pub async fn dialog_pick_save(app: tauri::AppHandle, options: Option<DialogOptions>) -> Result<Option<String>, String> {
    let o = options.unwrap_or_default();
    let mut b = app.dialog().file();
    if let Some(t) = &o.title {
        b = b.set_title(t);
    }
    if let Some(name) = &o.default_path {
        // A bare file name only: the webview does not get to choose the folder.
        let name = Path::new(name).file_name().and_then(|n| n.to_str()).unwrap_or("export");
        b = b.set_file_name(name);
    }
    for f in &o.filters {
        let exts: Vec<&str> = f.extensions.iter().map(|e| e.as_str()).collect();
        b = b.add_filter(&f.name, &exts);
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    b.save_file(move |p| {
        let _ = tx.send(into_path(p));
    });
    let picked = rx.await.map_err(|_| "DIALOG_FAILED".to_string())?;
    Ok(picked.map(|p| {
        grant(&p);
        p.to_string_lossy().to_string()
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_granted_or_app_dir_paths_pass() {
        let app = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let app_dir = normalise(app.path());
        let inside = app.path().join("reader").join("a.pdf");
        std::fs::create_dir_all(inside.parent().unwrap()).unwrap();
        std::fs::write(&inside, b"x").unwrap();
        let outside = other.path().join("secret.png");
        std::fs::write(&outside, b"x").unwrap();
        let outside_s = outside.to_string_lossy().to_string();

        assert!(allowed(&inside.to_string_lossy(), Some(&app_dir)), "app data dir is allowed");
        assert!(!allowed(&outside_s, Some(&app_dir)), "an arbitrary path is refused");
        assert!(!allowed("", Some(&app_dir)));
        assert!(!allowed(&outside_s, None));

        grant(&outside);
        assert!(allowed(&outside_s, Some(&app_dir)), "a dialog-picked path is allowed");

        // `..` cannot walk out of the app dir into a path that was never granted.
        let sneaky = app.path().join("..").join(other.path().file_name().unwrap()).join("other.png");
        std::fs::write(other.path().join("other.png"), b"x").unwrap();
        assert!(!allowed(&sneaky.to_string_lossy(), Some(&app_dir)));
    }

    #[test]
    fn a_save_target_that_does_not_exist_yet_can_be_granted() {
        let d = tempfile::tempdir().unwrap();
        let target = d.path().join("export.csv");
        let app = tempfile::tempdir().unwrap();
        assert!(!allowed(&target.to_string_lossy(), Some(&normalise(app.path()))));
        grant(&target);
        assert!(allowed(&target.to_string_lossy(), Some(&normalise(app.path()))));
    }

    #[test]
    fn a_symlink_out_of_the_app_dir_is_not_inside_it() {
        #[cfg(unix)]
        {
            let app = tempfile::tempdir().unwrap();
            let other = tempfile::tempdir().unwrap();
            std::fs::write(other.path().join("s.png"), b"x").unwrap();
            let link = app.path().join("link");
            std::os::unix::fs::symlink(other.path(), &link).unwrap();
            let via = link.join("s.png");
            assert!(!allowed(&via.to_string_lossy(), Some(&normalise(app.path()))));
        }
    }
}
