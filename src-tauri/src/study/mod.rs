// =============================================================================
// Study engine — local reimplementation of the practice-session backend.
// =============================================================================
// Pure logic (config, plan builder, activity selector, proficiency updater)
// lives here; DB orchestration + Tauri commands live in commands/study.rs.
// =============================================================================

pub mod activity_selector;
pub mod config;
pub mod constants;
pub mod insights;
pub mod plan_builder;
pub mod proficiency;
pub mod rng;
pub mod types;
