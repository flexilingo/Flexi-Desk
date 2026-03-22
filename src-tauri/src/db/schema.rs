use rusqlite::Connection;

/// Run all database migrations in order.
/// Each migration is idempotent (uses IF NOT EXISTS).
pub fn run_migrations(conn: &Connection) -> Result<(), String> {
    // Create migrations tracking table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    )
    .map_err(|e| format!("Failed to create migrations table: {e}"))?;

    // Run each migration only if not already applied
    let migrations: Vec<(&str, &str)> = vec![
        ("V001", V001_INITIAL_SCHEMA),
        ("V002", V002_SRS_TABLES),
        ("V003", V003_READING_TABLES),
        ("V004", V004_TUTOR_TABLES),
        ("V005", V005_CAPTION_TABLES),
        ("V006", V006_PRONUNCIATION_TABLES),
        ("V007", V007_PODCAST_TABLES),
        ("V008", V008_WRITING_TABLES),
        ("V009", V009_EXAM_TABLES),
        ("V010", V010_DASHBOARD_TABLES),
        ("V011", V011_PODCAST_ANALYSIS),
        ("V012", V012_PODCAST_SYNC_POINTS),
        ("V013", V013_AUTH_TOKENS),
        ("V014", V014_CAPTION_LIVE_STATUS),
        ("V015", V015_REVIEW_LOGS),
        ("V016", V016_VOCABULARY_SOURCES),
        ("V017", V017_XP_LOG),
        ("V018", V018_SYNC_TABLES),
        ("V019", V019_PLUGINS),
        ("V020", V020_STREAK_ENHANCEMENTS),
        ("V021", V021_KEYBOARD_SHORTCUTS),
        ("V022", V022_SENTENCE_CHAT),
        ("V023", V023_SESSION_NAME),
        ("V024", V024_FIX_CAPTION_SEGMENTS_FK),
        ("V025", V025_TUTOR_MODES),
    ];

    for (version, sql) in migrations {
        let already_applied: bool = conn
            .prepare("SELECT COUNT(*) FROM _migrations WHERE version = ?1")
            .and_then(|mut stmt| stmt.query_row(rusqlite::params![version], |row| row.get(0)))
            .map(|count: i64| count > 0)
            .map_err(|e| format!("Failed to check migration {version}: {e}"))?;

        if !already_applied {
            // V014 needs special handling for SQLite table recreation
            if version == "V014" {
                run_v014_caption_live_status(conn)?;
            } else if !sql.is_empty() {
                conn.execute_batch(sql)
                    .map_err(|e| format!("Failed to run migration {version}: {e}"))?;
            }

            conn.execute(
                "INSERT INTO _migrations (version) VALUES (?1)",
                rusqlite::params![version],
            )
            .map_err(|e| format!("Failed to record migration {version}: {e}"))?;
        }
    }

    Ok(())
}

