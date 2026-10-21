// =============================================================================
// Study engine — Tauri commands (local reimplementation of practice-session)
// =============================================================================
// Orchestrates get-config / update-config / get-daily-plan / regenerate-plan /
// start / next-activity / submit-activity / end / deck-status against the local
// SQLite DB, reusing the pure logic in `crate::study::*` and desk's SRS engine
// (`crate::srs`). Single-user local DB → user_id is the constant "local".
// Ported from flexi-lingo-core/functions/practice-session/services/*.
// =============================================================================

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use tauri::State;

use crate::ai::json_extractor::extract_json;
use crate::ai::prompts::{study_content, study_grading};
use crate::ai::provider::{chat_completion, read_ai_settings, AiSettings};
use crate::srs::strategy::create_strategy;
use crate::srs::types::{Algorithm, CardProgress, CardState, Rating};
use crate::study::config::{build_default_config, preset_activities, preset_weights, LOCAL_USER};
use crate::study::constants::{score_to_confidence, SRS_WRITE_THRESHOLD};
use crate::study::plan_builder::{build_daily_plan, BuildPlanArgs, DeckMetaInput, DueCardInput};
use crate::study::proficiency::{apply_result, self_rating_to_evidence, ApplyResultInput};
use crate::study::types::*;
use crate::AppState;

type Conn = rusqlite::Connection;

// ── Helpers ─────────────────────────────────────────────────

fn lock_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| format!("DB lock error: {e}"))
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn today_str() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
}

fn from_json<T: serde::de::DeserializeOwned>(s: &str, fallback: T) -> T {
    serde_json::from_str(s).unwrap_or(fallback)
}

fn setting(conn: &Conn, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        rusqlite::params![key],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .filter(|v| !v.trim().is_empty())
}

/// Whether a model is configured for content generation + sentence grading.
/// Ollama needs no key — if it isn't actually running the call fails fast and the
/// payload builder degrades to recall, which is the intended offline behaviour.
fn ai_available(conn: &Conn, config: &PracticeConfig) -> bool {
    if !config.use_ai_grading {
        return false;
    }
    let s = read_ai_settings(conn);
    if s.provider == "ollama" {
        true
    } else {
        s.api_key.is_some()
    }
}

/// Local TTS: the OS voice on macOS, or cloud TTS when an OpenAI key is set.
/// Gates whether `listen_again` can be served without a captured audio clip.
fn tts_available(conn: &Conn) -> bool {
    cfg!(target_os = "macos") || setting(conn, "openai_api_key").is_some()
}

/// Deck language (used as the learning language in generation prompts).
fn deck_language(conn: &Conn, card_id: &str) -> String {
    conn.query_row(
        "SELECT d.language FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.id = ?1",
        rusqlite::params![card_id],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "en".to_string())
}

