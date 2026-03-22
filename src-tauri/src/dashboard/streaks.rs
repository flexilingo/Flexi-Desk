use chrono::Datelike;
use rusqlite::Connection;

use super::types::StreakInfo;

/// Called when checking streak status. Determines if streak should be
/// maintained, frozen, or broken based on last activity and freeze days.
pub fn check_streak(conn: &Connection) -> Result<StreakInfo, String> {
    let mut streak = get_current_streak(conn)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    if streak.last_activity_date.as_deref() == Some(&today) {
        return Ok(streak);
    }

    let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    if streak.last_activity_date.as_deref() == Some(&yesterday) {
        return Ok(streak);
    }

    // Missed at least one day — check freeze availability
    let days_missed = days_between(
        streak.last_activity_date.as_deref().unwrap_or(&today),
        &today,
    );

    if days_missed <= 1 && streak.freeze_days_remaining > 0 {
        conn.execute(
            "UPDATE streaks SET freeze_days_remaining = freeze_days_remaining - 1 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
            [],
        )
        .map_err(|e| format!("Freeze update: {e}"))?;
    } else if days_missed > 1 || streak.freeze_days_remaining == 0 {
        conn.execute(
            "UPDATE streaks SET current_streak = 0 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
            [],
        )
        .map_err(|e| format!("Streak reset: {e}"))?;
        streak.current_streak = 0;
    }

    maybe_reset_weekly_freezes(conn)?;
    get_current_streak(conn)
}

/// Use a streak freeze day manually.
pub fn use_freeze(conn: &Connection) -> Result<StreakInfo, String> {
    let streak = get_current_streak(conn)?;
    if streak.freeze_days_remaining <= 0 {
        return Err("No freeze days remaining".to_string());
    }
    conn.execute(
        "UPDATE streaks SET freeze_days_remaining = freeze_days_remaining - 1 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
        [],
    )
    .map_err(|e| format!("Use freeze: {e}"))?;
    get_current_streak(conn)
}

/// Set how many freeze days per week the user gets.
pub fn set_freeze_config(conn: &Connection, freezes_per_week: i64) -> Result<(), String> {
    let clamped = freezes_per_week.clamp(0, 3);
    conn.execute(
        "UPDATE streaks SET freeze_days_per_week = ?1 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
        rusqlite::params![clamped],
    )
    .map_err(|e| format!("Set freeze config: {e}"))?;
    Ok(())
}

/// Set the daily XP target.
pub fn set_xp_target(conn: &Connection, target: i64) -> Result<(), String> {
    let clamped = target.clamp(10, 500);
    conn.execute(
        "UPDATE streaks SET daily_xp_target = ?1 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
        rusqlite::params![clamped],
    )
    .map_err(|e| format!("Set XP target: {e}"))?;
    Ok(())
}

/// Get today's XP progress toward the daily goal.
pub fn get_xp_progress(conn: &Connection) -> Result<super::types::XPProgress, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let xp_today: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(xp_amount), 0) FROM xp_log WHERE date(created_at) = ?1",
            rusqlite::params![today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let streak = get_current_streak(conn)?;
    let xp_target = streak.daily_xp_target.max(1);
    let percentage = (xp_today as f64 / xp_target as f64 * 100.0).min(100.0);

    Ok(super::types::XPProgress {
        xp_today,
        xp_target,
        percentage,
        streak_count: streak.current_streak,
        freeze_days_remaining: streak.freeze_days_remaining,
    })
}

/// Set notification preferences for a goal.
pub fn set_goal_notification(
    conn: &Connection,
    goal_id: &str,
    notify_at: Option<&str>,
    enabled: bool,
) -> Result<(), String> {
    conn.execute(
        "UPDATE goals SET notify_at = ?1, notify_enabled = ?2 WHERE id = ?3",
        rusqlite::params![notify_at, enabled as i32, goal_id],
    )
    .map_err(|e| format!("Set notification: {e}"))?;
    Ok(())
}

// ── Internal Helpers ─────────────────────────────────────

fn get_current_streak(conn: &Connection) -> Result<StreakInfo, String> {
    conn.query_row(
        "SELECT current_streak, longest_streak, last_activity_date,
                COALESCE(freeze_days_remaining, 1), COALESCE(freeze_days_per_week, 1),
                freeze_last_reset, COALESCE(daily_xp_target, 50)
         FROM streaks ORDER BY rowid LIMIT 1",
        [],
        |row| {
            Ok(StreakInfo {
                current_streak: row.get(0)?,
                longest_streak: row.get(1)?,
                last_activity_date: row.get(2)?,
                freeze_days_remaining: row.get(3)?,
                freeze_days_per_week: row.get(4)?,
                freeze_last_reset: row.get(5)?,
                daily_xp_target: row.get(6)?,
            })
        },
    )
    .map_err(|_| {
        // No streak record exists yet — return defaults
        "No streak record".to_string()
    })
    .or_else(|_| {
        Ok(StreakInfo {
            current_streak: 0,
            longest_streak: 0,
            last_activity_date: None,
            freeze_days_remaining: 1,
            freeze_days_per_week: 1,
            freeze_last_reset: None,
            daily_xp_target: 50,
        })
    })
}