/// V014: Recreate caption_sessions with updated CHECK constraint.
/// Handles partial state from previous failed attempts.
fn run_v014_caption_live_status(conn: &Connection) -> Result<(), String> {
    let has_old_table: bool = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_caption_sessions_old'")
        .and_then(|mut s| s.query_row([], |r| r.get(0)))
        .map(|c: i64| c > 0)
        .unwrap_or(false);

    let has_new_table: bool = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='caption_sessions'")
        .and_then(|mut s| s.query_row([], |r| r.get(0)))
        .map(|c: i64| c > 0)
        .unwrap_or(false);

    if has_old_table && has_new_table {
        // Partial state: both tables exist. Just clean up the old one.
        conn.execute_batch("DROP TABLE IF EXISTS _caption_sessions_old;")
            .map_err(|e| format!("V014 cleanup error: {e}"))?;
    } else if has_old_table && !has_new_table {
        // Partial state: renamed but never recreated.
        conn.execute_batch(
            "CREATE TABLE caption_sessions (
                id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                language         TEXT NOT NULL DEFAULT 'auto',
                source_type      TEXT NOT NULL DEFAULT 'mic'
                                 CHECK(source_type IN ('mic', 'system', 'file')),
                source_file      TEXT,
                device_name      TEXT,
                whisper_model    TEXT DEFAULT 'base',
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                segment_count    INTEGER NOT NULL DEFAULT 0,
                word_count       INTEGER NOT NULL DEFAULT 0,
                status           TEXT NOT NULL DEFAULT 'idle'
                                 CHECK(status IN ('idle', 'capturing', 'live-capturing', 'processing', 'completed', 'failed')),
                error_message    TEXT,
                created_at       TEXT NOT NULL DEFAULT (datetime('now')),
                completed_at     TEXT
            );
            INSERT INTO caption_sessions SELECT * FROM _caption_sessions_old;
            DROP TABLE _caption_sessions_old;
            CREATE INDEX IF NOT EXISTS idx_caption_sessions_status  ON caption_sessions(status);
            CREATE INDEX IF NOT EXISTS idx_caption_sessions_created ON caption_sessions(created_at);"
        )
        .map_err(|e| format!("V014 recovery error: {e}"))?;
    } else if has_new_table {
        // Normal case: caption_sessions exists, needs recreation with new CHECK.
        conn.execute_batch(
            "ALTER TABLE caption_sessions RENAME TO _caption_sessions_old;

            CREATE TABLE caption_sessions (
                id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                language         TEXT NOT NULL DEFAULT 'auto',
                source_type      TEXT NOT NULL DEFAULT 'mic'
                                 CHECK(source_type IN ('mic', 'system', 'file')),
                source_file      TEXT,
                device_name      TEXT,
                whisper_model    TEXT DEFAULT 'base',
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                segment_count    INTEGER NOT NULL DEFAULT 0,
                word_count       INTEGER NOT NULL DEFAULT 0,
                status           TEXT NOT NULL DEFAULT 'idle'
                                 CHECK(status IN ('idle', 'capturing', 'live-capturing', 'processing', 'completed', 'failed')),
                error_message    TEXT,
                created_at       TEXT NOT NULL DEFAULT (datetime('now')),
                completed_at     TEXT
            );

            INSERT INTO caption_sessions SELECT * FROM _caption_sessions_old;
            DROP TABLE _caption_sessions_old;

            CREATE INDEX IF NOT EXISTS idx_caption_sessions_status  ON caption_sessions(status);
            CREATE INDEX IF NOT EXISTS idx_caption_sessions_created ON caption_sessions(created_at);"
        )
        .map_err(|e| format!("V014 migration error: {e}"))?;
    }
    // else: neither table exists — V005 hasn't run yet, V014 is a no-op

    Ok(())
}