// ── Response envelopes (mirror the front's practiceSessionApi types) ────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRow {
    pub id: String,
    pub user_id: String,
    pub preset: String,
    pub enabled_activities: Vec<ActivityType>,
    pub deck_strategy: String,
    pub deck_ids: Vec<String>,
    pub goal_minutes: Option<i64>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub total_seconds: Option<i64>,
    pub activities_total: i64,
    pub activities_correct: i64,
    pub status: String,
    pub card_queue: Option<Vec<PlanItem>>,
    pub consumed_count: i64,
    pub estimated_minutes: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyPlanOut {
    pub user_id: String,
    pub plan_date: String,
    pub card_queue: Vec<PlanItem>,
    pub total_cards: i64,
    pub estimated_minutes: i64,
    pub config_snapshot: Option<PracticeConfig>,
    pub generated_at: String,
    pub consumed_at: Option<String>,
    pub consumed_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PracticeActivityOut {
    pub id: String,
    pub session_id: String,
    pub user_id: String,
    pub card_id: Option<String>,
    pub related_card_ids: Vec<String>,
    pub activity_type: ActivityType,
    pub prompt_payload: ActivityPromptPayload,
    pub template_id: Option<String>,
    pub user_response: Option<String>,
    pub user_audio_url: Option<String>,
    pub response_time_ms: Option<i64>,
    pub is_correct: Option<bool>,
    pub score: Option<f64>,
    pub ai_feedback: Option<String>,
    pub affected_dimensions: Vec<ProficiencyDimension>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CardMetaOut {
    pub card_id: String,
    pub front_text: String,
    pub back_text: String,
    pub deck_id: String,
    pub deck_title: String,
    pub notes: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct CardProgressSnapshot {
    pub leitner_box: Option<i64>,
    pub easiness_factor: Option<f64>,
    pub sm2_interval: Option<f64>,
    pub sm2_repetitions: Option<i64>,
    pub fsrs_stability: Option<f64>,
    pub fsrs_difficulty: Option<f64>,
    pub fsrs_state: Option<String>,
    pub last_reviewed: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NextActivityResponse {
    pub activity: PracticeActivityOut,
    pub card_meta: Option<CardMetaOut>,
    pub srs_algorithm: String,
    pub card_progress: Option<CardProgressSnapshot>,
    pub requeue_count: i64,
    pub remaining: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeckCount {
    pub deck_id: String,
    pub deck_title: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SrsStats {
    pub promotions: i64,
    pub demotions: i64,
    pub newly_mastered: i64,
    pub dues_reviewed: i64,
    pub new_learned: i64,
    pub tomorrow_forecast: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionSummaryResponse {
    pub session: SessionRow,
    pub per_dimension_delta: HashMap<String, f64>,
    pub per_deck_counts: Vec<DeckCount>,
    pub recommendations: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub srs_stats: Option<SrsStats>,
    /// XP awarded for this session (also written to `xp_log` for the dashboard).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub xp_earned: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeckStatus {
    pub user_id: String,
    pub deck_id: String,
    pub deck_title: String,
    pub total_cards: i64,
    pub leech_count: i64,
    pub mature_count: i64,
    pub new_count: i64,
    pub due_count: i64,
    pub untouched_count: i64,
    pub last_practiced_at: Option<String>,
    pub days_since_practice: Option<f64>,
    pub avg_recognition: Option<f64>,
    pub avg_recall: Option<f64>,
    pub avg_production: Option<f64>,
    pub avg_listening: Option<f64>,
    pub avg_pronunciation: Option<f64>,
    pub health_status: String,
    pub weekly_coverage_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConfigResponse {
    pub config: PracticeConfig,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlanResponse {
    pub plan: DailyPlanOut,
}

#[derive(Debug, Clone, Serialize)]
pub struct StartResponse {
    pub session: SessionRow,
    pub plan: DailyPlanOut,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeckStatusResponse {
    pub decks: Vec<DeckStatus>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubmitResponse {
    pub activity: PracticeActivityOut,
    pub proficiency: CardProficiency,
    pub coaching: Option<serde_json::Value>,
}

// ── Config ──────────────────────────────────────────────────

fn read_config(conn: &Conn) -> Result<PracticeConfig, String> {
    // Ensure a config row exists (full default, incl. stage_overrides).
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pr_practice_config WHERE id = 'default'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("config check: {e}"))?;
    if exists == 0 {
        let d = build_default_config(&now_iso());
        write_config_row(conn, &d)?;
    }

    conn.query_row(
        "SELECT preset, enabled_activities, activity_weights, stage_overrides, daily_minutes, goal,
                always_show_translation, auto_pronounce, reverse_card, use_listen_again,
                use_ai_grading, deck_strategy, deck_weights, active_deck_id, focus,
                created_at, updated_at
         FROM pr_practice_config WHERE id = 'default'",
        [],
        |row| {
            let enabled: String = row.get(1)?;
            let weights: String = row.get(2)?;
            let overrides: String = row.get(3)?;
            let deck_weights: String = row.get(12)?;
            Ok(PracticeConfig {
                user_id: LOCAL_USER.to_string(),
                preset: row.get(0)?,
                enabled_activities: from_json(&enabled, Vec::new()),
                activity_weights: from_json(&weights, HashMap::new()),
                stage_overrides: from_json(&overrides, HashMap::new()),
                daily_minutes: row.get(4)?,
                goal: row.get(5)?,
                always_show_translation: row.get::<_, i64>(6)? != 0,
                auto_pronounce: row.get::<_, i64>(7)? != 0,
                reverse_card: row.get::<_, i64>(8)? != 0,
                use_listen_again: row.get::<_, i64>(9)? != 0,
                use_ai_grading: row.get::<_, i64>(10)? != 0,
                deck_strategy: DeckStrategy::from_str_lenient(&row.get::<_, String>(11)?),
                deck_weights: from_json(&deck_weights, HashMap::new()),
                active_deck_id: row.get(13)?,
                focus: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        },
    )
    .map_err(|e| format!("read config: {e}"))
}

fn write_config_row(conn: &Conn, c: &PracticeConfig) -> Result<(), String> {
    conn.execute(
        "INSERT INTO pr_practice_config
            (id, preset, enabled_activities, activity_weights, stage_overrides, daily_minutes,
             goal, always_show_translation, auto_pronounce, reverse_card, use_listen_again,
             use_ai_grading, deck_strategy, deck_weights, active_deck_id, focus, created_at, updated_at)
         VALUES ('default', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
         ON CONFLICT(id) DO UPDATE SET
            preset=?1, enabled_activities=?2, activity_weights=?3, stage_overrides=?4,
            daily_minutes=?5, goal=?6, always_show_translation=?7, auto_pronounce=?8,
            reverse_card=?9, use_listen_again=?10, use_ai_grading=?11, deck_strategy=?12,
            deck_weights=?13, active_deck_id=?14, focus=?15, updated_at=?17",
        rusqlite::params![
            c.preset,
            serde_json::to_string(&c.enabled_activities).unwrap_or_else(|_| "[]".into()),
            serde_json::to_string(&c.activity_weights).unwrap_or_else(|_| "{}".into()),
            serde_json::to_string(&c.stage_overrides).unwrap_or_else(|_| "{}".into()),
            c.daily_minutes,
            c.goal,
            c.always_show_translation as i64,
            c.auto_pronounce as i64,
            c.reverse_card as i64,
            c.use_listen_again as i64,
            c.use_ai_grading as i64,
            c.deck_strategy.as_str(),
            serde_json::to_string(&c.deck_weights).unwrap_or_else(|_| "{}".into()),
            c.active_deck_id,
            c.focus,
            c.created_at,
            c.updated_at,
        ],
    )
    .map_err(|e| format!("write config: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn study_get_config(state: State<'_, AppState>) -> Result<ConfigResponse, String> {
    let conn = lock_db(&state)?;
    Ok(ConfigResponse {
        config: read_config(&conn)?,
    })
}

/// Patch body — every field optional (mirrors UpdateConfigRequest).
#[derive(Debug, Default, Deserialize)]
pub struct UpdateConfigBody {
    pub preset: Option<String>,
    pub enabled_activities: Option<Vec<ActivityType>>,
    pub activity_weights: Option<HashMap<ActivityType, f64>>,
    pub stage_overrides: Option<StageOverrides>,
    pub daily_minutes: Option<i64>,
    pub goal: Option<String>,
    pub always_show_translation: Option<bool>,
    pub auto_pronounce: Option<bool>,
    pub reverse_card: Option<bool>,
    pub use_listen_again: Option<bool>,
    pub use_ai_grading: Option<bool>,
    pub deck_strategy: Option<String>,
    pub deck_weights: Option<HashMap<String, f64>>,
    // `active_deck_id` can be explicitly set to null; represented as Some(None).
    #[serde(default, deserialize_with = "double_option")]
    pub active_deck_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub focus: Option<Option<String>>,
}

/// Distinguish "field absent" from "field present but null".
fn double_option<'de, D, T>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    Ok(Some(Option::deserialize(de)?))
}

#[tauri::command]
pub fn study_update_config(
    state: State<'_, AppState>,
    patch: UpdateConfigBody,
) -> Result<ConfigResponse, String> {
    let conn = lock_db(&state)?;
    let mut cfg = read_config(&conn)?;
    let prev = cfg.clone();

    // Capture presence flags before any field is moved out of `patch`.
    let had_enabled = patch.enabled_activities.is_some();
    let had_weights = patch.activity_weights.is_some();
    let had_deck_weights = patch.deck_weights.is_some();
    let had_daily_minutes = patch.daily_minutes.is_some();
    let had_deck_strategy = patch.deck_strategy.is_some();
    let had_active_deck = patch.active_deck_id.is_some();
    let had_preset = patch.preset.is_some();

    // Preset switch to a non-custom value prefills activities + weights (caller wins).
    if let Some(p) = &patch.preset {
        if p != "custom" && *p != cfg.preset {
            if patch.enabled_activities.is_none() {
                cfg.enabled_activities = preset_activities(p);
            }
            if patch.activity_weights.is_none() {
                cfg.activity_weights = preset_weights(p);
            }
        }
        cfg.preset = p.clone();
    }

    // Manual edit of activities/weights (without a preset in the patch) → custom.
    if patch.preset.is_none()
        && (patch.enabled_activities.is_some() || patch.activity_weights.is_some())
    {
        cfg.preset = "custom".to_string();
    }

    if let Some(v) = patch.enabled_activities {
        cfg.enabled_activities = v;
    }
    if let Some(v) = patch.activity_weights {
        cfg.activity_weights = v;
    }
    if let Some(v) = patch.stage_overrides {
        cfg.stage_overrides = v;
    }
    if let Some(v) = patch.daily_minutes {
        cfg.daily_minutes = v;
    }
    if let Some(v) = patch.goal {
        cfg.goal = v;
    }
    if let Some(v) = patch.always_show_translation {
        cfg.always_show_translation = v;
    }
    if let Some(v) = patch.auto_pronounce {
        cfg.auto_pronounce = v;
    }
    if let Some(v) = patch.reverse_card {
        cfg.reverse_card = v;
    }
    if let Some(v) = patch.use_listen_again {
        cfg.use_listen_again = v;
    }
    if let Some(v) = patch.use_ai_grading {
        cfg.use_ai_grading = v;
    }
    if let Some(v) = &patch.deck_strategy {
        cfg.deck_strategy = DeckStrategy::from_str_lenient(v);
    }
    if let Some(v) = patch.deck_weights.clone() {
        cfg.deck_weights = v;
    }
    if let Some(v) = patch.active_deck_id.clone() {
        cfg.active_deck_id = v;
    }
    if let Some(v) = patch.focus.clone() {
        cfg.focus = v;
    }
    cfg.updated_at = now_iso();
    write_config_row(&conn, &cfg)?;

    // Plan invalidation on plan-affecting changes.
    let plan_affecting = (had_daily_minutes && cfg.daily_minutes != prev.daily_minutes)
        || (had_deck_strategy && cfg.deck_strategy != prev.deck_strategy)
        || (had_active_deck && cfg.active_deck_id != prev.active_deck_id)
        || had_deck_weights
        || had_enabled
        || had_weights
        || (had_preset && cfg.preset != prev.preset);
    if plan_affecting {
        conn.execute(
            "DELETE FROM pr_daily_plan WHERE plan_date = ?1",
            rusqlite::params![today_str()],
        )
        .ok();
    }

    Ok(ConfigResponse { config: cfg })
}

// ── Card pools (local equivalents of srs-bridge) ────────────

fn deck_filter_clause(deck_ids: &Option<Vec<String>>) -> (String, Vec<String>) {
    match deck_ids {
        Some(ids) if !ids.is_empty() => {
            let placeholders: Vec<String> =
                (0..ids.len()).map(|i| format!("?{}", i + 1)).collect();
            (
                format!("AND dc.deck_id IN ({})", placeholders.join(",")),
                ids.clone(),
            )
        }
        _ => (String::new(), Vec::new()),
    }
}

fn params_from(strings: &[String]) -> Vec<&dyn rusqlite::types::ToSql> {
    strings.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect()
}

/// Due cards: scheduled and due now (state != 'new').
fn get_due_cards(conn: &Conn, deck_ids: &Option<Vec<String>>) -> Result<Vec<DueCardInput>, String> {
    let (clause, ids) = deck_filter_clause(deck_ids);
    let sql = format!(
        "SELECT dc.id, dc.deck_id,
                julianday('now') - julianday(sp.due_date) AS days_overdue,
                COALESCE(pr.learning_stage = 'leech', 0) OR sp.lapses >= 4 AS is_leech
         FROM deck_cards dc
         JOIN srs_progress sp ON sp.card_id = dc.id
         LEFT JOIN pr_card_proficiency pr ON pr.card_id = dc.id
         WHERE sp.due_date <= datetime('now') AND sp.state != 'new' {clause}
         ORDER BY days_overdue DESC
         LIMIT 300"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("due query: {e}"))?;
    let rows = stmt
        .query_map(params_from(&ids).as_slice(), |row| {
            Ok(DueCardInput {
                card_id: row.get(0)?,
                deck_id: row.get(1)?,
                days_overdue: row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
                is_leech: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| format!("due map: {e}"))?;
    collect(rows)
}

/// New cards: never scheduled (no srs_progress row) or state = 'new'.
fn get_new_cards(
    conn: &Conn,
    deck_ids: &Option<Vec<String>>,
    limit: i64,
) -> Result<Vec<DueCardInput>, String> {
    let (clause, mut ids) = deck_filter_clause(deck_ids);
    let limit_ph = format!("?{}", ids.len() + 1);
    let sql = format!(
        "SELECT dc.id, dc.deck_id
         FROM deck_cards dc
         LEFT JOIN srs_progress sp ON sp.card_id = dc.id
         WHERE (sp.card_id IS NULL OR sp.state = 'new') {clause}
         ORDER BY dc.added_at ASC
         LIMIT {limit_ph}"
    );
    ids.push(limit.to_string());
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("new query: {e}"))?;
    let rows = stmt
        .query_map(params_from(&ids).as_slice(), |row| {
            Ok(DueCardInput {
                card_id: row.get(0)?,
                deck_id: row.get(1)?,
                days_overdue: 0.0,
                is_leech: false,
            })
        })
        .map_err(|e| format!("new map: {e}"))?;
    collect(rows)
}

/// Upcoming cards: scheduled for the future (study-ahead only).
fn get_upcoming_cards(
    conn: &Conn,
    deck_ids: &Option<Vec<String>>,
    limit: i64,
) -> Result<Vec<DueCardInput>, String> {
    let (clause, mut ids) = deck_filter_clause(deck_ids);
    let limit_ph = format!("?{}", ids.len() + 1);
    let sql = format!(
        "SELECT dc.id, dc.deck_id
         FROM deck_cards dc
         JOIN srs_progress sp ON sp.card_id = dc.id
         WHERE sp.due_date > datetime('now') AND sp.state != 'new' {clause}
         ORDER BY sp.due_date ASC
         LIMIT {limit_ph}"
    );
    ids.push(limit.to_string());
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("upcoming query: {e}"))?;
    let rows = stmt
        .query_map(params_from(&ids).as_slice(), |row| {
            Ok(DueCardInput {
                card_id: row.get(0)?,
                deck_id: row.get(1)?,
                days_overdue: 0.0,
                is_leech: false,
            })
        })
        .map_err(|e| format!("upcoming map: {e}"))?;
    collect(rows)
}

/// Weak cards: lowest total proficiency across the 5 dimensions.
fn get_weak_cards(
    conn: &Conn,
    deck_ids: &Option<Vec<String>>,
    limit: i64,
) -> Result<Vec<DueCardInput>, String> {
    let (clause_raw, mut ids) = deck_filter_clause(deck_ids);
    // clause references dc.deck_id; pr_card_proficiency has deck_id too — rewrite.
    let clause = clause_raw.replace("dc.deck_id", "pr.deck_id");
    let limit_ph = format!("?{}", ids.len() + 1);
    let sql = format!(
        "SELECT pr.card_id, pr.deck_id,
                (pr.recognition_score + pr.recall_score + pr.listening_score +
                 pr.production_score + pr.pronunciation_score) AS total,
                pr.learning_stage
         FROM pr_card_proficiency pr
         JOIN deck_cards dc ON dc.id = pr.card_id
         WHERE 1=1 {clause}
         ORDER BY total ASC
         LIMIT {limit_ph}"
    );
    ids.push(limit.to_string());
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("weak query: {e}"))?;
    let rows = stmt
        .query_map(params_from(&ids).as_slice(), |row| {
            let stage: String = row.get(3)?;
            Ok(DueCardInput {
                card_id: row.get(0)?,
                deck_id: row.get(1)?,
                days_overdue: 0.0,
                is_leech: stage == "leech",
            })
        })
        .map_err(|e| format!("weak map: {e}"))?;
    collect(rows)
}

fn collect<T>(
    rows: impl Iterator<Item = rusqlite::Result<T>>,
) -> Result<Vec<T>, String> {
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

// ── Plan building ───────────────────────────────────────────

fn build_plan_items(
    conn: &Conn,
    config: &PracticeConfig,
    deck_ids_override: Option<Vec<String>>,
    study_ahead: bool,
    scope: Option<&str>,
) -> Result<(Vec<PlanItem>, i64), String> {
    let deck_ids: Option<Vec<String>> = deck_ids_override.or_else(|| {
        if config.deck_strategy == DeckStrategy::Isolated {
            config.active_deck_id.clone().map(|d| vec![d])
        } else {
            None
        }
    });

    let all_due: Vec<DueCardInput> = match scope {
        Some("weak") => get_weak_cards(conn, &deck_ids, if study_ahead { 200 } else { 50 })?,
        Some("new") => {
            get_new_cards(conn, &deck_ids, if study_ahead { 200 } else { 30 })?
        }
        _ => {
            let mut due = get_due_cards(conn, &deck_ids)?;
            let new = get_new_cards(conn, &deck_ids, if study_ahead { 200 } else { 30 })?;
            due.extend(new);
            if study_ahead {
                due.extend(get_upcoming_cards(conn, &deck_ids, 500)?);
            }
            due
        }
    };

    if all_due.is_empty() {
        return Ok((vec![], 0));
    }

    let card_ids: Vec<String> = all_due.iter().map(|c| c.card_id.clone()).collect();
    let proficiency_by_card = load_proficiency_map(conn, &card_ids)?;
    let has_audio_by_card = load_audio_map(conn, &card_ids, tts_available(conn))?;
    let template_available_by_card =
        load_activity_availability(conn, &card_ids, ai_available(conn, config))?;

    let deck_id_set: HashSet<String> = all_due.iter().map(|c| c.deck_id.clone()).collect();
    let deck_meta = load_deck_meta(conn, &deck_id_set)?;

    let result = build_daily_plan(BuildPlanArgs {
        config,
        due_cards: all_due,
        proficiency_by_card: &proficiency_by_card,
        has_audio_by_card: &has_audio_by_card,
        template_available_by_card: &template_available_by_card,
        deck_meta: &deck_meta,
        user_has_microphone: false,
        study_ahead,
    });
    Ok((result.items, result.estimated_minutes))
}

fn load_proficiency_map(
    conn: &Conn,
    card_ids: &[String],
) -> Result<HashMap<String, CardProficiency>, String> {
    let mut map = HashMap::new();
    if card_ids.is_empty() {
        return Ok(map);
    }
    let mut stmt = conn
        .prepare(
            "SELECT card_id, deck_id, recognition_score, recall_score, listening_score,
                    production_score, pronunciation_score, learning_stage,
                    consecutive_failures, total_attempts, last_practiced_at
             FROM pr_card_proficiency",
        )
        .map_err(|e| format!("prof query: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            let stage: String = row.get(7)?;
            Ok(CardProficiency {
                card_id: row.get(0)?,
                deck_id: row.get(1)?,
                recognition_score: row.get(2)?,
                recall_score: row.get(3)?,
                listening_score: row.get(4)?,
                production_score: row.get(5)?,
                pronunciation_score: row.get(6)?,
                learning_stage: LearningStage::from_str_lenient(&stage),
                consecutive_failures: row.get(8)?,
                total_attempts: row.get(9)?,
                last_practiced_at: row.get(10)?,
            })
        })
        .map_err(|e| format!("prof map: {e}"))?;
    let wanted: HashSet<&String> = card_ids.iter().collect();
    for r in rows {
        let p = r.map_err(|e| format!("prof row: {e}"))?;
        if wanted.contains(&p.card_id) {
            map.insert(p.card_id.clone(), p);
        }
    }
    Ok(map)
}

/// A card "has audio" when a real encounter clip exists, or when local TTS can
/// speak it. Without either, `listen_again` is never selected.
fn load_audio_map(
    conn: &Conn,
    card_ids: &[String],
    tts: bool,
) -> Result<HashMap<String, bool>, String> {
    let mut map = HashMap::new();
    let wanted: HashSet<&String> = card_ids.iter().collect();
    if tts {
        for id in card_ids {
            map.insert(id.clone(), true);
        }
    }
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT card_id FROM pr_card_encounter WHERE audio_clip_url IS NOT NULL",
        )
        .map_err(|e| format!("audio query: {e}"))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("audio map: {e}"))?;
    for r in rows {
        let id = r.map_err(|e| format!("audio row: {e}"))?;
        if wanted.contains(&id) {
            map.insert(id, true);
        }
    }
    Ok(map)
}

/// Which generative activities the serve step can produce content for, per card:
/// cached templates ∪ notes-derivable (cloze from an example sentence) ∪ everything
/// the local model can generate when AI is on. `use_in_sentence` needs no content.
fn load_activity_availability(
    conn: &Conn,
    card_ids: &[String],
    ai: bool,
) -> Result<HashMap<String, HashSet<ActivityType>>, String> {
    let mut map: HashMap<String, HashSet<ActivityType>> = HashMap::new();
    let wanted: HashSet<&String> = card_ids.iter().collect();

    if ai {
        for id in card_ids {
            let set = map.entry(id.clone()).or_default();
            set.insert(ActivityType::Cloze);
            set.insert(ActivityType::SynonymDiscrim);
            set.insert(ActivityType::MiniReading);
        }
    }

    // Cached templates.
    let mut stmt = conn
        .prepare("SELECT DISTINCT card_id, activity_type FROM pr_activity_template")
        .map_err(|e| format!("tpl query: {e}"))?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| format!("tpl map: {e}"))?;
    for r in rows {
        let (card_id, at) = r.map_err(|e| format!("tpl row: {e}"))?;
        if !wanted.contains(&card_id) {
            continue;
        }
        if let Ok(activity) = serde_json::from_value::<ActivityType>(json!(at)) {
            map.entry(card_id).or_default().insert(activity);
        }
    }

    // Notes-derivable cloze: the card carries at least one example sentence.
    let mut stmt = conn
        .prepare("SELECT id, notes FROM deck_cards WHERE notes IS NOT NULL")
        .map_err(|e| format!("notes query: {e}"))?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| format!("notes map: {e}"))?;
    for r in rows {
        let (card_id, notes) = r.map_err(|e| format!("notes row: {e}"))?;
        if !wanted.contains(&card_id) {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&notes) {
            if v.get("examples").and_then(|e| e.as_array()).is_some_and(|a| !a.is_empty()) {
                map.entry(card_id).or_default().insert(ActivityType::Cloze);
            }
        }
    }

    Ok(map)
}

fn load_deck_meta(
    conn: &Conn,
    deck_ids: &HashSet<String>,
) -> Result<HashMap<String, DeckMetaInput>, String> {
    let mut map = HashMap::new();
    if deck_ids.is_empty() {
        return Ok(map);
    }
    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.card_count,
                    julianday('now') - julianday(MAX(pr.last_practiced_at)) AS days_since
             FROM decks d
             LEFT JOIN pr_card_proficiency pr ON pr.deck_id = d.id
             GROUP BY d.id",
        )
        .map_err(|e| format!("deckmeta query: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<f64>>(2)?,
            ))
        })
        .map_err(|e| format!("deckmeta map: {e}"))?;
    for r in rows {
        let (id, total, days) = r.map_err(|e| format!("deckmeta row: {e}"))?;
        if deck_ids.contains(&id) {
            map.insert(
                id,
                DeckMetaInput {
                    total_cards: total,
                    days_since_practice: days.unwrap_or(0.0),
                },
            );
        }
    }
    Ok(map)
}

// ── get-daily-plan / regenerate-plan ────────────────────────

fn read_stored_plan(conn: &Conn, plan_date: &str) -> Result<Option<DailyPlanOut>, String> {
    conn.query_row(
        "SELECT card_queue, total_cards, estimated_minutes, config_snapshot,
                generated_at, consumed_at, consumed_count
         FROM pr_daily_plan WHERE plan_date = ?1",
        rusqlite::params![plan_date],
        |row| {
            let queue: String = row.get(0)?;
            let cfg: Option<String> = row.get(3)?;
            Ok(DailyPlanOut {
                user_id: LOCAL_USER.to_string(),
                plan_date: plan_date.to_string(),
                card_queue: from_json(&queue, Vec::new()),
                total_cards: row.get(1)?,
                estimated_minutes: row.get(2)?,
                config_snapshot: cfg.and_then(|s| serde_json::from_str(&s).ok()),
                generated_at: row.get(4)?,
                consumed_at: row.get(5)?,
                consumed_count: row.get(6)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| {
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            Ok(None)
        } else {
            Err(format!("read plan: {e}"))
        }
    })
}

fn build_and_store_plan(
    conn: &Conn,
    config: &PracticeConfig,
    plan_date: &str,
) -> Result<DailyPlanOut, String> {
    let (items, est) = build_plan_items(conn, config, None, false, None)?;
    let queue_json = serde_json::to_string(&items).unwrap_or_else(|_| "[]".into());
    let cfg_json = serde_json::to_string(config).ok();
    let generated_at = now_iso();
    conn.execute(
        "INSERT INTO pr_daily_plan
            (plan_date, card_queue, total_cards, estimated_minutes, config_snapshot, generated_at, consumed_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)
         ON CONFLICT(plan_date) DO UPDATE SET
            card_queue=?2, total_cards=?3, estimated_minutes=?4, config_snapshot=?5,
            generated_at=?6, consumed_count=0, consumed_at=NULL",
        rusqlite::params![
            plan_date,
            queue_json,
            items.len() as i64,
            est,
            cfg_json,
            generated_at,
        ],
    )
    .map_err(|e| format!("store plan: {e}"))?;
    Ok(DailyPlanOut {
        user_id: LOCAL_USER.to_string(),
        plan_date: plan_date.to_string(),
        card_queue: items.clone(),
        total_cards: items.len() as i64,
        estimated_minutes: est,
        config_snapshot: Some(config.clone()),
        generated_at,
        consumed_at: None,
        consumed_count: 0,
    })
}

fn daily_plan(conn: &Conn) -> Result<DailyPlanOut, String> {
    let plan_date = today_str();
    let mut plan = match read_stored_plan(conn, &plan_date)? {
        Some(p) => p,
        None => {
            let config = read_config(conn)?;
            build_and_store_plan(conn, &config, &plan_date)?
        }
    };

    // Reconcile consumed_count against per-session progress since plan generation.
    let session_consumed: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(consumed_count), 0) FROM pr_session
             WHERE card_queue IS NOT NULL AND started_at >= ?1",
            rusqlite::params![plan.generated_at],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let effective = plan.total_cards.min(plan.consumed_count.max(session_consumed));
    if effective > plan.consumed_count {
        plan.consumed_count = effective;
    }
    Ok(plan)
}

#[tauri::command]
pub fn study_get_daily_plan(state: State<'_, AppState>) -> Result<PlanResponse, String> {
    let conn = lock_db(&state)?;
    Ok(PlanResponse {
        plan: daily_plan(&conn)?,
    })
}

#[tauri::command]
pub fn study_regenerate_plan(state: State<'_, AppState>) -> Result<PlanResponse, String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "DELETE FROM pr_daily_plan WHERE plan_date = ?1",
        rusqlite::params![today_str()],
    )
    .ok();
    Ok(PlanResponse {
        plan: daily_plan(&conn)?,
    })
}

// ── start ───────────────────────────────────────────────────

#[derive(Debug, Default, Deserialize)]
pub struct StartBody {
    pub deck_ids: Option<Vec<String>>,
    pub goal_minutes: Option<i64>,
    pub study_ahead: Option<bool>,
    pub scope: Option<String>,
}

#[tauri::command]
pub fn study_start(
    state: State<'_, AppState>,
    body: Option<StartBody>,
) -> Result<StartResponse, String> {
    let conn = lock_db(&state)?;
    let opts = body.unwrap_or_default();
    let config = read_config(&conn)?;

    let (items, est) = build_plan_items(
        &conn,
        &config,
        opts.deck_ids.clone(),
        opts.study_ahead.unwrap_or(false),
        opts.scope.as_deref(),
    )?;

    let deck_ids: Vec<String> = opts.deck_ids.clone().unwrap_or_else(|| {
        let mut seen = HashSet::new();
        items
            .iter()
            .filter(|p| seen.insert(p.deck_id.clone()))
            .map(|p| p.deck_id.clone())
            .collect()
    });

    let id = uuid::Uuid::new_v4().to_string();
    let started_at = now_iso();
    let queue_json = serde_json::to_string(&items).unwrap_or_else(|_| "[]".into());
    let goal_minutes = opts.goal_minutes.unwrap_or(config.daily_minutes);

    conn.execute(
        "INSERT INTO pr_session
            (id, preset, enabled_activities, deck_strategy, deck_ids, goal_minutes,
             started_at, status, card_queue, consumed_count, estimated_minutes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, 0, ?9)",
        rusqlite::params![
            id,
            config.preset,
            serde_json::to_string(&config.enabled_activities).unwrap_or_else(|_| "[]".into()),
            config.deck_strategy.as_str(),
            serde_json::to_string(&deck_ids).unwrap_or_else(|_| "[]".into()),
            goal_minutes,
            started_at,
            queue_json,
            est,
        ],
    )
    .map_err(|e| format!("insert session: {e}"))?;

    let session = SessionRow {
        id: id.clone(),
        user_id: LOCAL_USER.to_string(),
        preset: config.preset.clone(),
        enabled_activities: config.enabled_activities.clone(),
        deck_strategy: config.deck_strategy.as_str().to_string(),
        deck_ids,
        goal_minutes: Some(goal_minutes),
        started_at: started_at.clone(),
        ended_at: None,
        total_seconds: None,
        activities_total: 0,
        activities_correct: 0,
        status: "active".to_string(),
        card_queue: Some(items.clone()),
        consumed_count: 0,
        estimated_minutes: Some(est),
    };

    let plan = DailyPlanOut {
        user_id: LOCAL_USER.to_string(),
        plan_date: today_str(),
        card_queue: items.clone(),
        total_cards: items.len() as i64,
        estimated_minutes: est,
        config_snapshot: Some(config),
        generated_at: started_at,
        consumed_at: None,
        consumed_count: 0,
    };

    Ok(StartResponse { session, plan })
}

// ── next-activity ───────────────────────────────────────────

fn fetch_card_meta(conn: &Conn, card_id: &str) -> Result<Option<CardMeta>, String> {
    let res = conn.query_row(
        "SELECT dc.id, dc.front, dc.back, dc.notes, dc.deck_id, d.name
         FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id
         WHERE dc.id = ?1",
        rusqlite::params![card_id],
        |row| {
            let notes: Option<String> = row.get(3)?;
            Ok(CardMeta {
                id: row.get(0)?,
                front_text: row.get(1)?,
                back_text: row.get(2)?,
                deck_id: row.get(4)?,
                deck_title: row.get(5)?,
                notes: notes.and_then(|s| serde_json::from_str(&s).ok()),
            })
        },
    );
    match res {
        Ok(m) => Ok(Some(m)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("card meta: {e}")),
    }
}

fn deck_algorithm(conn: &Conn, card_id: &str) -> String {
    conn.query_row(
        "SELECT d.algorithm FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.id = ?1",
        rusqlite::params![card_id],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "fsrs".to_string())
}

fn card_progress_snapshot(conn: &Conn, card_id: &str) -> Option<CardProgressSnapshot> {
    conn.query_row(
        "SELECT box_number, easiness_factor, repetitions, stability, difficulty, state, last_review
         FROM srs_progress WHERE card_id = ?1",
        rusqlite::params![card_id],
        |row| {
            Ok(CardProgressSnapshot {
                leitner_box: row.get(0)?,
                easiness_factor: row.get(1)?,
                sm2_interval: None,
                sm2_repetitions: row.get(2)?,
                fsrs_stability: row.get(3)?,
                fsrs_difficulty: row.get(4)?,
                fsrs_state: row.get(5)?,
                last_reviewed: row.get(6)?,
            })
        },
    )
    .ok()
}

fn recall_payload(card: &CardMeta, config: &PracticeConfig) -> ActivityPromptPayload {
    ActivityPromptPayload::Recall {
        front_text: card.front_text.clone(),
        back_text: card.back_text.clone(),
        reverse: config.reverse_card,
    }
}

/// Payloads we can build without touching the network: the three live-from-card
/// activities, `use_in_sentence` (target only), a cached template row, a
/// notes-derived cloze, or a TTS/clip-backed `listen_again`.
/// Returns `None` when the activity needs model generation.
fn build_payload_local(
    conn: &Conn,
    item: &PlanItem,
    card: &CardMeta,
    config: &PracticeConfig,
) -> Option<(ActivityPromptPayload, Option<String>)> {
    match item.activity_type {
        ActivityType::Recall => Some((recall_payload(card, config), None)),
        ActivityType::TypeTest => Some((
            ActivityPromptPayload::TypeTest {
                prompt_text: if config.reverse_card {
                    card.front_text.clone()
                } else {
                    card.back_text.clone()
                },
                target: if config.reverse_card {
                    card.back_text.clone()
                } else {
                    card.front_text.clone()
                },
                reverse: config.reverse_card,
            },
            None,
        )),
        ActivityType::SpeakTest => Some((
            ActivityPromptPayload::SpeakTest {
                target: card.front_text.clone(),
                expected_phonemes: None,
            },
            None,
        )),
        // Needs no generated content — the prompt is just the word.
        ActivityType::UseInSentence => Some((
            ActivityPromptPayload::UseInSentence {
                target: card.front_text.clone(),
                topic_hint: None,
            },
            None,
        )),
        ActivityType::ListenAgain => {
            if let Some(enc) = pick_encounter(conn, &card.id) {
                Some((enc, None))
            } else if tts_available(conn) {
                // No captured clip: speak the word locally instead.
                Some((
                    ActivityPromptPayload::ListenAgain {
                        audio_clip_url: String::new(),
                        source_type: "tts".to_string(),
                        source_snippet: card.front_text.clone(),
                        source_position: None,
                    },
                    None,
                ))
            } else {
                Some((recall_payload(card, config), None))
            }
        }
        ActivityType::Cloze | ActivityType::SynonymDiscrim | ActivityType::MiniReading => {
            if let Some((tpl_id, payload)) = pick_template(conn, &item.card_id, item.activity_type) {
                return Some((payload, Some(tpl_id)));
            }
            if item.activity_type == ActivityType::Cloze {
                if let Some(p) = derive_cloze_from_notes(card) {
                    return Some((p, None));
                }
            }
            None // → model generation
        }
    }
}

/// Latest captured audio clip for this card, if the podcast/reading pipelines stored one.
fn pick_encounter(conn: &Conn, card_id: &str) -> Option<ActivityPromptPayload> {
    conn.query_row(
        "SELECT audio_clip_url, source_type, source_snippet, source_position
         FROM pr_card_encounter
         WHERE card_id = ?1 AND audio_clip_url IS NOT NULL
         ORDER BY encountered_at DESC LIMIT 1",
        rusqlite::params![card_id],
        |r| {
            Ok(ActivityPromptPayload::ListenAgain {
                audio_clip_url: r.get::<_, String>(0)?,
                source_type: r.get::<_, Option<String>>(1)?.unwrap_or_else(|| "manual".into()),
                source_snippet: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                source_position: r.get::<_, Option<i64>>(3)?,
            })
        },
    )
    .ok()
}

/// Build a cloze by blanking the target word inside one of the card's example
/// sentences. Zero-cost and works with no model installed.
fn derive_cloze_from_notes(card: &CardMeta) -> Option<ActivityPromptPayload> {
    let notes = card.notes.as_ref()?;
    let examples = notes.get("examples")?.as_array()?;
    let word = card.front_text.trim();
    if word.is_empty() {
        return None;
    }
    let lower_word = word.to_lowercase();

    for ex in examples {
        for key in ["en", "source", "target"] {
            let Some(sentence) = ex.get(key).and_then(|v| v.as_str()) else {
                continue;
            };
            let lower = sentence.to_lowercase();
            if let Some(pos) = lower.find(&lower_word) {
                let mut blanked = String::with_capacity(sentence.len() + 4);
                blanked.push_str(&sentence[..pos]);
                blanked.push_str("____");
                blanked.push_str(&sentence[pos + word.len()..]);
                return Some(ActivityPromptPayload::Cloze {
                    sentence: blanked,
                    target: word.to_string(),
                    fa_translation: None,
                    distractors: None,
                });
            }
        }
    }
    None
}

/// Pick the least-used template row for (card, activity) and bump its use count.
fn pick_template(
    conn: &Conn,
    card_id: &str,
    activity: ActivityType,
) -> Option<(String, ActivityPromptPayload)> {
    let at = serde_json::to_value(activity).ok()?;
    let at = at.as_str()?.to_string();
    let row = conn
        .query_row(
            "SELECT id, payload FROM pr_activity_template
             WHERE card_id = ?1 AND activity_type = ?2
             ORDER BY used_count ASC LIMIT 1",
            rusqlite::params![card_id, at],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .ok()?;
    let payload: ActivityPromptPayload = serde_json::from_str(&row.1).ok()?;
    conn.execute(
        "UPDATE pr_activity_template SET used_count = used_count + 1 WHERE id = ?1",
        rusqlite::params![row.0],
    )
    .ok();
    Some((row.0, payload))
}

/// Ask the local model for one activity payload. Returns None on any failure —
/// callers degrade to recall, matching the cloud fallback.
async fn generate_payload(
    activity: ActivityType,
    word: &str,
    meaning: &str,
    language: &str,
    settings: &AiSettings,
) -> Option<ActivityPromptPayload> {
    let messages = match activity {
        ActivityType::Cloze => study_content::cloze(word, meaning, language),
        ActivityType::SynonymDiscrim => study_content::synonym(word, meaning, language),
        ActivityType::MiniReading => study_content::mini_reading(word, meaning, language),
        _ => return None,
    };

    let raw = chat_completion(
        &settings.provider,
        &settings.model,
        messages,
        settings.api_key.as_deref(),
        settings.base_url.as_deref(),
        Some(0.4),
        Some(600),
        true,
    )
    .await
    .ok()?;
    let v = extract_json(&raw).ok()?;

    match activity {
        ActivityType::Cloze => {
            let sentence = v.get("sentence")?.as_str()?.to_string();
            if !sentence.contains("____") {
                return None;
            }
            Some(ActivityPromptPayload::Cloze {
                sentence,
                target: v
                    .get("target")
                    .and_then(|t| t.as_str())
                    .unwrap_or(word)
                    .to_string(),
                fa_translation: None,
                distractors: v.get("distractors").and_then(|d| d.as_array()).map(|a| {
                    a.iter().filter_map(|x| x.as_str().map(String::from)).collect()
                }),
            })
        }
        ActivityType::SynonymDiscrim => {
            let options: Vec<String> = v
                .get("options")?
                .as_array()?
                .iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect();
            let correct_index = v.get("correct_index")?.as_i64()?;
            if options.len() < 2 || correct_index < 0 || correct_index as usize >= options.len() {
                return None;
            }
            Some(ActivityPromptPayload::SynonymDiscrim {
                context_sentence: v.get("context_sentence")?.as_str()?.to_string(),
                options,
                correct_index,
            })
        }
        ActivityType::MiniReading => {
            let paragraph = v.get("paragraph")?.as_str()?.to_string();
            let choices: Option<Vec<String>> = v.get("comprehension_choices").and_then(|c| {
                c.as_array()
                    .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            });
            let idx = v.get("comprehension_correct_index").and_then(|i| i.as_i64());
            // Drop a malformed question rather than shipping an unanswerable one.
            let (question, choices, idx) = match (&choices, idx) {
                (Some(c), Some(i)) if c.len() >= 2 && i >= 0 && (i as usize) < c.len() => (
                    v.get("comprehension_question").and_then(|q| q.as_str()).map(String::from),
                    choices.clone(),
                    Some(i),
                ),
                _ => (None, None, None),
            };
            Some(ActivityPromptPayload::MiniReading {
                paragraph,
                target_words: vec![word.to_string()],
                comprehension_question: question,
                comprehension_choices: choices,
                comprehension_correct_index: idx,
            })
        }
        _ => None,
    }
}

/// Persist a generated payload so the next serve of this (card, activity) is instant.
fn cache_template(
    conn: &Conn,
    card_id: &str,
    activity: ActivityType,
    payload: &ActivityPromptPayload,
    generated_by: &str,
) -> Option<String> {
    let at = serde_json::to_value(activity).ok()?.as_str()?.to_string();
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pr_activity_template (id, card_id, activity_type, payload, generated_by, used_count)
         VALUES (?1, ?2, ?3, ?4, ?5, 1)",
        rusqlite::params![
            id,
            card_id,
            at,
            serde_json::to_string(payload).ok()?,
            generated_by,
        ],
    )
    .ok()?;
    Some(id)
}

#[tauri::command]
pub async fn study_next_activity(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<NextActivityResponse, String> {
    // ─── Phase A: locked reads. The guard is dropped before any await. ───────
    struct Prep {
        config: PracticeConfig,
        item: PlanItem,
        card: CardMeta,
        requeue_count: i64,
        srs_algorithm: String,
        progress: Option<CardProgressSnapshot>,
        total: i64,
        consumed: i64,
        ready: Option<(ActivityPromptPayload, Option<String>)>,
        ai: bool,
        settings: AiSettings,
        language: String,
    }

    let prep = {
        let conn = lock_db(&state)?;
        let config = read_config(&conn)?;

        let (status, queue_json, consumed): (String, Option<String>, i64) = conn
            .query_row(
                "SELECT status, card_queue, consumed_count FROM pr_session WHERE id = ?1",
                rusqlite::params![session_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| format!("session lookup: {e}"))?;

        if status != "active" {
            return Err("SESSION_NOT_ACTIVE".to_string());
        }
        let queue: Vec<PlanItem> = queue_json
            .as_deref()
            .map(|s| from_json(s, Vec::new()))
            .unwrap_or_default();
        let total = queue.len() as i64;
        if consumed >= total {
            return Ok(empty_next(&session_id, total));
        }

        let item = queue[consumed as usize].clone();
        let card = fetch_card_meta(&conn, &item.card_id)?.ok_or("CARD_NOT_FOUND")?;
        let requeue_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pr_activity WHERE session_id = ?1 AND card_id = ?2",
                rusqlite::params![session_id, item.card_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let ready = build_payload_local(&conn, &item, &card, &config);
        let ai = ai_available(&conn, &config);
        let settings = read_ai_settings(&conn);
        let language = deck_language(&conn, &item.card_id);
        let srs_algorithm = deck_algorithm(&conn, &item.card_id);
        let progress = card_progress_snapshot(&conn, &item.card_id);

        Prep {
            config,
            item,
            card,
            requeue_count,
            srs_algorithm,
            progress,
            total,
            consumed,
            ready,
            ai,
            settings,
            language,
        }
    };

    // ─── Phase B: model generation (no DB guard held). ───────────────────────
    let (payload, generated) = match prep.ready {
        Some((p, tpl)) => (p, Err(tpl)),
        None => {
            let generated = if prep.ai {
                generate_payload(
                    prep.item.activity_type,
                    &prep.card.front_text,
                    &prep.card.back_text,
                    &prep.language,
                    &prep.settings,
                )
                .await
            } else {
                None
            };
            match generated {
                Some(p) => (p.clone(), Ok(p)),
                // No model, or the model returned something unusable → recall.
                None => (recall_payload(&prep.card, &prep.config), Err(None)),
            }
        }
    };

    // ─── Phase C: locked writes. ─────────────────────────────────────────────
    let conn = lock_db(&state)?;

    let template_id: Option<String> = match generated {
        Ok(p) => cache_template(
            &conn,
            &prep.item.card_id,
            prep.item.activity_type,
            &p,
            &format!("{}:{}", prep.settings.provider, prep.settings.model),
        ),
        Err(existing) => existing,
    };

    // The served type is whatever the payload turned out to be — fallbacks may
    // downgrade to recall, and the client renders by this field.
    let served_type = payload_activity_type(&payload);
    let activity_id = uuid::Uuid::new_v4().to_string();
    let created_at = now_iso();

    conn.execute(
        "INSERT INTO pr_activity
            (id, session_id, card_id, activity_type, prompt_payload, template_id, affected_dimensions, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            activity_id,
            session_id,
            prep.item.card_id,
            serde_json::to_value(served_type).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default(),
            serde_json::to_string(&payload).unwrap_or_else(|_| "{}".into()),
            template_id,
            serde_json::to_string(&vec![served_type.dimension()]).unwrap_or_else(|_| "[]".into()),
            created_at,
        ],
    )
    .map_err(|e| format!("insert activity: {e}"))?;

    conn.execute(
        "UPDATE pr_session SET consumed_count = consumed_count + 1 WHERE id = ?1",
        rusqlite::params![session_id],
    )
    .map_err(|e| format!("bump consumed: {e}"))?;

    let activity = PracticeActivityOut {
        id: activity_id,
        session_id: session_id.clone(),
        user_id: LOCAL_USER.to_string(),
        card_id: Some(prep.item.card_id.clone()),
        related_card_ids: vec![],
        activity_type: served_type,
        prompt_payload: payload,
        template_id,
        user_response: None,
        user_audio_url: None,
        response_time_ms: None,
        is_correct: None,
        score: None,
        ai_feedback: None,
        affected_dimensions: vec![served_type.dimension()],
        created_at,
    };

    Ok(NextActivityResponse {
        activity,
        card_meta: Some(CardMetaOut {
            card_id: prep.card.id,
            front_text: prep.card.front_text,
            back_text: prep.card.back_text,
            deck_id: prep.card.deck_id,
            deck_title: prep.card.deck_title,
            notes: prep.card.notes,
        }),
        srs_algorithm: prep.srs_algorithm,
        card_progress: prep.progress,
        requeue_count: prep.requeue_count,
        remaining: prep.total - prep.consumed - 1,
        total: prep.total,
    })
}

fn payload_activity_type(p: &ActivityPromptPayload) -> ActivityType {
    match p {
        ActivityPromptPayload::Recall { .. } => ActivityType::Recall,
        ActivityPromptPayload::Cloze { .. } => ActivityType::Cloze,
        ActivityPromptPayload::TypeTest { .. } => ActivityType::TypeTest,
        ActivityPromptPayload::ListenAgain { .. } => ActivityType::ListenAgain,
        ActivityPromptPayload::SpeakTest { .. } => ActivityType::SpeakTest,
        ActivityPromptPayload::UseInSentence { .. } => ActivityType::UseInSentence,
        ActivityPromptPayload::SynonymDiscrim { .. } => ActivityType::SynonymDiscrim,
        ActivityPromptPayload::MiniReading { .. } => ActivityType::MiniReading,
    }
}

fn empty_next(session_id: &str, total: i64) -> NextActivityResponse {
    NextActivityResponse {
        activity: PracticeActivityOut {
            id: String::new(),
            session_id: session_id.to_string(),
            user_id: LOCAL_USER.to_string(),
            card_id: None,
            related_card_ids: vec![],
            activity_type: ActivityType::Recall,
            prompt_payload: ActivityPromptPayload::Recall {
                front_text: String::new(),
                back_text: String::new(),
                reverse: false,
            },
            template_id: None,
            user_response: None,
            user_audio_url: None,
            response_time_ms: None,
            is_correct: None,
            score: None,
            ai_feedback: None,
            affected_dimensions: vec![],
            created_at: now_iso(),
        },
        card_meta: None,
        srs_algorithm: "leitner".to_string(),
        card_progress: None,
        requeue_count: 0,
        remaining: 0,
        total,
    }
}

// ── submit-activity ─────────────────────────────────────────

#[derive(Debug, Default, Deserialize)]
pub struct SubmitBody {
    pub session_id: String,
    pub activity_id: String,
    pub user_response: Option<String>,
    pub user_audio_url: Option<String>,
    pub response_time_ms: Option<i64>,
    pub is_correct: Option<bool>,
    pub self_rating: Option<u8>,
}

/// Layer 1 of `use_in_sentence` grading — pure structural checks, ported from the
/// cloud grader's Rust service. `Some(..)` short-circuits before any model call.
fn structural_reject(target: &str, sentence: &str) -> Option<(bool, f64, String)> {
    let s = sentence.trim();
    if s.is_empty() {
        return Some((false, 0.0, "Write a sentence.".to_string()));
    }
    let lower_target = target.to_lowercase();
    if !s.to_lowercase().contains(&lower_target) {
        return Some((false, 0.0, format!("Your sentence must use \"{target}\".")));
    }
    let words: Vec<&str> = s.split_whitespace().collect();
    let non_target = words
        .iter()
        .filter(|w| !w.to_lowercase().contains(&lower_target))
        .count();
    if non_target < 2 {
        return Some((false, 0.0, "Write a full sentence, not just the word.".to_string()));
    }
    if words.len() < 4 {
        return Some((false, 0.3, "Try a longer sentence.".to_string()));
    }
    None
}

struct Graded {
    is_correct: bool,
    score: f64,
    feedback: Option<String>,
    coaching: Option<serde_json::Value>,
}

/// Benefit of the doubt when no model can be reached — mirrors the cloud
/// `gradingUnavailable()` path so a missing ollama never blocks a session.
fn grading_unavailable() -> Graded {
    Graded {
        is_correct: true,
        score: 0.7,
        feedback: Some("Graded automatically.".to_string()),
        coaching: None,
    }
}

/// Shape the model's reply into the `SentenceCoaching` the client renders.
fn normalize_coaching(v: &serde_json::Value) -> Option<serde_json::Value> {
    let corrections: Vec<serde_json::Value> = v
        .get("corrections")
        .and_then(|c| c.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|c| {
                    let wrong = c.get("wrong")?.as_str()?;
                    let right = c.get("right")?.as_str()?;
                    let kind = match c.get("kind").and_then(|k| k.as_str()) {
                        Some("grammar") => "grammar",
                        _ => "spelling",
                    };
                    Some(json!({
                        "wrong": wrong,
                        "right": right,
                        "kind": kind,
                        "note": c.get("note").and_then(|n| n.as_str()).unwrap_or(""),
                    }))
                })
                .take(6)
                .collect()
        })
        .unwrap_or_default();

    let examples: Vec<String> = v
        .get("examples")
        .and_then(|e| e.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).take(2).collect())
        .unwrap_or_default();

    if corrections.is_empty() && examples.is_empty() {
        return None;
    }
    Some(json!({
        "corrected": v.get("corrected").and_then(|c| c.as_str()),
        "corrections": corrections,
        "examples": examples,
    }))
}

/// Layer 2: ask the local model whether the sentence is acceptable and collect coaching.
async fn grade_use_in_sentence(
    target: &str,
    sentence: &str,
    ai: bool,
    settings: &AiSettings,
    native: &str,
    learning: &str,
) -> Graded {
    if let Some((is_correct, score, feedback)) = structural_reject(target, sentence) {
        return Graded {
            is_correct,
            score,
            feedback: Some(feedback),
            coaching: None,
        };
    }
    if !ai {
        return grading_unavailable();
    }

    let messages = study_grading::grade_and_coach(target, sentence, native, learning);
    let Ok(raw) = chat_completion(
        &settings.provider,
        &settings.model,
        messages,
        settings.api_key.as_deref(),
        settings.base_url.as_deref(),
        Some(0.3),
        Some(500),
        true,
    )
    .await
    else {
        return grading_unavailable();
    };
    let Ok(v) = extract_json(&raw) else {
        return grading_unavailable();
    };

    let acceptable = v.get("acceptable").and_then(|a| a.as_bool()).unwrap_or(true);
    let correction_count = v
        .get("corrections")
        .and_then(|c| c.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let score = if !acceptable {
        0.25
    } else if correction_count == 0 {
        0.95
    } else {
        0.75
    };

    Graded {
        is_correct: acceptable,
        score,
        feedback: None,
        coaching: normalize_coaching(&v),
    }
}

#[tauri::command]
pub async fn study_submit_activity(
    state: State<'_, AppState>,
    body: SubmitBody,
) -> Result<SubmitResponse, String> {
    // ─── Phase A: locked reads (guard dropped before any await). ─────────────
    let (activity_type, payload, card_id, deck_id, ai, settings, native, learning) = {
        let conn = lock_db(&state)?;
        let (activity_type_str, payload_str, card_id): (String, String, Option<String>) = conn
            .query_row(
                "SELECT activity_type, prompt_payload, card_id FROM pr_activity WHERE id = ?1",
                rusqlite::params![body.activity_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| format!("activity lookup: {e}"))?;
        let activity_type: ActivityType = serde_json::from_value(json!(activity_type_str))
            .map_err(|e| format!("bad activity: {e}"))?;
        let payload: ActivityPromptPayload = from_json(
            &payload_str,
            ActivityPromptPayload::Recall {
                front_text: String::new(),
                back_text: String::new(),
                reverse: false,
            },
        );
        let card_id = card_id.ok_or("CARD_NOT_FOUND")?;
        let deck_id = deck_id_for_card(&conn, &card_id)?;
        let config = read_config(&conn)?;
        let ai = ai_available(&conn, &config);
        let settings = read_ai_settings(&conn);
        let native = setting(&conn, "native_language").unwrap_or_else(|| "en".to_string());
        let learning = deck_language(&conn, &card_id);
        (activity_type, payload, card_id, deck_id, ai, settings, native, learning)
    };

    // ─── Phase B: grading (may call the model; no DB guard held). ────────────
    let (is_correct, score, ai_feedback, coaching) = match (&activity_type, &body.user_response) {
        (ActivityType::UseInSentence, Some(response)) => {
            let target = payload_target(&payload);
            let g = grade_use_in_sentence(&target, response, ai, &settings, &native, &learning).await;
            (g.is_correct, g.score, g.feedback, g.coaching)
        }
        _ => {
            let (c, s) = resolve_evidence(activity_type, &payload, &body);
            (c, s, None, None)
        }
    };

    // ─── Phase C: locked writes. ─────────────────────────────────────────────
    let conn = lock_db(&state)?;
    let now = now_iso();

    conn.execute(
        "UPDATE pr_activity SET user_response=?1, user_audio_url=?2, response_time_ms=?3,
            is_correct=?4, score=?5, ai_feedback=?6 WHERE id=?7",
        rusqlite::params![
            body.user_response,
            body.user_audio_url,
            body.response_time_ms,
            is_correct as i64,
            score,
            ai_feedback,
            body.activity_id,
        ],
    )
    .map_err(|e| format!("update activity: {e}"))?;

    // Proficiency update.
    let existing = load_one_proficiency(&conn, &card_id)?;
    let seed = existing.unwrap_or_else(|| CardProficiency::new(&card_id, &deck_id));
    let out = apply_result(
        ApplyResultInput {
            proficiency: &seed,
            activity_type,
            is_correct,
            score,
            response_time_ms: body.response_time_ms,
        },
        &now,
    );
    upsert_proficiency(&conn, &out.next, &deck_id)?;
    let affected: Vec<ProficiencyDimension> = out.affected_dimensions.clone();
    conn.execute(
        "UPDATE pr_activity SET affected_dimensions=?1 WHERE id=?2",
        rusqlite::params![
            serde_json::to_string(&affected).unwrap_or_else(|_| "[]".into()),
            body.activity_id,
        ],
    )
    .ok();

    // SRS bridge write (reuses desk's scheduling engine). Record the interval
    // delta so the session summary can count real promotions/demotions.
    if let Some((before, after)) = write_card_srs(&conn, &card_id, score)? {
        conn.execute(
            "UPDATE pr_activity SET srs_interval_before=?1, srs_interval_after=?2 WHERE id=?3",
            rusqlite::params![before, after, body.activity_id],
        )
        .ok();
    }

    // Session counters.
    conn.execute(
        "UPDATE pr_session SET activities_total = activities_total + 1,
            activities_correct = activities_correct + ?1 WHERE id = ?2",
        rusqlite::params![if is_correct { 1 } else { 0 }, body.session_id],
    )
    .ok();

    let mut prof = out.next;
    prof.card_id = card_id.clone();
    prof.deck_id = deck_id;

    let activity = PracticeActivityOut {
        id: body.activity_id.clone(),
        session_id: body.session_id.clone(),
        user_id: LOCAL_USER.to_string(),
        card_id: Some(card_id),
        related_card_ids: vec![],
        activity_type,
        prompt_payload: payload,
        template_id: None,
        user_response: body.user_response.clone(),
        user_audio_url: body.user_audio_url.clone(),
        response_time_ms: body.response_time_ms,
        is_correct: Some(is_correct),
        score: Some(score),
        ai_feedback,
        affected_dimensions: affected,
        created_at: now,
    };

    Ok(SubmitResponse {
        activity,
        proficiency: prof,
        coaching,
    })
}

fn resolve_evidence(
    activity_type: ActivityType,
    payload: &ActivityPromptPayload,
    body: &SubmitBody,
) -> (bool, f64) {
    // recall self-rating.
    if activity_type == ActivityType::Recall {
        if let Some(r) = body.self_rating {
            return self_rating_to_evidence(r);
        }
    }
    // Explicit boolean from client.
    if let Some(ic) = body.is_correct {
        return (ic, if ic { 1.0 } else { 0.0 });
    }
    // type_test / cloze exact match.
    if matches!(activity_type, ActivityType::TypeTest | ActivityType::Cloze) {
        if let Some(resp) = &body.user_response {
            let target = payload_target(payload);
            let ic = normalize(resp) == normalize(&target);
            return (ic, if ic { 1.0 } else { 0.0 });
        }
    }
    // synonym index match.
    if activity_type == ActivityType::SynonymDiscrim {
        if let (Some(resp), ActivityPromptPayload::SynonymDiscrim { correct_index, .. }) =
            (&body.user_response, payload)
        {
            let ic = resp.trim() == correct_index.to_string();
            return (ic, if ic { 1.0 } else { 0.0 });
        }
    }
    (false, 0.0)
}

fn payload_target(p: &ActivityPromptPayload) -> String {
    match p {
        ActivityPromptPayload::Cloze { target, .. } => target.clone(),
        ActivityPromptPayload::TypeTest { target, .. } => target.clone(),
        ActivityPromptPayload::UseInSentence { target, .. } => target.clone(),
        ActivityPromptPayload::SpeakTest { target, .. } => target.clone(),
        _ => String::new(),
    }
}

fn normalize(s: &str) -> String {
    s.trim().to_lowercase()
}

fn deck_id_for_card(conn: &Conn, card_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT deck_id FROM deck_cards WHERE id = ?1",
        rusqlite::params![card_id],
        |r| r.get::<_, String>(0),
    )
    .map_err(|_| "CARD_DECK_MISSING".to_string())
}

fn load_one_proficiency(conn: &Conn, card_id: &str) -> Result<Option<CardProficiency>, String> {
    let res = conn.query_row(
        "SELECT card_id, deck_id, recognition_score, recall_score, listening_score,
                production_score, pronunciation_score, learning_stage,
                consecutive_failures, total_attempts, last_practiced_at
         FROM pr_card_proficiency WHERE card_id = ?1",
        rusqlite::params![card_id],
        |row| {
            let stage: String = row.get(7)?;
            Ok(CardProficiency {
                card_id: row.get(0)?,
                deck_id: row.get(1)?,
                recognition_score: row.get(2)?,
                recall_score: row.get(3)?,
                listening_score: row.get(4)?,
                production_score: row.get(5)?,
                pronunciation_score: row.get(6)?,
                learning_stage: LearningStage::from_str_lenient(&stage),
                consecutive_failures: row.get(8)?,
                total_attempts: row.get(9)?,
                last_practiced_at: row.get(10)?,
            })
        },
    );
    match res {
        Ok(p) => Ok(Some(p)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("prof lookup: {e}")),
    }
}

fn upsert_proficiency(conn: &Conn, p: &CardProficiency, deck_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO pr_card_proficiency
            (card_id, deck_id, recognition_score, recall_score, listening_score,
             production_score, pronunciation_score, learning_stage, consecutive_failures,
             total_attempts, last_practiced_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))
         ON CONFLICT(card_id) DO UPDATE SET
            deck_id=?2, recognition_score=?3, recall_score=?4, listening_score=?5,
            production_score=?6, pronunciation_score=?7, learning_stage=?8,
            consecutive_failures=?9, total_attempts=?10, last_practiced_at=?11,
            updated_at=datetime('now')",
        rusqlite::params![
            p.card_id,
            deck_id,
            p.recognition_score,
            p.recall_score,
            p.listening_score,
            p.production_score,
            p.pronunciation_score,
            p.learning_stage.as_str(),
            p.consecutive_failures,
            p.total_attempts,
            p.last_practiced_at,
        ],
    )
    .map_err(|e| format!("upsert prof: {e}"))?;
    Ok(())
}

/// Push a study result into the SRS schedule (srs_progress) via desk's engine.
/// Returns `Some((interval_before, interval_after))` when the schedule actually
/// moved, or `None` when the score stayed below the write threshold.
fn write_card_srs(conn: &Conn, card_id: &str, score: f64) -> Result<Option<(f64, f64)>, String> {
    let algo_str = deck_algorithm(conn, card_id);

    // Below the write threshold: only bump review bookkeeping, keep the schedule.
    if score < SRS_WRITE_THRESHOLD {
        conn.execute(
            "INSERT OR IGNORE INTO srs_progress (id, card_id, algorithm, state, interval_days, due_date)
             VALUES (lower(hex(randomblob(16))), ?1, ?2, 'new', 0, datetime('now'))",
            rusqlite::params![card_id, algo_str],
        )
        .ok();
        conn.execute(
            "UPDATE srs_progress SET review_count = review_count + 1, last_review = datetime('now'),
                updated_at = datetime('now') WHERE card_id = ?1",
            rusqlite::params![card_id],
        )
        .ok();
        return Ok(None);
    }

    let confidence = score_to_confidence(score);
    let rating = match confidence {
        1 => Rating::Again,
        2 => Rating::Hard,
        3 | 4 => Rating::Good,
        _ => Rating::Easy,
    };

    conn.execute(
        "INSERT OR IGNORE INTO srs_progress (id, card_id, algorithm, state, interval_days, due_date)
         VALUES (lower(hex(randomblob(16))), ?1, ?2, 'new', 0, datetime('now'))",
        rusqlite::params![card_id, algo_str],
    )
    .ok();

    let (algorithm_str, box_number, ef, reps, stability, difficulty, state_str, interval, due_str, last_rev, review_count, lapses): (
        String, Option<i32>, Option<f64>, Option<i32>, Option<f64>, Option<f64>, String, f64, String, Option<String>, i32, i32,
    ) = conn
        .query_row(
            "SELECT algorithm, box_number, easiness_factor, repetitions, stability, difficulty,
                    state, interval_days, due_date, last_review, review_count, lapses
             FROM srs_progress WHERE card_id = ?1",
            rusqlite::params![card_id],
            |row| {
                Ok((
                    row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?,
                    row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?,
                ))
            },
        )
        .map_err(|e| format!("srs progress lookup: {e}"))?;

    let algorithm = Algorithm::from_str(&algorithm_str).unwrap_or(Algorithm::FSRS);
    let card_state = CardState::from_str(&state_str).unwrap_or(CardState::New);
    let last_review = last_rev.and_then(|s| {
        chrono::DateTime::parse_from_rfc3339(&s)
            .ok()
            .map(|dt| dt.with_timezone(&chrono::Utc))
    });
    let due_date = chrono::DateTime::parse_from_rfc3339(&due_str)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now());

    let progress = CardProgress {
        card_id: card_id.to_string(),
        algorithm,
        box_number,
        easiness_factor: ef,
        repetitions: reps,
        stability,
        difficulty,
        state: card_state,
        interval_days: interval,
        due_date,
        last_review,
        review_count,
        lapses,
    };

    let result = create_strategy(algorithm).schedule(&progress, rating);
    let algo_state = &result.algorithm_state;
    let new_box = algo_state.get("box_number").and_then(|v| v.as_i64());
    let new_ef = algo_state.get("easiness_factor").and_then(|v| v.as_f64());
    let new_reps = algo_state
        .get("repetitions")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);
    let new_stability = algo_state.get("stability").and_then(|v| v.as_f64());
    let new_difficulty = algo_state.get("difficulty").and_then(|v| v.as_f64());
    let new_lapses = if rating == Rating::Again { lapses + 1 } else { lapses };

    conn.execute(
        "UPDATE srs_progress SET state=?1, interval_days=?2, due_date=?3,
            last_review=datetime('now'), review_count=review_count+1, lapses=?4,
            box_number=?5, easiness_factor=?6, repetitions=?7, stability=?8, difficulty=?9,
            updated_at=datetime('now') WHERE card_id=?10",
        rusqlite::params![
            result.state,
            result.interval_days,
            result.due_date,
            new_lapses,
            new_box,
            new_ef,
            new_reps,
            new_stability,
            new_difficulty,
            card_id,
        ],
    )
    .map_err(|e| format!("srs update: {e}"))?;

    Ok(Some((interval, result.interval_days)))
}

// ── end ─────────────────────────────────────────────────────

#[derive(Debug, Default, Deserialize)]
pub struct EndBody {
    pub session_id: String,
    pub abandoned: Option<bool>,
}

#[tauri::command]
pub fn study_end(state: State<'_, AppState>, body: EndBody) -> Result<SessionSummaryResponse, String> {
    let conn = lock_db(&state)?;
    let abandoned = body.abandoned.unwrap_or(false);
    let status = if abandoned { "abandoned" } else { "completed" };

    let started_at: String = conn
        .query_row(
            "SELECT started_at FROM pr_session WHERE id = ?1",
            rusqlite::params![body.session_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("session lookup: {e}"))?;
    let total_seconds = {
        let secs: f64 = conn
            .query_row(
                "SELECT (julianday('now') - julianday(?1)) * 86400.0",
                rusqlite::params![started_at],
                |r| r.get(0),
            )
            .unwrap_or(1.0);
        (secs.floor() as i64).max(1)
    };

    conn.execute(
        "UPDATE pr_session SET status=?1, ended_at=?2, total_seconds=?3 WHERE id=?4",
        rusqlite::params![status, now_iso(), total_seconds, body.session_id],
    )
    .map_err(|e| format!("end session: {e}"))?;

    let session = read_session_row(&conn, &body.session_id)?;

    // Per-deck counts for this session.
    let mut stmt = conn
        .prepare(
            "SELECT dc.deck_id, d.name, COUNT(*)
             FROM pr_activity pa
             JOIN deck_cards dc ON dc.id = pa.card_id
             JOIN decks d ON d.id = dc.deck_id
             WHERE pa.session_id = ?1
             GROUP BY dc.deck_id",
        )
        .map_err(|e| format!("per-deck query: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params![body.session_id], |row| {
            Ok(DeckCount {
                deck_id: row.get(0)?,
                deck_title: row.get(1)?,
                count: row.get(2)?,
            })
        })
        .map_err(|e| format!("per-deck map: {e}"))?;
    let per_deck_counts = collect(rows)?;

    // Sync daily-plan progress for the landing page.
    if !abandoned {
        let consumed: i64 = session.consumed_count;
        conn.execute(
            "UPDATE pr_daily_plan SET consumed_count = MIN(total_cards, MAX(consumed_count, ?1)),
                consumed_at = datetime('now') WHERE plan_date = ?2",
            rusqlite::params![consumed, today_str()],
        )
        .ok();
    }

    let srs_stats = compute_srs_stats(&conn, &body.session_id, &started_at)?;

    // Keep the dashboard in sync (daily stats, XP, streak). The old Review session
    // did this; Study is now the only study surface, so it owns the bookkeeping.
    // Local date, matching `dashboard::streaks`, which computes "today" with Local.
    let today_local = chrono::Local::now().format("%Y-%m-%d").to_string();
    let minutes = ((total_seconds as f64) / 60.0).round() as i64;
    conn.execute(
        "INSERT INTO daily_stats (date, study_minutes, words_learned, reviews_completed)
         VALUES (?1, ?2, 0, ?3)
         ON CONFLICT(date) DO UPDATE SET
            study_minutes = study_minutes + ?2,
            reviews_completed = reviews_completed + ?3",
        rusqlite::params![today_local, minutes, session.activities_total],
    )
    .ok();

    let xp = session.activities_correct * 10;
    if xp > 0 {
        crate::dashboard::analytics::log_xp(&conn, "study", "session", xp, "{}").ok();
    }
    crate::dashboard::streaks::check_streak(&conn).ok();

    Ok(SessionSummaryResponse {
        session,
        // Parity with the cloud implementation, which also returns these empty.
        per_dimension_delta: HashMap::new(),
        per_deck_counts,
        recommendations: vec![],
        srs_stats: Some(srs_stats),
        xp_earned: Some(xp),
    })
}

/// Session SRS summary, derived from this session's activities + the schedule
/// they wrote. Promotions/demotions come from the recorded interval deltas
/// (V027); cards whose score stayed under the write threshold left the schedule
/// untouched and count as neither.
fn compute_srs_stats(conn: &Conn, session_id: &str, started_at: &str) -> Result<SrsStats, String> {
    let one = |sql: &str, p: &[&dyn rusqlite::types::ToSql]| -> i64 {
        conn.query_row(sql, p, |r| r.get::<_, i64>(0)).unwrap_or(0)
    };

    let promotions = one(
        "SELECT COUNT(*) FROM pr_activity
         WHERE session_id = ?1 AND srs_interval_after > srs_interval_before",
        &[&session_id],
    );
    let demotions = one(
        "SELECT COUNT(*) FROM pr_activity
         WHERE session_id = ?1 AND srs_interval_after < srs_interval_before",
        &[&session_id],
    );

    // Cards this session pushed to the 'mature' stage.
    let newly_mastered = one(
        "SELECT COUNT(DISTINCT pr.card_id) FROM pr_card_proficiency pr
         WHERE pr.learning_stage = 'mature'
           AND pr.last_practiced_at >= ?2
           AND pr.card_id IN (SELECT DISTINCT card_id FROM pr_activity WHERE session_id = ?1)",
        &[&session_id, &started_at],
    );

    // Distinct cards touched, split by whether they had prior review history.
    let dues_reviewed = one(
        "SELECT COUNT(DISTINCT pa.card_id) FROM pr_activity pa
         JOIN srs_progress sp ON sp.card_id = pa.card_id
         WHERE pa.session_id = ?1 AND sp.review_count > 1",
        &[&session_id],
    );
    let new_learned = one(
        "SELECT COUNT(DISTINCT pa.card_id) FROM pr_activity pa
         LEFT JOIN srs_progress sp ON sp.card_id = pa.card_id
         WHERE pa.session_id = ?1 AND (sp.review_count IS NULL OR sp.review_count <= 1)",
        &[&session_id],
    );

    // Cards scheduled for tomorrow (local day window, matching the deck UI).
    let tomorrow_forecast = one(
        "SELECT COUNT(*) FROM srs_progress
         WHERE date(due_date) = date('now', '+1 day')",
        &[],
    );

    Ok(SrsStats {
        promotions,
        demotions,
        newly_mastered,
        dues_reviewed,
        new_learned,
        tomorrow_forecast,
    })
}

fn read_session_row(conn: &Conn, id: &str) -> Result<SessionRow, String> {
    conn.query_row(
        "SELECT id, preset, enabled_activities, deck_strategy, deck_ids, goal_minutes,
                started_at, ended_at, total_seconds, activities_total, activities_correct,
                status, card_queue, consumed_count, estimated_minutes
         FROM pr_session WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            let enabled: String = row.get(2)?;
            let deck_ids: String = row.get(4)?;
            let queue: Option<String> = row.get(12)?;
            Ok(SessionRow {
                id: row.get(0)?,
                user_id: LOCAL_USER.to_string(),
                preset: row.get(1)?,
                enabled_activities: from_json(&enabled, Vec::new()),
                deck_strategy: row.get(3)?,
                deck_ids: from_json(&deck_ids, Vec::new()),
                goal_minutes: row.get(5)?,
                started_at: row.get(6)?,
                ended_at: row.get(7)?,
                total_seconds: row.get(8)?,
                activities_total: row.get(9)?,
                activities_correct: row.get(10)?,
                status: row.get(11)?,
                card_queue: queue.map(|s| from_json(&s, Vec::new())),
                consumed_count: row.get(13)?,
                estimated_minutes: row.get(14)?,
            })
        },
    )
    .map_err(|e| format!("read session: {e}"))
}

// ── preferences ─────────────────────────────────────────────

/// The web app keeps one `srs_algorithm` on the user; desk stores it per deck.
/// Setting it here records the default AND re-points every existing deck, which is
/// what "the algorithm my study uses" means for a single-user local app.
#[tauri::command]
pub fn study_set_srs_algorithm(state: State<'_, AppState>, algorithm: String) -> Result<(), String> {
    // Validate before writing — `decks.algorithm` has a CHECK constraint.
    Algorithm::from_str(&algorithm)?;
    let conn = lock_db(&state)?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('srs_algorithm', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        rusqlite::params![algorithm],
    )
    .map_err(|e| format!("save srs_algorithm: {e}"))?;
    conn.execute(
        "UPDATE decks SET algorithm = ?1, updated_at = datetime('now')",
        rusqlite::params![algorithm],
    )
    .map_err(|e| format!("apply srs_algorithm: {e}"))?;
    Ok(())
}

/// The default algorithm, falling back to whatever the decks already use.
#[tauri::command]
pub fn study_get_srs_algorithm(state: State<'_, AppState>) -> Result<String, String> {
    let conn = lock_db(&state)?;
    if let Some(v) = setting(&conn, "srs_algorithm") {
        return Ok(v);
    }
    Ok(conn
        .query_row("SELECT algorithm FROM decks LIMIT 1", [], |r| r.get::<_, String>(0))
        .unwrap_or_else(|_| "fsrs".to_string()))
}

// ── deck-status ─────────────────────────────────────────────

#[tauri::command]
pub fn study_deck_status(state: State<'_, AppState>) -> Result<DeckStatusResponse, String> {
    let conn = lock_db(&state)?;
    Ok(DeckStatusResponse {
        decks: load_deck_status(&conn)?,
    })
}

fn load_deck_status(conn: &Conn) -> Result<Vec<DeckStatus>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.name, d.card_count,
                (SELECT COUNT(*) FROM pr_card_proficiency pr WHERE pr.deck_id=d.id AND pr.learning_stage='leech'),
                (SELECT COUNT(*) FROM pr_card_proficiency pr WHERE pr.deck_id=d.id AND pr.learning_stage='mature'),
                (SELECT COUNT(*) FROM deck_cards dc LEFT JOIN srs_progress sp ON sp.card_id=dc.id
                    WHERE dc.deck_id=d.id AND (sp.card_id IS NULL OR sp.state='new')),
                (SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id=dc.id
                    WHERE dc.deck_id=d.id AND sp.state!='new' AND sp.due_date<=datetime('now')),
                (SELECT MAX(pr.last_practiced_at) FROM pr_card_proficiency pr WHERE pr.deck_id=d.id),
                (SELECT AVG(pr.recognition_score) FROM pr_card_proficiency pr WHERE pr.deck_id=d.id),
                (SELECT AVG(pr.recall_score) FROM pr_card_proficiency pr WHERE pr.deck_id=d.id),
                (SELECT AVG(pr.production_score) FROM pr_card_proficiency pr WHERE pr.deck_id=d.id),
                (SELECT AVG(pr.listening_score) FROM pr_card_proficiency pr WHERE pr.deck_id=d.id),
                (SELECT AVG(pr.pronunciation_score) FROM pr_card_proficiency pr WHERE pr.deck_id=d.id),
                (SELECT COUNT(DISTINCT pa.card_id) FROM pr_activity pa JOIN deck_cards dc ON dc.id=pa.card_id
                    WHERE dc.deck_id=d.id AND pa.created_at >= datetime('now','-7 days'))
             FROM decks d
             ORDER BY d.created_at DESC",
        )
        .map_err(|e| format!("deck-status query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            // 14 columns, 0-indexed: id, name, card_count, leech, mature, new, due,
            // last_practiced, avg_recognition, avg_recall, avg_production,
            // avg_listening, avg_pronunciation, weekly_practiced.
            let total_cards: i64 = row.get(2)?;
            let last_practiced: Option<String> = row.get(7)?;
            let weekly_practiced: i64 = row.get(13)?;
            Ok((
                row.get::<_, String>(0)?, // deck_id
                row.get::<_, String>(1)?, // name
                total_cards,
                row.get::<_, i64>(3)?, // leech
                row.get::<_, i64>(4)?, // mature
                row.get::<_, i64>(5)?, // new
                row.get::<_, i64>(6)?, // due
                last_practiced,
                row.get::<_, Option<f64>>(8)?,  // avg_recognition
                row.get::<_, Option<f64>>(9)?,  // avg_recall
                row.get::<_, Option<f64>>(10)?, // avg_production
                row.get::<_, Option<f64>>(11)?, // avg_listening
                row.get::<_, Option<f64>>(12)?, // avg_pronunciation
                weekly_practiced,
            ))
        })
        .map_err(|e| format!("deck-status map: {e}"))?;

    let mut decks = Vec::new();
    for r in rows {
        let (
            deck_id,
            name,
            total_cards,
            leech,
            mature,
            new_count,
            due,
            last_practiced,
            avg_recognition,
            avg_recall,
            avg_production,
            avg_listening,
            avg_pronunciation,
            weekly_practiced,
        ) = r.map_err(|e| format!("deck-status row: {e}"))?;

        let days_since: Option<f64> = match &last_practiced {
            Some(ts) => conn
                .query_row(
                    "SELECT julianday('now') - julianday(?1)",
                    rusqlite::params![ts],
                    |r| r.get::<_, Option<f64>>(0),
                )
                .ok()
                .flatten(),
            None => None,
        };
        let health = match days_since {
            None => "untouched",
            Some(d) if d <= 1.0 => "fresh",
            Some(d) if d <= 7.0 => "good",
            Some(d) if d <= 14.0 => "warning",
            Some(_) => "critical",
        };
        let weekly_coverage_pct = if total_cards > 0 {
            Some((weekly_practiced as f64 / total_cards as f64) * 100.0)
        } else {
            None
        };

        decks.push(DeckStatus {
            user_id: LOCAL_USER.to_string(),
            deck_id,
            deck_title: name,
            total_cards,
            leech_count: leech,
            mature_count: mature,
            new_count,
            due_count: due,
            untouched_count: new_count,
            last_practiced_at: last_practiced,
            days_since_practice: days_since,
            avg_recognition,
            avg_recall,
            avg_production,
            avg_listening,
            avg_pronunciation,
            health_status: health.to_string(),
            weekly_coverage_pct,
        });
    }

    Ok(decks)
}

// ── Tests ───────────────────────────────────────────────────
// The #[tauri::command] wrappers need a `State`, so these exercise the DB-level
// engine functions they delegate to, against a real in-memory SQLite.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::run_migrations;

    /// A deck with 3 never-reviewed cards, one carrying an example sentence.
    fn setup() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO decks (id, name, language, algorithm) VALUES ('d1', 'Deck', 'en', 'fsrs')",
            [],
        )
        .unwrap();
        for (i, (word, back)) in [("ephemeral", "short-lived"), ("lucid", "clear"), ("tenacious", "persistent")]
            .iter()
            .enumerate()
        {
            conn.execute(
                "INSERT INTO vocabulary (id, word, language) VALUES (?1, ?2, 'en')",
                rusqlite::params![i as i64 + 1, word],
            )
            .unwrap();
            let notes = if *word == "ephemeral" {
                Some(r#"{"examples":[{"en":"Fame is ephemeral and fades fast."}]}"#)
            } else {
                None
            };
            conn.execute(
                "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back, notes)
                 VALUES (?1, 'd1', ?2, ?3, ?4, ?5)",
                rusqlite::params![format!("c{}", i + 1), i as i64 + 1, word, back, notes],
            )
            .unwrap();
        }
        conn.execute("UPDATE decks SET card_count = 3 WHERE id = 'd1'", []).unwrap();
        conn
    }

    #[test]
    fn config_defaults_round_trip() {
        let conn = setup();
        let cfg = read_config(&conn).unwrap();
        assert_eq!(cfg.preset, "vocabulary");
        assert_eq!(cfg.daily_minutes, 20);
        assert_eq!(cfg.deck_strategy, DeckStrategy::Mix);
        // stage_overrides must survive the JSON column round-trip.
        assert!(cfg.stage_overrides.contains_key(&LearningStage::New));
        // Reading twice must not duplicate the singleton row.
        read_config(&conn).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM pr_practice_config", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn new_cards_feed_the_plan() {
        let conn = setup();
        let cfg = read_config(&conn).unwrap();
        let news = get_new_cards(&conn, &None, 30).unwrap();
        assert_eq!(news.len(), 3, "all 3 cards are unscheduled");

        let (items, minutes) = build_plan_items(&conn, &cfg, None, false, None).unwrap();
        assert_eq!(items.len(), 3);
        assert!(minutes >= 1);
        // Default config enables recall/cloze/type_test; with no templates and no AI,
        // only the live-from-card activities can be selected.
        for it in &items {
            assert!(
                matches!(it.activity_type, ActivityType::Recall | ActivityType::TypeTest),
                "unexpected activity {:?}",
                it.activity_type
            );
        }
    }

    #[test]
    fn srs_write_advances_schedule_only_above_threshold() {
        let conn = setup();

        // Below the write threshold: schedule untouched, no delta reported.
        assert!(write_card_srs(&conn, "c1", 0.4).unwrap().is_none());
        let interval: f64 = conn
            .query_row("SELECT interval_days FROM srs_progress WHERE card_id='c1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(interval, 0.0);

        // Above it: the schedule moves forward and the delta is returned.
        let (before, after) = write_card_srs(&conn, "c1", 0.95).unwrap().expect("schedule moved");
        assert_eq!(before, 0.0);
        assert!(after > before, "interval should grow: {before} -> {after}");
        let stored: f64 = conn
            .query_row("SELECT interval_days FROM srs_progress WHERE card_id='c1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(stored, after);
    }

    #[test]
    fn proficiency_upsert_then_stats() {
        let conn = setup();
        let mut p = CardProficiency::new("c1", "d1");
        p.learning_stage = LearningStage::Mature;
        p.total_attempts = 5;
        p.last_practiced_at = Some(now_iso());
        upsert_proficiency(&conn, &p, "d1").unwrap();

        // Upsert is idempotent on card_id.
        upsert_proficiency(&conn, &p, "d1").unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM pr_card_proficiency", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);

        let loaded = load_one_proficiency(&conn, "c1").unwrap().unwrap();
        assert_eq!(loaded.learning_stage, LearningStage::Mature);
    }

    #[test]
    fn payload_builders_are_offline_for_live_activities() {
        let conn = setup();
        let cfg = read_config(&conn).unwrap();
        let card = fetch_card_meta(&conn, "c1").unwrap().unwrap();

        let item = |t: ActivityType| PlanItem {
            card_id: "c1".into(),
            deck_id: "d1".into(),
            activity_type: t,
            order_index: 0,
            primary_dimension: t.dimension(),
        };

        let (p, _) = build_payload_local(&conn, &item(ActivityType::Recall), &card, &cfg).unwrap();
        assert!(matches!(p, ActivityPromptPayload::Recall { .. }));

        let (p, _) = build_payload_local(&conn, &item(ActivityType::TypeTest), &card, &cfg).unwrap();
        assert!(matches!(p, ActivityPromptPayload::TypeTest { .. }));

        // use_in_sentence needs no generated content (target only).
        let (p, _) = build_payload_local(&conn, &item(ActivityType::UseInSentence), &card, &cfg).unwrap();
        match p {
            ActivityPromptPayload::UseInSentence { target, .. } => assert_eq!(target, "ephemeral"),
            other => panic!("expected use_in_sentence, got {other:?}"),
        }

        // mini_reading has no template and no AI here → needs generation.
        assert!(build_payload_local(&conn, &item(ActivityType::MiniReading), &card, &cfg).is_none());
    }

    #[test]
    fn cloze_derives_from_card_notes_without_ai() {
        let conn = setup();
        let card = fetch_card_meta(&conn, "c1").unwrap().unwrap();
        let p = derive_cloze_from_notes(&card).expect("example sentence yields a cloze");
        match p {
            ActivityPromptPayload::Cloze { sentence, target, .. } => {
                assert!(sentence.contains("____"), "blank inserted: {sentence}");
                assert!(!sentence.to_lowercase().contains("ephemeral"));
                assert_eq!(target, "ephemeral");
            }
            other => panic!("expected cloze, got {other:?}"),
        }

        // A card with no notes cannot derive one.
        let plain = fetch_card_meta(&conn, "c2").unwrap().unwrap();
        assert!(derive_cloze_from_notes(&plain).is_none());
    }

    #[test]
    fn structural_grading_rejects_bad_sentences() {
        assert!(structural_reject("lucid", "").is_some());
        // Missing the target word.
        assert!(structural_reject("lucid", "The sky is very blue today").is_some());
        // Just the word repeated.
        assert!(structural_reject("lucid", "lucid lucid").is_some());
        // Too short (4-word floor) — partial credit, still incorrect.
        let (ok, score, _) = structural_reject("lucid", "a lucid dream").unwrap();
        assert!(!ok);
        assert_eq!(score, 0.3);
        // A real sentence passes to the model layer.
        assert!(structural_reject("lucid", "She gave a lucid explanation of the problem").is_none());
    }

    #[test]
    fn deck_status_query_reads_every_column() {
        // Regression: the column indices in load_deck_status were off by one and
        // read index 15 of a 14-column row -> "Invalid column index. 15", which
        // silently emptied the deck grid.
        let conn = setup();
        let decks = load_deck_status(&conn).expect("deck-status query must not error");
        assert_eq!(decks.len(), 1);
        let d = &decks[0];
        assert_eq!(d.deck_id, "d1");
        assert_eq!(d.deck_title, "Deck");
        assert_eq!(d.total_cards, 3);
        assert_eq!(d.new_count, 3, "all cards unscheduled");
        assert_eq!(d.due_count, 0);
        assert_eq!(d.leech_count, 0);
        assert_eq!(d.mature_count, 0);
        assert_eq!(d.health_status, "untouched");
        assert!(d.last_practiced_at.is_none());
        assert!(d.avg_recognition.is_none());

        // After a graded activity the averages + stage counts populate.
        let mut p = CardProficiency::new("c1", "d1");
        p.recognition_score = 0.9;
        p.learning_stage = LearningStage::Mature;
        p.total_attempts = 3;
        p.last_practiced_at = Some(now_iso());
        upsert_proficiency(&conn, &p, "d1").unwrap();

        let decks = load_deck_status(&conn).unwrap();
        let d = &decks[0];
        assert_eq!(d.mature_count, 1);
        assert!(d.last_practiced_at.is_some());
        assert!((d.avg_recognition.unwrap() - 0.9).abs() < 1e-9);
        assert_ne!(d.health_status, "untouched");
    }

    #[test]
    fn deck_status_counts_new_and_due() {
        let conn = setup();
        // All 3 cards are unscheduled → 3 new, 0 due.
        let new_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM deck_cards dc LEFT JOIN srs_progress sp ON sp.card_id=dc.id
                 WHERE dc.deck_id='d1' AND (sp.card_id IS NULL OR sp.state='new')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(new_count, 3);

        // Studying one card well schedules it into the future → no longer new, not due.
        write_card_srs(&conn, "c1", 0.95).unwrap();
        let due: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM deck_cards dc JOIN srs_progress sp ON sp.card_id=dc.id
                 WHERE dc.deck_id='d1' AND sp.state!='new' AND sp.due_date<=datetime('now')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(due, 0, "a freshly-scheduled card is not due yet");
    }
}
