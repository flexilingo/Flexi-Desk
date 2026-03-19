use rusqlite::Connection;

use super::types::*;

// ── XP History ──────────────────────────────────────────

pub fn get_xp_history(conn: &Connection, days: i64) -> Result<Vec<DailyXP>, String> {
    let cutoff = format!("-{days} days");
    let mut stmt = conn
        .prepare(
            "SELECT date(created_at) as d, module, SUM(xp_amount)
             FROM xp_log
             WHERE created_at >= datetime('now', ?1)
             GROUP BY d, module
             ORDER BY d",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![cutoff], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut date_map: std::collections::BTreeMap<String, Vec<ModuleXP>> =
        std::collections::BTreeMap::new();

    for row in rows {
        let (date, module, xp) = row.map_err(|e| format!("Row error: {e}"))?;
        date_map
            .entry(date)
            .or_default()
            .push(ModuleXP { module, xp });
    }

    Ok(date_map
        .into_iter()
        .map(|(date, breakdown)| {
            let total_xp = breakdown.iter().map(|b| b.xp).sum();
            DailyXP {
                date,
                total_xp,
                breakdown,
            }
        })
        .collect())
}

// ── CEFR Radar ──────────────────────────────────────────

pub fn get_cefr_radar(conn: &Connection) -> Result<Vec<CEFRSkillScore>, String> {
    let reading = calc_reading_score(conn);
    let writing = calc_writing_score(conn);
    let listening = calc_listening_score(conn);
    let speaking = calc_speaking_score(conn);
    let vocab = calc_vocabulary_score(conn);
    let grammar = calc_grammar_score(conn);

    Ok(vec![
        CEFRSkillScore {
            skill: "Reading".into(),
            score: reading,
            cefr_level: score_to_cefr(reading),
        },
        CEFRSkillScore {
            skill: "Writing".into(),
            score: writing,
            cefr_level: score_to_cefr(writing),
        },
        CEFRSkillScore {
            skill: "Listening".into(),
            score: listening,
            cefr_level: score_to_cefr(listening),
        },
        CEFRSkillScore {
            skill: "Speaking".into(),
            score: speaking,
            cefr_level: score_to_cefr(speaking),
        },
        CEFRSkillScore {
            skill: "Vocabulary".into(),
            score: vocab,
            cefr_level: score_to_cefr(vocab),
        },
        CEFRSkillScore {
            skill: "Grammar".into(),
            score: grammar,
            cefr_level: score_to_cefr(grammar),
        },
    ])
}

fn score_to_cefr(score: f64) -> String {
    match score as u64 {
        0..=16 => "A1",
        17..=33 => "A2",
        34..=50 => "B1",
        51..=67 => "B2",
        68..=84 => "C1",
        _ => "C2",
    }
    .to_string()
}

fn calc_reading_score(conn: &Connection) -> f64 {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM reading_documents WHERE progress > 0.5",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    (count as f64 * 5.0).min(100.0)
}

fn calc_writing_score(conn: &Connection) -> f64 {
    let avg: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(overall_score), 0) FROM writing_sessions WHERE status = 'scored'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0.0);
    (avg * 100.0).min(100.0)
}

fn calc_listening_score(conn: &Connection) -> f64 {
    let caption_mins: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(duration_seconds), 0) FROM caption_sessions WHERE status = 'completed'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        / 60;
    let podcast_mins: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(play_position), 0) FROM podcast_episodes",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0)
        / 60;
    let total = caption_mins + podcast_mins;
    (total as f64 / 10.0).min(100.0)
}

fn calc_speaking_score(conn: &Connection) -> f64 {
    let avg: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(overall_score), 0) FROM pronunciation_sessions WHERE overall_score IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0.0);
    (avg * 100.0).min(100.0)
}

fn calc_vocabulary_score(conn: &Connection) -> f64 {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM vocabulary", [], |row| row.get(0))
        .unwrap_or(0);
    (count as f64 / 10.0).min(100.0)
}

fn calc_grammar_score(conn: &Connection) -> f64 {
    let writing_avg: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(grammar_score), 0) FROM writing_sessions WHERE grammar_score IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0.0);
    (writing_avg * 100.0).min(100.0)
}

// ── Study Heatmap ───────────────────────────────────────

pub fn get_study_heatmap(conn: &Connection, days: i64) -> Result<Vec<StudyHeatmapEntry>, String> {
    let cutoff = format!("-{days} days");
    let mut stmt = conn
        .prepare(
            "SELECT
                CAST(strftime('%w', created_at) AS INTEGER) as dow,
                CAST(strftime('%H', created_at) AS INTEGER) as hour,
                COUNT(*) as cnt
             FROM activity_log
             WHERE created_at >= datetime('now', ?1)
             GROUP BY dow, hour",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![cutoff], |row| {
            let sqlite_dow: u8 = row.get(0)?; // 0=Sunday in SQLite
            // Convert to 0=Monday
            let day_of_week = if sqlite_dow == 0 { 6 } else { sqlite_dow - 1 };
            Ok(StudyHeatmapEntry {
                day_of_week,
                hour: row.get(1)?,
                minutes: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("Row error: {e}"))?);
    }
    Ok(entries)
}