fn days_between(from: &str, to: &str) -> i64 {
    let parse = |s: &str| {
        chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
            .unwrap_or_else(|_| chrono::Local::now().date_naive())
    };
    let d1 = parse(from);
    let d2 = parse(to);
    (d2 - d1).num_days().abs()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE streaks (
                current_streak INTEGER NOT NULL DEFAULT 0,
                longest_streak INTEGER NOT NULL DEFAULT 0,
                last_activity_date TEXT,
                freeze_days_remaining INTEGER NOT NULL DEFAULT 1,
                freeze_days_per_week INTEGER NOT NULL DEFAULT 1,
                freeze_last_reset TEXT,
                daily_xp_target INTEGER NOT NULL DEFAULT 50
            );
            CREATE TABLE xp_log (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                module TEXT NOT NULL DEFAULT '',
                action TEXT NOT NULL DEFAULT '',
                xp_amount INTEGER NOT NULL DEFAULT 0,
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO streaks
                (current_streak, longest_streak, freeze_days_remaining, freeze_days_per_week, daily_xp_target)
            VALUES (0, 0, 2, 2, 50);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_days_between_same_day() {
        assert_eq!(days_between("2024-01-01", "2024-01-01"), 0);
    }

    #[test]
    fn test_days_between_one_day() {
        assert_eq!(days_between("2024-01-01", "2024-01-02"), 1);
    }

    #[test]
    fn test_days_between_is_absolute_value() {
        // Reversed order should still give positive result
        assert_eq!(days_between("2024-01-10", "2024-01-01"), 9);
    }

    #[test]
    fn test_days_between_across_month_boundary() {
        assert_eq!(days_between("2024-01-31", "2024-02-01"), 1);
    }

    #[test]
    fn test_set_freeze_config_clamps_above_max() {
        let conn = setup();
        set_freeze_config(&conn, 10).unwrap();
        let stored: i64 = conn
            .query_row("SELECT freeze_days_per_week FROM streaks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, 3);
    }

    #[test]
    fn test_set_freeze_config_clamps_below_min() {
        let conn = setup();
        set_freeze_config(&conn, -5).unwrap();
        let stored: i64 = conn
            .query_row("SELECT freeze_days_per_week FROM streaks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, 0);
    }

    #[test]
    fn test_set_freeze_config_stores_valid_value() {
        let conn = setup();
        set_freeze_config(&conn, 2).unwrap();
        let stored: i64 = conn
            .query_row("SELECT freeze_days_per_week FROM streaks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, 2);
    }

    #[test]
    fn test_set_xp_target_clamps_above_max() {
        let conn = setup();
        set_xp_target(&conn, 1000).unwrap();
        let stored: i64 = conn
            .query_row("SELECT daily_xp_target FROM streaks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, 500);
    }

    #[test]
    fn test_set_xp_target_clamps_below_min() {
        let conn = setup();
        set_xp_target(&conn, 0).unwrap();
        let stored: i64 = conn
            .query_row("SELECT daily_xp_target FROM streaks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, 10);
    }

    #[test]
    fn test_set_xp_target_stores_valid_value() {
        let conn = setup();
        set_xp_target(&conn, 100).unwrap();
        let stored: i64 = conn
            .query_row("SELECT daily_xp_target FROM streaks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, 100);
    }

    #[test]
    fn test_use_freeze_decrements_remaining() {
        let conn = setup(); // starts with freeze_days_remaining = 2
        use_freeze(&conn).unwrap();
        let remaining: i64 = conn
            .query_row("SELECT freeze_days_remaining FROM streaks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 1);
    }

    #[test]
    fn test_use_freeze_fails_when_zero_remaining() {
        let conn = setup();
        conn.execute("UPDATE streaks SET freeze_days_remaining = 0", [])
            .unwrap();
        let result = use_freeze(&conn);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No freeze days remaining"));
    }

    #[test]
    fn test_get_xp_progress_zero_when_no_log() {
        let conn = setup();
        let progress = get_xp_progress(&conn).unwrap();
        assert_eq!(progress.xp_today, 0);
        assert_eq!(progress.xp_target, 50);
        assert_eq!(progress.percentage, 0.0);
    }

    #[test]
    fn test_get_xp_progress_sums_todays_xp() {
        let conn = setup();
        conn.execute(
            "INSERT INTO xp_log (id, module, action, xp_amount, created_at)
             VALUES ('1', 'review', 'session', 30, datetime('now'))",
            [],
        )
        .unwrap();
        let progress = get_xp_progress(&conn).unwrap();
        assert_eq!(progress.xp_today, 30);
        let expected_pct = (30.0_f64 / 50.0 * 100.0).min(100.0);
        assert!((progress.percentage - expected_pct).abs() < 0.01);
    }
}

/// Reset freeze days at the start of each week (Monday).
fn maybe_reset_weekly_freezes(conn: &Connection) -> Result<(), String> {
    let today = chrono::Local::now();
    if today.weekday() != chrono::Weekday::Mon {
        return Ok(());
    }

    let today_str = today.format("%Y-%m-%d").to_string();
    // Only reset once per Monday
    let last_reset: Option<String> = conn
        .query_row(
            "SELECT freeze_last_reset FROM streaks ORDER BY rowid LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(None);

    if last_reset.as_deref() != Some(&today_str) {
        conn.execute(
            "UPDATE streaks SET freeze_days_remaining = freeze_days_per_week, freeze_last_reset = ?1 WHERE rowid = (SELECT MIN(rowid) FROM streaks)",
            rusqlite::params![today_str],
        )
        .map_err(|e| format!("Freeze reset: {e}"))?;
    }
    Ok(())
}
