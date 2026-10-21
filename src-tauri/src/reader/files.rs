//! Documents live in `$APPDATA/reader/<uuid>.<ext>`. The database stores only the file
//! name (`file_path`); the absolute path is rebuilt from the data directory, so moving the
//! data directory never strands a document.

use std::path::{Path, PathBuf};

use super::looks_like_pdf;

pub fn reader_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("reader")
}

/// The managed directory for this machine (same base as `resolve_app_data_dir`).
pub fn default_reader_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or_else(|| "APP_DATA_DIR_UNAVAILABLE".to_string())?;
    Ok(reader_dir(&base.join("com.flexilingo.desk")))
}

/// Absolute path of a stored file. Refuses anything that is not a bare file name, so a
/// corrupted row can never point the reader outside its own directory.
pub fn resolve(dir: &Path, stored: &str) -> Result<PathBuf, String> {
    let name = Path::new(stored);
    let bare = name.components().count() == 1
        && name.file_name().map(|n| n == std::ffi::OsStr::new(stored)).unwrap_or(false);
    if !bare || stored.starts_with('.') {
        return Err("INVALID_FILE_PATH".to_string());
    }
    Ok(dir.join(stored))
}

fn stored_name(id: &str) -> String {
    format!("{id}.pdf")
}

/// Copy a user-chosen PDF into the managed directory. Returns `(stored name, byte size)`.
pub fn import_path(dir: &Path, src: &Path, id: &str) -> Result<(String, u64), String> {
    let meta = std::fs::metadata(src).map_err(|_| "FILE_NOT_FOUND".to_string())?;
    if !meta.is_file() || meta.len() == 0 {
        return Err("EMPTY_FILE".to_string());
    }
    let is_pdf_ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf_ext {
        return Err("UNSUPPORTED_FILE_TYPE".to_string());
    }
    // Read only the head to check the magic before copying a (possibly huge) file.
    let mut head = vec![0u8; 1024];
    {
        use std::io::Read;
        let mut f = std::fs::File::open(src).map_err(|_| "FILE_NOT_FOUND".to_string())?;
        let n = f.read(&mut head).map_err(|_| "FILE_READ_FAILED".to_string())?;
        head.truncate(n);
    }
    if !looks_like_pdf(&head) {
        return Err("NOT_A_PDF".to_string());
    }
    std::fs::create_dir_all(dir).map_err(|_| "FILE_WRITE_FAILED".to_string())?;
    let name = stored_name(id);
    let dest = dir.join(&name);
    std::fs::copy(src, &dest).map_err(|_| "FILE_WRITE_FAILED".to_string())?;
    Ok((name, meta.len()))
}

/// Write PDF bytes (a photo the front already converted to PDF) into the managed directory.
pub fn import_bytes(dir: &Path, bytes: &[u8], id: &str) -> Result<(String, u64), String> {
    if bytes.is_empty() {
        return Err("EMPTY_FILE".to_string());
    }
    if !looks_like_pdf(bytes) {
        return Err("NOT_A_PDF".to_string());
    }
    std::fs::create_dir_all(dir).map_err(|_| "FILE_WRITE_FAILED".to_string())?;
    let name = stored_name(id);
    std::fs::write(dir.join(&name), bytes).map_err(|_| "FILE_WRITE_FAILED".to_string())?;
    Ok((name, bytes.len() as u64))
}

/// Remove a stored file. A file that is already gone is fine; any other failure is not,
/// because the row must not be deleted while its file is still on disk.
pub fn remove(dir: &Path, stored: &str) -> Result<(), String> {
    let path = resolve(dir, stored)?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("FILE_DELETE_FAILED".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_accepts_only_bare_file_names() {
        let dir = Path::new("/data/reader");
        assert_eq!(resolve(dir, "abc.pdf").unwrap(), dir.join("abc.pdf"));
        for bad in ["../x.pdf", "a/b.pdf", "/etc/passwd", "", ".hidden", ".."] {
            assert_eq!(resolve(dir, bad), Err("INVALID_FILE_PATH".to_string()), "{bad}");
        }
    }

    #[test]
    fn import_path_copies_a_pdf_and_reports_its_size() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("Book One.pdf");
        std::fs::write(&src, b"%PDF-1.4 hello").unwrap();
        let dir = tmp.path().join("reader");
        let (name, size) = import_path(&dir, &src, "id1").unwrap();
        assert_eq!(name, "id1.pdf");
        assert_eq!(size, 14);
        assert_eq!(std::fs::read(dir.join("id1.pdf")).unwrap(), b"%PDF-1.4 hello");
        assert!(src.exists(), "the original is copied, never moved");
    }

    #[test]
    fn import_path_rejects_bad_input_without_touching_the_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("reader");
        let missing = tmp.path().join("nope.pdf");
        assert_eq!(import_path(&dir, &missing, "a"), Err("FILE_NOT_FOUND".to_string()));

        let empty = tmp.path().join("empty.pdf");
        std::fs::write(&empty, b"").unwrap();
        assert_eq!(import_path(&dir, &empty, "a"), Err("EMPTY_FILE".to_string()));

        let txt = tmp.path().join("a.txt");
        std::fs::write(&txt, b"%PDF-1.4").unwrap();
        assert_eq!(import_path(&dir, &txt, "a"), Err("UNSUPPORTED_FILE_TYPE".to_string()));

        let fake = tmp.path().join("fake.pdf");
        std::fs::write(&fake, b"not a pdf at all").unwrap();
        assert_eq!(import_path(&dir, &fake, "a"), Err("NOT_A_PDF".to_string()));
        assert!(!dir.exists());
    }

    #[test]
    fn import_bytes_and_remove_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("reader");
        assert_eq!(import_bytes(&dir, b"", "a"), Err("EMPTY_FILE".to_string()));
        assert_eq!(import_bytes(&dir, b"GIF89a", "a"), Err("NOT_A_PDF".to_string()));
        let (name, size) = import_bytes(&dir, b"%PDF-1.7 x", "b").unwrap();
        assert_eq!((name.as_str(), size), ("b.pdf", 10));
        remove(&dir, &name).unwrap();
        assert!(!dir.join("b.pdf").exists());
        remove(&dir, &name).expect("removing a missing file is fine");
        assert_eq!(remove(&dir, "../b.pdf"), Err("INVALID_FILE_PATH".to_string()));
    }
}
