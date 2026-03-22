mod ai;
mod auth;
mod caption;
mod commands;
mod dashboard;
mod db;
mod exam;
mod export;
mod jobs;
mod ollama;
mod plugins;
mod podcast;
mod pronunciation;
mod shortcuts;
mod sidecar;
mod srs;
mod sync;
mod tutor;
mod writing;

use std::sync::Mutex;

use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;

use commands::database::{get_all_settings, get_setting, set_setting};
use commands::settings::get_app_data_dir;
use db::init_database;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub caption: Mutex<caption::types::CaptionEngineState>,
    pub sidecar: tokio::sync::Mutex<Option<caption::sidecar::WhisperSidecar>>,
    pub spacy: tokio::sync::Mutex<Option<sidecar::SpacySidecar>>,
    pub jobs: tokio::sync::Mutex<jobs::JobRegistry>,
    pub ollama_process: tokio::sync::Mutex<Option<std::process::Child>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let data_dir = resolve_app_data_dir(app)?;
            std::fs::create_dir_all(&data_dir).map_err(|e| {
                format!("Failed to create app data directory: {e}")
            })?;

            let conn = init_database(&data_dir).map_err(|e| {
                format!("Failed to initialize database: {e}")
            })?;

            // Seed keyboard shortcut defaults
            shortcuts::seed_defaults(&conn).ok();

            // Reset stale 'processing' transcript status from previous crashed runs
            conn.execute(
                "UPDATE podcast_episodes SET transcript_status = 'pending' WHERE transcript_status = 'processing'",
                [],
            ).ok();

            app.manage(AppState {
                db: Mutex::new(conn),
                caption: Mutex::new(caption::types::CaptionEngineState::new()),
                sidecar: tokio::sync::Mutex::new(None),
                spacy: tokio::sync::Mutex::new(None),
                jobs: tokio::sync::Mutex::new(jobs::JobRegistry::new()),
                ollama_process: tokio::sync::Mutex::new(None),
            });

            // System tray
            let show = MenuItemBuilder::with_id("show", "Show FlexiDesk").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show)
                .separator()
                .item(&quit)
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_setting,
            set_setting,
            get_all_settings,
            get_app_data_dir,
            commands::srs::srs_list_decks,
            commands::srs::srs_create_deck,
            commands::srs::srs_update_deck,
            commands::srs::srs_delete_deck,
            commands::srs::srs_add_card,
            commands::srs::srs_get_deck_cards,
            commands::srs::srs_delete_card,
            commands::srs::srs_get_due_cards,
            commands::srs::srs_start_session,
            commands::srs::srs_get_session_card,
            commands::srs::srs_rate_card,
            commands::srs::srs_complete_session,
            commands::srs::srs_get_incomplete_session,
            commands::srs::srs_merge_decks,
            commands::srs::srs_add_vocabulary,
            commands::reading::reading_import_text,
            commands::reading::reading_list_documents,
            commands::reading::reading_get_document,
            commands::reading::reading_delete_document,
            commands::reading::reading_update_progress,
            commands::reading::reading_add_highlight,
            commands::reading::reading_get_highlights,
            commands::reading::reading_delete_highlight,
            commands::reading::reading_import_url,
            commands::reading::reading_import_file,
            commands::reading::reading_analyze_document,
            commands::tutor::tutor_start_conversation,
            commands::tutor::tutor_list_conversations,
            commands::tutor::tutor_get_messages,
            commands::tutor::tutor_send_message,
            commands::tutor::tutor_delete_conversation,
            commands::tutor::tutor_archive_conversation,
            commands::tutor::tutor_list_scenarios,
            commands::tutor::tutor_get_scenario,
            commands::tutor::tutor_send_message_stream,
            commands::caption::caption_list_devices,
            commands::caption::caption_start_capture,
            commands::caption::caption_stop_capture,
            commands::caption::caption_get_status,
            commands::caption::caption_transcribe_session,
            commands::caption::caption_transcribe_file,
            commands::caption::caption_list_sessions,
            commands::caption::caption_get_session,
            commands::caption::caption_get_segments,
            commands::caption::caption_delete_session,
            commands::caption::caption_check_whisper,
            commands::caption::caption_configure_whisper,
            commands::caption::caption_list_available_models,
            commands::caption::caption_download_model,
            commands::caption::caption_delete_model,
            commands::caption::caption_whisper_install_status,
            commands::caption::caption_auto_detect_whisper,
            commands::caption::caption_install_whisper,
            commands::caption::caption_install_homebrew,
            commands::caption::caption_check_model_for_language,
            commands::caption::caption_start_live_capture,
            commands::caption::caption_stop_live_capture,
            commands::caption::caption_set_active_model,
            commands::pronunciation::pronunciation_create_session,
            commands::pronunciation::pronunciation_list_sessions,
            commands::pronunciation::pronunciation_get_session,
            commands::pronunciation::pronunciation_delete_session,
            commands::pronunciation::pronunciation_record_attempt,
            commands::pronunciation::pronunciation_stop_and_analyze,
            commands::pronunciation::pronunciation_get_attempts,
            commands::pronunciation::pronunciation_get_progress,
            commands::podcast::podcast_add_feed,
            commands::podcast::podcast_list_feeds,
            commands::podcast::podcast_delete_feed,
            commands::podcast::podcast_refresh_feed,
            commands::podcast::podcast_list_episodes,
            commands::podcast::podcast_get_episode,
            commands::podcast::podcast_update_progress,
            commands::podcast::podcast_add_bookmark,
            commands::podcast::podcast_list_bookmarks,
            commands::podcast::podcast_delete_bookmark,
            commands::podcast::podcast_search_itunes,
            commands::podcast::podcast_download_episode,
            commands::podcast::podcast_delete_download,
            commands::podcast::podcast_transcribe_episode,
            commands::podcast::podcast_get_transcript_segments,
            commands::podcast::podcast_analyze_episode,
            commands::podcast::podcast_get_analysis,
            commands::podcast::podcast_translate_word,
            commands::podcast::podcast_get_words_cefr,
            commands::podcast::podcast_get_sync_points,
            commands::podcast::podcast_save_sync_points,
            commands::podcast::podcast_clear_sync_points,
            commands::writing::writing_create_session,
            commands::writing::writing_list_sessions,
            commands::writing::writing_get_session,
            commands::writing::writing_update_text,
            commands::writing::writing_submit,
            commands::writing::writing_update_elapsed,
            commands::writing::writing_save_corrections,
            commands::writing::writing_get_corrections,
            commands::writing::writing_delete_session,
            commands::writing::writing_list_prompts,
            commands::writing::writing_create_prompt,
            commands::writing::writing_delete_prompt,
            commands::writing::writing_get_stats,
            commands::exam::exam_create_session,
            commands::exam::exam_list_sessions,
            commands::exam::exam_get_session,
            commands::exam::exam_start_session,
            commands::exam::exam_pause_session,
            commands::exam::exam_complete_session,
            commands::exam::exam_abandon_session,
            commands::exam::exam_delete_session,
            commands::exam::exam_update_elapsed,
            commands::exam::exam_add_questions,
            commands::exam::exam_get_questions,
            commands::exam::exam_answer_question,
            commands::exam::exam_score_question,
            commands::exam::exam_list_templates,
            commands::exam::exam_create_template,
            commands::exam::exam_get_history,
            commands::dashboard::dashboard_get_summary,
            commands::dashboard::dashboard_get_daily_stats,
            commands::dashboard::dashboard_log_activity,
            commands::dashboard::dashboard_list_goals,
            commands::dashboard::dashboard_create_goal,
            commands::dashboard::dashboard_update_goal_progress,
            commands::dashboard::dashboard_delete_goal,
            commands::dashboard::dashboard_list_achievements,
            commands::dashboard::dashboard_check_achievements,
            commands::dashboard::dashboard_log_event,
            commands::dashboard::dashboard_get_activity,
            commands::dashboard::dashboard_check_streak,
            commands::dashboard::dashboard_use_freeze,
            commands::dashboard::dashboard_set_freeze_config,
            commands::dashboard::dashboard_set_xp_target,
            commands::dashboard::dashboard_get_xp_progress,
            commands::dashboard::dashboard_set_goal_notification,
            commands::dashboard::dashboard_get_xp_history,
            commands::dashboard::dashboard_get_cefr_radar,
            commands::dashboard::dashboard_get_study_heatmap,
            commands::dashboard::dashboard_get_vocab_growth,
            commands::dashboard::dashboard_get_streak_calendar,
            commands::dashboard::dashboard_get_analytics_summary,
            auth::auth_send_otp,
            auth::auth_verify_otp,
            auth::auth_refresh,
            auth::auth_get_session,
            auth::auth_logout,
            auth::supabase_call,
            commands::ollama::ollama_status,
            commands::ollama::ollama_list_models,
            commands::ollama::ollama_check_connection,
            commands::ollama::ollama_pull_model,
            commands::ollama::ollama_delete_model,
            commands::ollama::ollama_install_status,
            commands::ollama::ollama_install,
            commands::ollama::ollama_start_serve,
            commands::ollama::ollama_stop_serve,
            commands::vocabulary::vocabulary_list,
            commands::vocabulary::vocabulary_update,
            commands::vocabulary::vocabulary_delete,
            commands::vocabulary::vocabulary_bulk_delete,
            commands::vocabulary::vocabulary_bulk_add_to_deck,
            commands::vocabulary::vocabulary_export,
            commands::vocabulary::vocabulary_stats,
            commands::sidecar::sidecar_start_spacy,
            commands::sidecar::sidecar_stop_spacy,
            commands::sidecar::sidecar_spacy_status,
            commands::sidecar::sidecar_list_spacy_models,
            // Shortcuts
            commands::shortcuts::shortcut_list,
            commands::shortcuts::shortcut_update_binding,
            commands::shortcuts::shortcut_check_conflict,
            commands::shortcuts::shortcut_reset,
            commands::shortcuts::shortcut_reset_all,
            commands::shortcuts::shortcut_toggle,
            // Export/Import
            commands::export::export_vocabulary_csv,
            commands::export::export_vocabulary_anki,
            commands::export::import_preview_csv,
            commands::export::import_execute,
            // Sync
            commands::sync::sync_get_status,
            commands::sync::sync_get_config,
            commands::sync::sync_set_table_enabled,
            commands::sync::sync_get_queue,
            commands::sync::sync_get_conflicts,
            commands::sync::sync_resolve_conflict,
            commands::sync::sync_enqueue_change,
            // Plugins
            commands::plugins::plugin_list,
            commands::plugins::plugin_enable,
            commands::plugins::plugin_disable,
            commands::plugins::plugin_uninstall,
            commands::plugins::plugin_update_config,
            commands::plugins::plugin_install_local,
            // Jobs
            commands::jobs::job_cancel,
            commands::jobs::job_list,
            commands::podcast::podcast_start_transcribe_job,
            commands::podcast::podcast_start_download_job,
            // AI
            commands::ai::ai_word_analysis,
            commands::ai::ai_translate_words,
            commands::ai::ai_sentence_chat,
            commands::ai::ai_sentence_chat_history,
            commands::ai::ai_sentence_chat_clear,
            commands::ai::ai_evaluate_writing,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn resolve_app_data_dir(
    _app: &tauri::App,
) -> Result<std::path::PathBuf, String> {
    let base = dirs::data_dir()
        .ok_or_else(|| "Could not determine app data directory".to_string())?;
    Ok(base.join("com.flexilingo.desk"))
}