// ── Vocab Growth ────────────────────────────────────────

pub fn get_vocab_growth(conn: &Connection, days: i64) -> Result<Vec<VocabGrowthPoint>, String> {
    let cutoff = format!("-{days} days");

    // Get count before the window
    let baseline: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM vocabulary WHERE created_at < datetime('now', ?1)",
            rusqlite::params![cutoff],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT date(created_at) as d, COUNT(*) as cnt
             FROM vocabulary
             WHERE created_at >= datetime('now', ?1)
             GROUP BY d
             ORDER BY d",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![cutoff], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut cumulative = baseline;
    let mut points = Vec::new();
    for row in rows {
        let (date, count) = row.map_err(|e| format!("Row error: {e}"))?;
        cumulative += count;
        points.push(VocabGrowthPoint {
            date,
            cumulative_count: cumulative,
        });
    }
    Ok(points)
}

// ── Streak Calendar ─────────────────────────────────────

pub fn get_streak_calendar(conn: &Connection, days: i64) -> Result<Vec<StreakDay>, String> {
    let cutoff = format!("-{days} days");
    let mut stmt = conn
        .prepare(
            "SELECT date(created_at) as d, COUNT(*) as cnt
             FROM activity_log
             WHERE created_at >= datetime('now', ?1)
             GROUP BY d
             ORDER BY d",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let activity_rows = stmt
        .query_map(rusqlite::params![cutoff], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut activity_map: std::collections::HashMap<String, i64> =
        std::collections::HashMap::new();
    for row in activity_rows {
        let (date, count) = row.map_err(|e| format!("Row error: {e}"))?;
        activity_map.insert(date, count);
    }

    // XP per day
    let mut xp_stmt = conn
        .prepare(
            "SELECT date(created_at) as d, SUM(xp_amount)
             FROM xp_log
             WHERE created_at >= datetime('now', ?1)
             GROUP BY d",
        )
        .map_err(|e| format!("XP query error: {e}"))?;

    let xp_rows = xp_stmt
        .query_map(rusqlite::params![cutoff], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("Query error: {e}"))?;

    let mut xp_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for row in xp_rows {
        let (date, xp) = row.map_err(|e| format!("Row error: {e}"))?;
        xp_map.insert(date, xp);
    }

    // Build full calendar
    let today = chrono::Local::now().date_naive();
    let mut result = Vec::new();
    for i in (0..days).rev() {
        let date = today - chrono::Duration::days(i);
        let date_str = date.format("%Y-%m-%d").to_string();
        result.push(StreakDay {
            activity_count: *activity_map.get(&date_str).unwrap_or(&0),
            xp_earned: *xp_map.get(&date_str).unwrap_or(&0),
            date: date_str,
        });
    }
    Ok(result)
}

// ── Analytics Summary ───────────────────────────────────

pub fn get_analytics_summary(conn: &Connection) -> Result<AnalyticsSummary, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let xp_today: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(xp_amount), 0) FROM xp_log WHERE date(created_at) = ?1",
            rusqlite::params![today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let streak_count: i64 = conn
        .query_row(
            "SELECT COALESCE(current_streak, 0) FROM streaks LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let words_learned_today: i64 = conn
        .query_row(
            "SELECT COALESCE(words_learned, 0) FROM daily_stats WHERE date = ?1",
            rusqlite::params![today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let study_minutes_today: i64 = conn
        .query_row(
            "SELECT COALESCE(study_minutes, 0) FROM daily_stats WHERE date = ?1",
            rusqlite::params![today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let reviews_today: i64 = conn
        .query_row(
            "SELECT COALESCE(reviews_completed, 0) FROM daily_stats WHERE date = ?1",
            rusqlite::params![today],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(AnalyticsSummary {
        xp_today,
        streak_count,
        words_learned_today,
        study_minutes_today,
        reviews_today,
    })
}

// ── Log XP ──────────────────────────────────────────────

pub fn log_xp(
    conn: &Connection,
    module: &str,
    action: &str,
    xp_amount: i64,
    metadata: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO xp_log (id, module, action, xp_amount, metadata)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4)",
        rusqlite::params![module, action, xp_amount, metadata],
    )
    .map_err(|e| format!("Insert XP: {e}"))?;
    Ok(())
}