const V001_INITIAL_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS settings (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vocabulary (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        word              TEXT NOT NULL,
        language          TEXT NOT NULL,
        pos               TEXT,
        cefr_level        TEXT,
        translation       TEXT,
        definition        TEXT,
        phonetic          TEXT,
        examples          TEXT,
        source_module     TEXT,
        context_sentence  TEXT,
        audio_path        TEXT,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vocabulary_language ON vocabulary(language);
    CREATE INDEX IF NOT EXISTS idx_vocabulary_cefr     ON vocabulary(cefr_level);
    CREATE INDEX IF NOT EXISTS idx_vocabulary_word     ON vocabulary(word);

    CREATE TABLE IF NOT EXISTS daily_stats (
        date               TEXT PRIMARY KEY,
        study_minutes      INTEGER DEFAULT 0,
        words_learned      INTEGER DEFAULT 0,
        reviews_completed  INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS streaks (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        current_streak      INTEGER DEFAULT 0,
        longest_streak      INTEGER DEFAULT 0,
        last_activity_date  TEXT
    );
";

const V002_SRS_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS decks (
        id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name        TEXT NOT NULL,
        description TEXT,
        language    TEXT NOT NULL,
        algorithm   TEXT NOT NULL DEFAULT 'fsrs'
                    CHECK(algorithm IN ('leitner', 'sm2', 'fsrs')),
        card_count  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deck_cards (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        deck_id         TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        vocabulary_id   INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
        front           TEXT NOT NULL,
        back            TEXT NOT NULL,
        notes           TEXT,
        added_at        TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(deck_id, vocabulary_id)
    );

    CREATE TABLE IF NOT EXISTS srs_progress (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        card_id         TEXT NOT NULL REFERENCES deck_cards(id) ON DELETE CASCADE,
        algorithm       TEXT NOT NULL,
        box_number      INTEGER DEFAULT 0,
        easiness_factor REAL DEFAULT 2.5,
        repetitions     INTEGER DEFAULT 0,
        stability       REAL DEFAULT 0,
        difficulty      REAL DEFAULT 0,
        state           TEXT DEFAULT 'new'
                        CHECK(state IN ('new', 'learning', 'review', 'relearning')),
        interval_days   REAL NOT NULL DEFAULT 0,
        due_date        TEXT NOT NULL DEFAULT (datetime('now')),
        last_review     TEXT,
        review_count    INTEGER NOT NULL DEFAULT 0,
        lapses          INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(card_id)
    );

    CREATE TABLE IF NOT EXISTS review_sessions (
        id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        deck_id          TEXT REFERENCES decks(id),
        algorithm        TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'in_progress'
                         CHECK(status IN ('in_progress', 'completed', 'abandoned')),
        total_cards      INTEGER NOT NULL DEFAULT 0,
        reviewed_cards   INTEGER NOT NULL DEFAULT 0,
        correct_count    INTEGER NOT NULL DEFAULT 0,
        card_ids         TEXT NOT NULL DEFAULT '[]',
        current_index    INTEGER NOT NULL DEFAULT 0,
        started_at       TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at     TEXT,
        duration_seconds INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_deck_cards_deck   ON deck_cards(deck_id);
    CREATE INDEX IF NOT EXISTS idx_deck_cards_vocab  ON deck_cards(vocabulary_id);
    CREATE INDEX IF NOT EXISTS idx_srs_progress_card ON srs_progress(card_id);
    CREATE INDEX IF NOT EXISTS idx_srs_progress_due  ON srs_progress(due_date);
    CREATE INDEX IF NOT EXISTS idx_review_sessions_status ON review_sessions(status);
";

const V003_READING_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS reading_documents (
        id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title       TEXT NOT NULL,
        content     TEXT NOT NULL,
        language    TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'paste'
                    CHECK(source_type IN ('paste', 'url', 'file', 'pdf', 'epub')),
        source_url  TEXT,
        word_count  INTEGER NOT NULL DEFAULT 0,
        progress    REAL NOT NULL DEFAULT 0.0,
        last_position INTEGER NOT NULL DEFAULT 0,
        tokens_json TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reading_highlights (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        document_id     TEXT NOT NULL REFERENCES reading_documents(id) ON DELETE CASCADE,
        word            TEXT NOT NULL,
        sentence        TEXT,
        word_index      INTEGER,
        vocabulary_id   INTEGER REFERENCES vocabulary(id),
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_reading_docs_lang ON reading_documents(language);
    CREATE INDEX IF NOT EXISTS idx_reading_docs_updated ON reading_documents(updated_at);
    CREATE INDEX IF NOT EXISTS idx_reading_highlights_doc ON reading_highlights(document_id);
    CREATE INDEX IF NOT EXISTS idx_reading_highlights_word ON reading_highlights(word);
";

const V004_TUTOR_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS conversations (
        id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title             TEXT NOT NULL,
        language          TEXT NOT NULL,
        cefr_level        TEXT NOT NULL DEFAULT 'A2',
        scenario_id       TEXT,
        provider          TEXT NOT NULL,
        model             TEXT NOT NULL,
        message_count     INTEGER NOT NULL DEFAULT 0,
        total_tokens      INTEGER NOT NULL DEFAULT 0,
        corrections_count INTEGER NOT NULL DEFAULT 0,
        status            TEXT NOT NULL DEFAULT 'active'
                          CHECK(status IN ('active', 'archived', 'deleted')),
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
        id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role              TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
        content           TEXT NOT NULL,
        corrections       TEXT DEFAULT '[]',
        vocab_suggestions TEXT DEFAULT '[]',
        token_count       INTEGER DEFAULT 0,
        created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);
";

const V005_CAPTION_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS caption_sessions (
        id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        language         TEXT NOT NULL DEFAULT 'auto',
        source_type      TEXT NOT NULL DEFAULT 'mic'
                         CHECK(source_type IN ('mic', 'system', 'file')),
        source_file      TEXT,
        device_name      TEXT,
        whisper_model    TEXT DEFAULT 'base',
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        segment_count    INTEGER NOT NULL DEFAULT 0,
        word_count       INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL DEFAULT 'idle'
                         CHECK(status IN ('idle', 'capturing', 'processing', 'completed', 'failed')),
        error_message    TEXT,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS caption_segments (
        id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id     TEXT NOT NULL REFERENCES caption_sessions(id) ON DELETE CASCADE,
        text           TEXT NOT NULL,
        language       TEXT NOT NULL DEFAULT 'en',
        confidence     REAL NOT NULL DEFAULT 0.0,
        start_time_ms  INTEGER NOT NULL DEFAULT 0,
        end_time_ms    INTEGER NOT NULL DEFAULT 0,
        word_timestamps TEXT DEFAULT '[]',
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_caption_sessions_status  ON caption_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_caption_sessions_created ON caption_sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_caption_segments_session  ON caption_segments(session_id);
    CREATE INDEX IF NOT EXISTS idx_caption_segments_time     ON caption_segments(session_id, start_time_ms);
";

const V006_PRONUNCIATION_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS pronunciation_sessions (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        mode            TEXT NOT NULL DEFAULT 'word'
                        CHECK(mode IN ('word', 'sentence', 'shadowing')),
        language        TEXT NOT NULL DEFAULT 'en',
        target_text     TEXT NOT NULL,
        reference_audio TEXT,
        status          TEXT NOT NULL DEFAULT 'idle'
                        CHECK(status IN ('idle', 'recording', 'analyzing', 'completed', 'failed')),
        overall_score   REAL,
        phoneme_score   REAL,
        prosody_score   REAL,
        fluency_score   REAL,
        feedback_json   TEXT DEFAULT '{}',
        attempts        INTEGER NOT NULL DEFAULT 0,
        best_score      REAL,
        error_message   TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS pronunciation_attempts (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id      TEXT NOT NULL REFERENCES pronunciation_sessions(id) ON DELETE CASCADE,
        attempt_number  INTEGER NOT NULL DEFAULT 1,
        audio_path      TEXT NOT NULL,
        duration_ms     INTEGER NOT NULL DEFAULT 0,
        transcript      TEXT,
        overall_score   REAL,
        phoneme_score   REAL,
        prosody_score   REAL,
        fluency_score   REAL,
        word_scores_json TEXT DEFAULT '[]',
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pronunciation_progress (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        language        TEXT NOT NULL,
        total_sessions  INTEGER NOT NULL DEFAULT 0,
        total_attempts  INTEGER NOT NULL DEFAULT 0,
        average_score   REAL NOT NULL DEFAULT 0.0,
        best_score      REAL NOT NULL DEFAULT 0.0,
        practice_minutes INTEGER NOT NULL DEFAULT 0,
        weak_phonemes   TEXT DEFAULT '[]',
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(language)
    );

    CREATE INDEX IF NOT EXISTS idx_pron_sessions_status   ON pronunciation_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_pron_sessions_created  ON pronunciation_sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_pron_attempts_session   ON pronunciation_attempts(session_id);
    CREATE INDEX IF NOT EXISTS idx_pron_progress_lang      ON pronunciation_progress(language);
";

const V007_PODCAST_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS podcast_feeds (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title           TEXT NOT NULL,
        author          TEXT,
        description     TEXT,
        feed_url        TEXT NOT NULL UNIQUE,
        website_url     TEXT,
        artwork_url     TEXT,
        language        TEXT NOT NULL DEFAULT 'en',
        category        TEXT,
        episode_count   INTEGER NOT NULL DEFAULT 0,
        last_refreshed  TEXT,
        is_subscribed   INTEGER NOT NULL DEFAULT 1,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS podcast_episodes (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        feed_id         TEXT NOT NULL REFERENCES podcast_feeds(id) ON DELETE CASCADE,
        guid            TEXT,
        title           TEXT NOT NULL,
        description     TEXT,
        audio_url       TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        published_at    TEXT,
        file_size       INTEGER,
        is_downloaded   INTEGER NOT NULL DEFAULT 0,
        local_path      TEXT,
        play_position   INTEGER NOT NULL DEFAULT 0,
        is_played       INTEGER NOT NULL DEFAULT 0,
        transcript      TEXT,
        transcript_status TEXT NOT NULL DEFAULT 'none'
                        CHECK(transcript_status IN ('none', 'processing', 'completed', 'failed')),
        cefr_level      TEXT,
        word_count      INTEGER,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(feed_id, guid)
    );

    CREATE TABLE IF NOT EXISTS podcast_bookmarks (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        episode_id      TEXT NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
        position_ms     INTEGER NOT NULL DEFAULT 0,
        label           TEXT,
        note            TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_podcast_feeds_lang       ON podcast_feeds(language);
    CREATE INDEX IF NOT EXISTS idx_podcast_feeds_subscribed  ON podcast_feeds(is_subscribed);
    CREATE INDEX IF NOT EXISTS idx_podcast_episodes_feed     ON podcast_episodes(feed_id);
    CREATE INDEX IF NOT EXISTS idx_podcast_episodes_published ON podcast_episodes(published_at);
    CREATE INDEX IF NOT EXISTS idx_podcast_bookmarks_episode  ON podcast_bookmarks(episode_id);
";

const V008_WRITING_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS writing_sessions (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        title           TEXT NOT NULL,
        language        TEXT NOT NULL DEFAULT 'en',
        task_type       TEXT NOT NULL DEFAULT 'free'
                        CHECK(task_type IN ('free', 'essay', 'email', 'ielts_task1', 'ielts_task2', 'toefl_integrated', 'toefl_independent', 'delf', 'goethe')),
        prompt_text     TEXT,
        original_text   TEXT NOT NULL DEFAULT '',
        corrected_text  TEXT,
        word_count      INTEGER NOT NULL DEFAULT 0,
        target_words    INTEGER,
        time_limit_min  INTEGER,
        elapsed_seconds INTEGER NOT NULL DEFAULT 0,
        status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft', 'writing', 'submitted', 'correcting', 'corrected', 'scored')),
        overall_score   REAL,
        grammar_score   REAL,
        vocabulary_score REAL,
        coherence_score REAL,
        task_score      REAL,
        band_score      TEXT,
        feedback_json   TEXT DEFAULT '{}',
        corrections_json TEXT DEFAULT '[]',
        grammar_patterns_json TEXT DEFAULT '[]',
        cefr_level      TEXT,
        error_message   TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        submitted_at    TEXT,
        completed_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS writing_corrections (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id      TEXT NOT NULL REFERENCES writing_sessions(id) ON DELETE CASCADE,
        original_span   TEXT NOT NULL,
        corrected_span  TEXT NOT NULL,
        error_type      TEXT NOT NULL DEFAULT 'grammar'
                        CHECK(error_type IN ('grammar', 'spelling', 'punctuation', 'vocabulary', 'style', 'coherence', 'register')),
        explanation     TEXT,
        start_offset    INTEGER NOT NULL DEFAULT 0,
        end_offset      INTEGER NOT NULL DEFAULT 0,
        severity        TEXT NOT NULL DEFAULT 'minor'
                        CHECK(severity IN ('minor', 'major', 'critical')),
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS writing_prompts (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        task_type       TEXT NOT NULL,
        language        TEXT NOT NULL DEFAULT 'en',
        title           TEXT NOT NULL,
        description     TEXT NOT NULL,
        target_words    INTEGER,
        time_limit_min  INTEGER,
        cefr_level      TEXT,
        is_builtin      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS writing_stats (
        id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        language            TEXT NOT NULL,
        total_sessions      INTEGER NOT NULL DEFAULT 0,
        total_words_written INTEGER NOT NULL DEFAULT 0,
        average_score       REAL NOT NULL DEFAULT 0.0,
        best_score          REAL NOT NULL DEFAULT 0.0,
        total_corrections   INTEGER NOT NULL DEFAULT 0,
        common_errors_json  TEXT DEFAULT '[]',
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(language)
    );

    CREATE INDEX IF NOT EXISTS idx_writing_sessions_status    ON writing_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_writing_sessions_lang      ON writing_sessions(language);
    CREATE INDEX IF NOT EXISTS idx_writing_sessions_created   ON writing_sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_writing_corrections_session ON writing_corrections(session_id);
    CREATE INDEX IF NOT EXISTS idx_writing_prompts_type       ON writing_prompts(task_type, language);
    CREATE INDEX IF NOT EXISTS idx_writing_stats_lang         ON writing_stats(language);
";

const V009_EXAM_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS exam_sessions (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        exam_type       TEXT NOT NULL
                        CHECK(exam_type IN ('ielts', 'toefl', 'delf', 'goethe', 'dele', 'hsk', 'jlpt', 'custom')),
        title           TEXT NOT NULL,
        language        TEXT NOT NULL DEFAULT 'en',
        status          TEXT NOT NULL DEFAULT 'not_started'
                        CHECK(status IN ('not_started', 'in_progress', 'paused', 'completed', 'abandoned')),
        total_sections  INTEGER NOT NULL DEFAULT 0,
        current_section INTEGER NOT NULL DEFAULT 0,
        total_questions INTEGER NOT NULL DEFAULT 0,
        answered_count  INTEGER NOT NULL DEFAULT 0,
        correct_count   INTEGER NOT NULL DEFAULT 0,
        overall_score   REAL,
        band_score      TEXT,
        time_limit_min  INTEGER,
        elapsed_seconds INTEGER NOT NULL DEFAULT 0,
        sections_json   TEXT NOT NULL DEFAULT '[]',
        results_json    TEXT DEFAULT '{}',
        feedback_json   TEXT DEFAULT '{}',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        started_at      TEXT,
        completed_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS exam_questions (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id      TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
        section_index   INTEGER NOT NULL DEFAULT 0,
        question_index  INTEGER NOT NULL DEFAULT 0,
        question_type   TEXT NOT NULL DEFAULT 'multiple_choice'
                        CHECK(question_type IN (
                            'multiple_choice', 'fill_blank', 'true_false',
                            'matching', 'ordering', 'short_answer',
                            'essay', 'speaking', 'listening_mc',
                            'reading_mc', 'cloze'
                        )),
        prompt          TEXT NOT NULL,
        context_text    TEXT,
        audio_url       TEXT,
        image_url       TEXT,
        options_json    TEXT DEFAULT '[]',
        correct_answer  TEXT,
        user_answer     TEXT,
        is_correct      INTEGER,
        score           REAL,
        max_score       REAL NOT NULL DEFAULT 1.0,
        feedback        TEXT,
        time_spent_sec  INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exam_templates (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        exam_type       TEXT NOT NULL,
        title           TEXT NOT NULL,
        description     TEXT,
        language        TEXT NOT NULL DEFAULT 'en',
        sections_json   TEXT NOT NULL DEFAULT '[]',
        time_limit_min  INTEGER,
        total_questions INTEGER NOT NULL DEFAULT 0,
        cefr_level      TEXT,
        is_builtin      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exam_history (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        exam_type       TEXT NOT NULL,
        language        TEXT NOT NULL,
        total_attempts  INTEGER NOT NULL DEFAULT 0,
        best_score      REAL NOT NULL DEFAULT 0.0,
        average_score   REAL NOT NULL DEFAULT 0.0,
        best_band       TEXT,
        last_attempt_at TEXT,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(exam_type, language)
    );

    CREATE INDEX IF NOT EXISTS idx_exam_sessions_status      ON exam_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_type         ON exam_sessions(exam_type);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_created      ON exam_sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_exam_questions_session      ON exam_questions(session_id);
    CREATE INDEX IF NOT EXISTS idx_exam_questions_section      ON exam_questions(session_id, section_index);
    CREATE INDEX IF NOT EXISTS idx_exam_templates_type         ON exam_templates(exam_type, language);
    CREATE INDEX IF NOT EXISTS idx_exam_history_type           ON exam_history(exam_type, language);
";

const V010_DASHBOARD_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS goals (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        goal_type       TEXT NOT NULL
                        CHECK(goal_type IN ('daily_minutes', 'daily_words', 'daily_reviews', 'weekly_sessions', 'custom')),
        target_value    INTEGER NOT NULL DEFAULT 1,
        current_value   INTEGER NOT NULL DEFAULT 0,
        period          TEXT NOT NULL DEFAULT 'daily'
                        CHECK(period IN ('daily', 'weekly', 'monthly')),
        is_active       INTEGER NOT NULL DEFAULT 1,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS achievements (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        achievement_key TEXT NOT NULL UNIQUE,
        title           TEXT NOT NULL,
        description     TEXT,
        icon            TEXT,
        category        TEXT NOT NULL DEFAULT 'general'
                        CHECK(category IN ('general', 'streak', 'vocabulary', 'review', 'writing', 'exam', 'reading', 'pronunciation')),
        threshold       INTEGER NOT NULL DEFAULT 1,
        current_value   INTEGER NOT NULL DEFAULT 0,
        is_unlocked     INTEGER NOT NULL DEFAULT 0,
        unlocked_at     TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        activity_type   TEXT NOT NULL,
        module          TEXT NOT NULL,
        description     TEXT,
        metadata_json   TEXT DEFAULT '{}',
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_goals_type       ON goals(goal_type);
    CREATE INDEX IF NOT EXISTS idx_goals_active      ON goals(is_active);
    CREATE INDEX IF NOT EXISTS idx_achievements_key  ON achievements(achievement_key);
    CREATE INDEX IF NOT EXISTS idx_achievements_cat  ON achievements(category);
    CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(activity_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_log_date ON activity_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date  ON daily_stats(date);
";

const V011_PODCAST_ANALYSIS: &str = "
    CREATE TABLE IF NOT EXISTS podcast_transcript_segments (
        id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        episode_id  TEXT NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
        text        TEXT NOT NULL,
        start_ms    INTEGER NOT NULL,
        end_ms      INTEGER NOT NULL,
        confidence  REAL DEFAULT 0.0,
        language    TEXT DEFAULT 'en',
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pts_episode ON podcast_transcript_segments(episode_id);
    CREATE INDEX IF NOT EXISTS idx_pts_timing  ON podcast_transcript_segments(episode_id, start_ms);

    CREATE TABLE IF NOT EXISTS podcast_word_timestamps (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        segment_id  TEXT NOT NULL REFERENCES podcast_transcript_segments(id) ON DELETE CASCADE,
        word        TEXT NOT NULL,
        start_ms    INTEGER NOT NULL,
        end_ms      INTEGER NOT NULL,
        confidence  REAL DEFAULT 0.0
    );

    CREATE INDEX IF NOT EXISTS idx_pwt_segment ON podcast_word_timestamps(segment_id);

    CREATE TABLE IF NOT EXISTS podcast_nlp_analysis (
        id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        episode_id          TEXT NOT NULL UNIQUE REFERENCES podcast_episodes(id) ON DELETE CASCADE,
        total_words         INTEGER DEFAULT 0,
        unique_words        INTEGER DEFAULT 0,
        cefr_level          TEXT,
        cefr_distribution   TEXT,
        avg_sentence_length REAL DEFAULT 0.0,
        vocabulary_richness REAL DEFAULT 0.0,
        top_words           TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
";

const V012_PODCAST_SYNC_POINTS: &str = "
    CREATE TABLE IF NOT EXISTS podcast_sync_points (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        episode_id  TEXT NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
        audio_time  REAL NOT NULL,
        subtitle_time REAL NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_psp_episode ON podcast_sync_points(episode_id);
";

const V013_AUTH_TOKENS: &str = "
    CREATE TABLE IF NOT EXISTS auth_tokens (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
";

// V014 is now handled programmatically in run_v014_caption_live_status()
// to avoid partial-rename issues with SQLite table recreation.
const V014_CAPTION_LIVE_STATUS: &str = "";

const V015_REVIEW_LOGS: &str = "
    CREATE TABLE IF NOT EXISTS review_logs (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id      TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
        card_id         TEXT NOT NULL REFERENCES deck_cards(id) ON DELETE CASCADE,
        rating          TEXT NOT NULL CHECK(rating IN ('again', 'hard', 'good', 'easy')),
        interval_before REAL NOT NULL DEFAULT 0,
        interval_after  REAL NOT NULL DEFAULT 0,
        state_before    TEXT NOT NULL,
        state_after     TEXT NOT NULL,
        time_spent_ms   INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_review_logs_session ON review_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_review_logs_card ON review_logs(card_id);
    CREATE INDEX IF NOT EXISTS idx_review_logs_created ON review_logs(created_at);
";

const V016_VOCABULARY_SOURCES: &str = "
    CREATE TABLE IF NOT EXISTS vocabulary_sources (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        vocabulary_id   INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
        source_module   TEXT NOT NULL,
        source_id       TEXT,
        context_sentence TEXT,
        encountered_at  TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(vocabulary_id, source_module, source_id)
    );

    CREATE INDEX IF NOT EXISTS idx_vocab_sources_vocab ON vocabulary_sources(vocabulary_id);
    CREATE INDEX IF NOT EXISTS idx_vocab_sources_module ON vocabulary_sources(source_module);
";

const V017_XP_LOG: &str = "
    CREATE TABLE IF NOT EXISTS xp_log (
        id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        module      TEXT NOT NULL
                    CHECK(module IN ('srs', 'reading', 'tutor', 'caption', 'pronunciation', 'writing', 'exam', 'podcast')),
        action      TEXT NOT NULL,
        xp_amount   INTEGER NOT NULL DEFAULT 0,
        metadata    TEXT DEFAULT '{}',
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_xp_log_module ON xp_log(module);
    CREATE INDEX IF NOT EXISTS idx_xp_log_date ON xp_log(created_at);
";

const V018_SYNC_TABLES: &str = "
    CREATE TABLE IF NOT EXISTS sync_queue (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        table_name      TEXT NOT NULL,
        row_id          TEXT NOT NULL,
        operation       TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
        payload         TEXT NOT NULL DEFAULT '{}',
        status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending', 'syncing', 'synced', 'failed', 'conflict')),
        retry_count     INTEGER NOT NULL DEFAULT 0,
        error_message   TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        synced_at       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name, status);

    CREATE TABLE IF NOT EXISTS sync_metadata (
        table_name      TEXT PRIMARY KEY,
        last_synced_at  TEXT,
        last_cursor     TEXT,
        is_enabled      INTEGER NOT NULL DEFAULT 0,
        record_count    INTEGER NOT NULL DEFAULT 0,
        sync_direction  TEXT NOT NULL DEFAULT 'both'
                        CHECK(sync_direction IN ('push', 'pull', 'both')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        table_name      TEXT NOT NULL,
        row_id          TEXT NOT NULL,
        local_data      TEXT NOT NULL,
        remote_data     TEXT NOT NULL,
        local_updated   TEXT NOT NULL,
        remote_updated  TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'unresolved'
                        CHECK(status IN ('unresolved', 'keep_local', 'keep_remote', 'merged')),
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON sync_conflicts(status);
";

const V019_PLUGINS: &str = "
    CREATE TABLE IF NOT EXISTS plugins (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        version         TEXT NOT NULL,
        description     TEXT,
        author          TEXT,
        homepage_url    TEXT,
        icon_path       TEXT,
        wasm_path       TEXT NOT NULL,
        permissions     TEXT NOT NULL DEFAULT '[]',
        config          TEXT NOT NULL DEFAULT '{}',
        status          TEXT NOT NULL DEFAULT 'disabled'
                        CHECK(status IN ('disabled', 'enabled', 'error', 'updating')),
        error_message   TEXT,
        install_source  TEXT NOT NULL DEFAULT 'local'
                        CHECK(install_source IN ('local', 'marketplace', 'url')),
        installed_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
";

const V020_STREAK_ENHANCEMENTS: &str = "
    ALTER TABLE streaks ADD COLUMN freeze_days_remaining INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE streaks ADD COLUMN freeze_days_per_week INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE streaks ADD COLUMN freeze_last_reset TEXT;
    ALTER TABLE streaks ADD COLUMN daily_xp_target INTEGER NOT NULL DEFAULT 50;

    ALTER TABLE goals ADD COLUMN notify_at TEXT;
    ALTER TABLE goals ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 0;
";

const V021_KEYBOARD_SHORTCUTS: &str = "
    CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
        id              TEXT PRIMARY KEY,
        action_id       TEXT NOT NULL UNIQUE,
        label           TEXT NOT NULL,
        description     TEXT,
        category        TEXT NOT NULL DEFAULT 'general'
                        CHECK(category IN ('global', 'navigation', 'review', 'reading', 'caption', 'podcast', 'general')),
        key_binding     TEXT NOT NULL,
        default_binding TEXT NOT NULL,
        is_global       INTEGER NOT NULL DEFAULT 0,
        is_enabled      INTEGER NOT NULL DEFAULT 1,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_shortcuts_action ON keyboard_shortcuts(action_id);
    CREATE INDEX IF NOT EXISTS idx_shortcuts_category ON keyboard_shortcuts(category);
";

const V022_SENTENCE_CHAT: &str = "
CREATE TABLE IF NOT EXISTS sentence_chat_messages (
    id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sentence_context TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sentence_chat_episode ON sentence_chat_messages(episode_id);
";

const V023_SESSION_NAME: &str = "
ALTER TABLE review_sessions ADD COLUMN session_name TEXT;
";

// Fix caption_segments FK that points to _caption_sessions_old (from V014 rename side-effect).
const V024_FIX_CAPTION_SEGMENTS_FK: &str = "
    ALTER TABLE caption_segments RENAME TO _caption_segments_old;

    CREATE TABLE caption_segments (
        id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id     TEXT NOT NULL REFERENCES caption_sessions(id) ON DELETE CASCADE,
        text           TEXT NOT NULL,
        language       TEXT NOT NULL DEFAULT 'en',
        confidence     REAL NOT NULL DEFAULT 0.0,
        start_time_ms  INTEGER NOT NULL DEFAULT 0,
        end_time_ms    INTEGER NOT NULL DEFAULT 0,
        word_timestamps TEXT DEFAULT '[]',
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO caption_segments SELECT * FROM _caption_segments_old;
    DROP TABLE _caption_segments_old;

    CREATE INDEX IF NOT EXISTS idx_caption_segments_session ON caption_segments(session_id);
    CREATE INDEX IF NOT EXISTS idx_caption_segments_time    ON caption_segments(session_id, start_time_ms);
";

const V025_TUTOR_MODES: &str = "
    ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'free';
    ALTER TABLE conversations ADD COLUMN topic TEXT;
    ALTER TABLE conversations ADD COLUMN deck_id TEXT;
    ALTER TABLE conversations ADD COLUMN room_state TEXT DEFAULT '{}';
    ALTER TABLE conversations ADD COLUMN summary TEXT;

    CREATE TABLE IF NOT EXISTS tutor_vocab_results (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        word TEXT NOT NULL,
        translation TEXT,
        user_answer TEXT,
        is_correct INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tutor_vocab_conv ON tutor_vocab_results(conversation_id);
";
