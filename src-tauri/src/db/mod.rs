mod legacy_content;
pub mod report;
pub(crate) mod schema;

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use schema::run_migrations;

const BACKUP_PREFIX: &str = "flexidesk.db.backup-";
const BACKUPS_KEPT: usize = 3;

/// A migration failed. `backup` is where the pre-migration copy of the database is (when one
/// could be made), so the app can tell the user their data is safe.
#[derive(Debug, Clone)]
pub struct DbInitError {
    pub message: String,
    pub db_path: PathBuf,
    pub backup: Option<PathBuf>,
}

impl DbInitError {
    /// Plain text the user can copy and send to support.
    pub fn details(&self) -> String {
        format!(
            "FlexiLingo Desktop could not update its database.\nError: {}\nDatabase: {}\nBackup: {}\n",
            self.message,
            self.db_path.display(),
            self.backup.as_ref().map_or("none".to_string(), |b| b.display().to_string()),
        )
    }
}

/// Copy the database to `flexidesk.db.backup-<from>-<timestamp>` next to it and keep only the
/// newest `BACKUPS_KEPT`. `VACUUM INTO` writes a consistent copy even in WAL mode (a plain
/// file copy would miss what is still in the `-wal` file).
pub fn backup_database(conn: &Connection, db_path: &Path, from_version: &str) -> Result<PathBuf, String> {
    let dir = db_path.parent().ok_or("database has no directory")?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%3f");
    let target = dir.join(format!("{BACKUP_PREFIX}{from_version}-{stamp}"));
    conn.execute("VACUUM INTO ?1", rusqlite::params![target.to_string_lossy()])
        .map_err(|e| format!("backup failed: {e}"))?;
    prune_backups(dir);
    Ok(target)
}

fn prune_backups(dir: &Path) {
    let Ok(read) = std::fs::read_dir(dir) else { return };
    let mut backups: Vec<(std::time::SystemTime, PathBuf)> = read
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with(BACKUP_PREFIX))
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    // Newest first; the timestamp in the name breaks ties between equal modification times.
    backups.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    for (_, path) in backups.into_iter().skip(BACKUPS_KEPT) {
        let _ = std::fs::remove_file(path);
    }
}

pub fn init_database(app_data_dir: &Path) -> Result<Connection, DbInitError> {
    let db_path = app_data_dir.join("flexidesk.db");
    let fail = |message: String, backup: Option<PathBuf>| DbInitError {
        message,
        db_path: db_path.clone(),
        backup,
    };

    let conn = Connection::open(&db_path)
        .map_err(|e| fail(format!("Failed to open database at {}: {e}", db_path.display()), None))?;

    // Enable WAL mode for better concurrent read performance
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| fail(format!("Failed to set WAL mode: {e}"), None))?;

    // Enable foreign keys
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| fail(format!("Failed to enable foreign keys: {e}"), None))?;

    // An existing database with migrations to run gets a copy first. If the copy cannot be
    // made the migrations still run: each is atomic, and refusing to start would be worse.
    let backup = schema::pending_from_version(&conn)
        .and_then(|from| backup_database(&conn, &db_path, &from).ok());

    run_migrations(&conn).map_err(|e| fail(e, backup))?;

    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn old_db(dir: &Path) -> Connection {
        let conn = Connection::open(dir.join("flexidesk.db")).unwrap();
        conn.pragma_update(None, "journal_mode", "WAL").unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        schema::run_migrations_through(&conn, "V025").unwrap();
        conn
    }

    #[test]
    fn existing_database_is_backed_up_before_migrating_and_a_fresh_one_is_not() {
        let dir = tempfile::tempdir().unwrap();
        let fresh = init_database(dir.path()).unwrap();
        drop(fresh);
        let backups = |d: &Path| {
            std::fs::read_dir(d).unwrap().flatten()
                .filter(|e| e.file_name().to_string_lossy().starts_with(BACKUP_PREFIX)).count()
        };
        assert_eq!(backups(dir.path()), 0, "nothing to back up on a first run, or when up to date");

        let dir = tempfile::tempdir().unwrap();
        drop(old_db(dir.path()));
        let conn = init_database(dir.path()).unwrap();
        assert_eq!(backups(dir.path()), 1);
        let name = std::fs::read_dir(dir.path()).unwrap().flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .find(|n| n.starts_with(BACKUP_PREFIX)).unwrap();
        assert!(name.starts_with("flexidesk.db.backup-V025-"), "{name}");
        // The backup is a usable database at the OLD version.
        let b = Connection::open(dir.path().join(&name)).unwrap();
        let max: String = b.query_row("SELECT MAX(version) FROM _migrations", [], |r| r.get(0)).unwrap();
        assert_eq!(max, "V025");
        drop(conn);
    }

    #[test]
    fn only_the_last_three_backups_are_kept() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..5 {
            std::fs::write(dir.path().join(format!("{BACKUP_PREFIX}V025-2026010{i}")), b"x").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
        prune_backups(dir.path());
        let mut left: Vec<String> = std::fs::read_dir(dir.path()).unwrap().flatten()
            .map(|e| e.file_name().to_string_lossy().to_string()).collect();
        left.sort();
        assert_eq!(left.len(), 3);
        assert!(left[0].ends_with("20260102"), "{left:?}");
    }
}
