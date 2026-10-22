use rusqlite::Connection;

/// Run all database migrations in order.
/// Each migration is idempotent (uses IF NOT EXISTS).
pub fn run_migrations(conn: &Connection) -> Result<(), String> {
    run_migrations_inner(conn, None)
}

/// Apply migrations only up to and including `last`.
///
/// Test-only. It exists so a migration can be exercised against a database that already
/// holds rows in the *old* shape — running every migration first leaves the tables empty
/// and a "did the rebuild preserve my data" test would prove nothing.
#[cfg(test)]
pub fn run_migrations_through(conn: &Connection, last: &str) -> Result<(), String> {
    run_migrations_inner(conn, Some(last))
}

fn run_migrations_inner(conn: &Connection, stop_after: Option<&str>) -> Result<(), String> {
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
        ("V026", V026_STUDY_TABLES),
        ("V027", V027_STUDY_SRS_DELTAS),
        ("V028", V028_PODCAST_DIFFICULTY_V2),
        ("V029", V029_TRANSCRIPT_SOURCES),
        ("V030", V030_EPISODE_IMAGE),
        ("V031", V031_CELPIP),
        // Special-handled below: rebuilding `deck_cards` requires toggling the
        // foreign_keys pragma, which cannot be done from inside execute_batch.
        ("V032", ""),
        ("V033", V033_TRANSCRIPT_LANG),
        ("V034", V034_BACKFILL_TRANSCRIPT_LANG),
        ("V035", V035_READER),
        // Special-handled below: widening a CHECK means rebuilding `reader_documents`.
        ("V036", ""),
        ("V037", V037_OVERVIEW),
        ("V038", V038_DECK_PAIR),
        ("V039", V039_CHEATSHEET_CACHE),
        ("V040", crate::writing_practice::store::MIGRATION_SQL),
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
            } else if version == "V032" {
                run_v032_decks_notes(conn)?;
            } else if version == "V036" {
                run_v036_reader_text(conn)?;
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

        if stop_after == Some(version) {
            break;
        }
    }

    Ok(())
}

/// Does `table` have a column named `column`?
fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
    conn.prepare(&format!("PRAGMA table_info({table})"))
        .and_then(|mut stmt| {
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == column {
                    return Ok(true);
                }
            }
            Ok(false)
        })
        .unwrap_or(false)
}

/// V032: deck/card columns for the decks + explore modules, and the unified `notes` table.
///
/// The dangerous part is `deck_cards`. Its `vocabulary_id` is `NOT NULL REFERENCES
/// vocabulary(id)`, which makes it impossible to store a card that isn't a dictionary
/// word — a cloned public deck, a grammar card, a sentence. SQLite cannot drop a NOT
/// NULL constraint, so the table must be rebuilt.
///
/// Five tables cascade off `deck_cards(id)`: `srs_progress`, `review_logs`,
/// `pr_card_proficiency`, `pr_activity_template`, `pr_card_encounter`. With
/// `foreign_keys=ON` (which is how the app opens the DB), `DROP TABLE deck_cards`
/// fires those `ON DELETE CASCADE` rules and silently destroys the user's entire SRS
/// scheduling history. So the rebuild runs with the pragma OFF, inside a transaction,
/// and `PRAGMA foreign_key_check` must come back clean before we commit.
fn run_v032_decks_notes(conn: &Connection) -> Result<(), String> {
    // The pragma is a no-op inside a transaction, so it has to be toggled out here.
    let fk_was_on: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
        .unwrap_or(0);
    conn.pragma_update(None, "foreign_keys", "OFF")
        .map_err(|e| format!("V032: could not disable foreign keys: {e}"))?;

    let result = (|| -> Result<(), String> {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("V032: begin: {e}"))?;

        // ── decks: columns the deck manager and explore clones need ──
        // Guarded individually so a crash halfway through can be re-run.
        for (col, ddl) in [
            ("tags", "ALTER TABLE decks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'"),
            ("is_public", "ALTER TABLE decks ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0"),
            ("source_url", "ALTER TABLE decks ADD COLUMN source_url TEXT"),
            ("source_type", "ALTER TABLE decks ADD COLUMN source_type TEXT"),
            ("original_deck_id", "ALTER TABLE decks ADD COLUMN original_deck_id TEXT"),
            ("total_clones", "ALTER TABLE decks ADD COLUMN total_clones INTEGER NOT NULL DEFAULT 0"),
            ("cloud_deck_id", "ALTER TABLE decks ADD COLUMN cloud_deck_id TEXT"),
        ] {
            if !column_exists(&tx, "decks", col) {
                tx.execute_batch(ddl)
                    .map_err(|e| format!("V032: decks.{col}: {e}"))?;
            }
        }

        // Re-cloning the same public deck must update, never duplicate. Partial index
        // because every locally-created deck has a NULL cloud_deck_id.
        tx.execute_batch(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_decks_cloud_deck
                 ON decks(cloud_deck_id) WHERE cloud_deck_id IS NOT NULL;",
        )
        .map_err(|e| format!("V032: decks cloud index: {e}"))?;

        // ── deck_cards: rebuild so vocabulary_id may be NULL ──
        if !column_exists(&tx, "deck_cards", "order_index") {
            tx.execute_batch(V032_DECK_CARDS_REBUILD)
                .map_err(|e| format!("V032: deck_cards rebuild: {e}"))?;
        }

        // ── unified notes ──
        tx.execute_batch(V032_NOTES)
            .map_err(|e| format!("V032: notes: {e}"))?;

        // A dangling row here would mean the rebuild lost a card that something still
        // points at. Refuse to commit rather than ship a corrupt DB.
        let violations: i64 = {
            let mut stmt = tx
                .prepare("PRAGMA foreign_key_check")
                .map_err(|e| format!("V032: foreign_key_check: {e}"))?;
            let mut rows = stmt.query([]).map_err(|e| format!("V032: fk rows: {e}"))?;
            let mut n = 0i64;
            while rows.next().map_err(|e| format!("V032: fk row: {e}"))?.is_some() {
                n += 1;
            }
            n
        };
        if violations > 0 {
            return Err(format!(
                "V032: {violations} foreign-key violations after rebuild; refusing to commit"
            ));
        }

        tx.commit().map_err(|e| format!("V032: commit: {e}"))
    })();

    if fk_was_on != 0 {
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| format!("V032: could not restore foreign keys: {e}"))?;
    }

    result
}

/// The language of the transcript the episode currently shows.
///
/// Stamped when a transcript is CREATED — by local Whisper (the resolved language,
/// or whisper's own detection when it ran on auto) and by the cloud fetch (the
/// cloud's per-chunk language). This is the authoritative answer to "what language
/// is the word the user just clicked": `difficulty_lang` only exists after cloud
/// analysis, and the feed's declared language is publisher-supplied and often wrong
/// or defaulted — a French feed without an RSS `<language>` tag is stored as 'en',
/// which sent en→fa word-translation requests for French words.
const V033_TRANSCRIPT_LANG: &str = "
    ALTER TABLE podcast_episodes ADD COLUMN transcript_lang TEXT;
";


/// Backfill `transcript_lang` for episodes transcribed before V033.
///
/// LOCAL segments only: their `language` is the language Whisper was actually
/// invoked with, recorded honestly per segment. Cloud segments are excluded —
/// the old fetch code stamped them `'en'` as a hard fallback whenever the cloud
/// omitted a chunk language, so for them `'en'` is fabricated, not observed.
/// Episodes left NULL keep using the difficulty/feed fallback chain.
const V034_BACKFILL_TRANSCRIPT_LANG: &str = "
    UPDATE podcast_episodes SET transcript_lang = (
        SELECT s.language FROM podcast_transcript_segments s
        WHERE s.episode_id = podcast_episodes.id
          AND s.source = 'local'
          AND s.language IS NOT NULL AND s.language != '' AND s.language != 'auto'
        GROUP BY s.language ORDER BY COUNT(*) DESC LIMIT 1
    )
    WHERE transcript_lang IS NULL
      AND transcript_source = 'local';
";

/// Rebuild `deck_cards` with a nullable `vocabulary_id`, plus `tags` / `order_index`.
///
/// `UNIQUE(deck_id, vocabulary_id)` is kept: SQLite treats NULLs as distinct, so a deck
/// can hold many cards with no vocabulary row (cloned cards) while still refusing to add
/// the same dictionary word twice.
const V032_DECK_CARDS_REBUILD: &str = "
    CREATE TABLE deck_cards_new (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        deck_id         TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        vocabulary_id   INTEGER REFERENCES vocabulary(id) ON DELETE CASCADE,
        front           TEXT NOT NULL,
        back            TEXT NOT NULL,
        notes           TEXT,
        tags            TEXT NOT NULL DEFAULT '[]',
        order_index     INTEGER NOT NULL DEFAULT 0,
        added_at        TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(deck_id, vocabulary_id)
    );

    INSERT INTO deck_cards_new (id, deck_id, vocabulary_id, front, back, notes, order_index, added_at)
    SELECT id, deck_id, vocabulary_id, front, back, notes,
           ROW_NUMBER() OVER (PARTITION BY deck_id ORDER BY added_at, id) - 1,
           added_at
    FROM deck_cards;

    DROP TABLE deck_cards;
    ALTER TABLE deck_cards_new RENAME TO deck_cards;

    CREATE INDEX IF NOT EXISTS idx_deck_cards_deck  ON deck_cards(deck_id);
    CREATE INDEX IF NOT EXISTS idx_deck_cards_vocab ON deck_cards(vocabulary_id);
    CREATE INDEX IF NOT EXISTS idx_deck_cards_order ON deck_cards(deck_id, order_index);
";

/// One notes table for every source. Front only supports notes on videos; desk covers
/// podcast episodes, reading documents and caption sessions.
///
/// `source_id` deliberately carries no foreign key — it is polymorphic across three
/// tables. Deleting an episode therefore leaves its notes behind; the notes page filters
/// out sources it can no longer resolve rather than losing the user's writing.
const V032_NOTES: &str = "
    CREATE TABLE IF NOT EXISTS notes (
        id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        source_module  TEXT NOT NULL CHECK(source_module IN ('podcast', 'reading', 'caption')),
        source_id      TEXT NOT NULL,
        source_title   TEXT,
        position_ms    INTEGER,
        label          TEXT,
        note           TEXT,
        excerpt        TEXT,
        translation    TEXT,
        tags           TEXT NOT NULL DEFAULT '[]',
        color          TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notes_source  ON notes(source_module, source_id);
    CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);

    -- Carry every existing podcast bookmark over, preserving its id so nothing that
    -- already references it breaks. Re-runnable.
    INSERT INTO notes (id, source_module, source_id, position_ms, label, note, created_at, updated_at)
    SELECT b.id, 'podcast', b.episode_id, b.position_ms, b.label, b.note, b.created_at, b.created_at
    FROM podcast_bookmarks b
    WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.id = b.id);

    -- `lookup_count` on the vocabulary page is COUNT(*) over this table.
    CREATE INDEX IF NOT EXISTS idx_vocab_sources_vocab ON vocabulary_sources(vocabulary_id);
";

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

// V026 — Study engine (local reimplementation of the practice-session backend).
// These pr_* tables layer a multi-dimensional proficiency + activity model on top
// of the existing SRS deck/card/progress tables (V002/V015). Single-user local DB,
// so NO user_id columns. JSON payloads/arrays are stored as TEXT. See
// docs/STUDY_ENGINE.md and memory desk-study-port.md.
const V026_STUDY_TABLES: &str = "
    -- Practice config — a single row keyed by a fixed sentinel id.
    CREATE TABLE IF NOT EXISTS pr_practice_config (
        id                      TEXT PRIMARY KEY DEFAULT 'default',
        preset                  TEXT NOT NULL DEFAULT 'vocabulary',
        enabled_activities      TEXT NOT NULL DEFAULT '[\"recall\",\"cloze\",\"type_test\"]',
        activity_weights        TEXT NOT NULL DEFAULT '{\"recall\":0.4,\"cloze\":0.35,\"type_test\":0.25}',
        stage_overrides         TEXT NOT NULL DEFAULT '{}',
        daily_minutes           INTEGER NOT NULL DEFAULT 20,
        goal                    TEXT NOT NULL DEFAULT 'maintenance',
        always_show_translation INTEGER NOT NULL DEFAULT 0,
        auto_pronounce          INTEGER NOT NULL DEFAULT 1,
        reverse_card            INTEGER NOT NULL DEFAULT 0,
        use_listen_again        INTEGER NOT NULL DEFAULT 1,
        use_ai_grading          INTEGER NOT NULL DEFAULT 1,
        deck_strategy           TEXT NOT NULL DEFAULT 'mix',
        deck_weights            TEXT NOT NULL DEFAULT '{}',
        active_deck_id          TEXT,
        focus                   TEXT,
        created_at              TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Per-card multi-dimensional proficiency.
    CREATE TABLE IF NOT EXISTS pr_card_proficiency (
        id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        card_id             TEXT NOT NULL REFERENCES deck_cards(id) ON DELETE CASCADE,
        deck_id             TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        recognition_score   REAL NOT NULL DEFAULT 0,
        recall_score        REAL NOT NULL DEFAULT 0,
        listening_score     REAL NOT NULL DEFAULT 0,
        production_score    REAL NOT NULL DEFAULT 0,
        pronunciation_score REAL NOT NULL DEFAULT 0,
        learning_stage      TEXT NOT NULL DEFAULT 'new'
                            CHECK(learning_stage IN ('new','learning','reinforcing','solidifying','mature','leech')),
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        total_attempts      INTEGER NOT NULL DEFAULT 0,
        last_practiced_at   TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(card_id)
    );

    -- A study session, with its own locked card_queue snapshot.
    CREATE TABLE IF NOT EXISTS pr_session (
        id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        preset             TEXT NOT NULL DEFAULT 'vocabulary',
        enabled_activities TEXT NOT NULL DEFAULT '[]',
        deck_strategy      TEXT NOT NULL DEFAULT 'mix',
        deck_ids           TEXT NOT NULL DEFAULT '[]',
        goal_minutes       INTEGER,
        started_at         TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at           TEXT,
        total_seconds      INTEGER,
        activities_total   INTEGER NOT NULL DEFAULT 0,
        activities_correct INTEGER NOT NULL DEFAULT 0,
        status             TEXT NOT NULL DEFAULT 'active'
                           CHECK(status IN ('active','completed','abandoned')),
        card_queue         TEXT,
        consumed_count     INTEGER NOT NULL DEFAULT 0,
        estimated_minutes  INTEGER
    );

    -- One materialized activity served during a session.
    CREATE TABLE IF NOT EXISTS pr_activity (
        id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id          TEXT NOT NULL REFERENCES pr_session(id) ON DELETE CASCADE,
        card_id             TEXT,
        related_card_ids    TEXT NOT NULL DEFAULT '[]',
        activity_type       TEXT NOT NULL,
        prompt_payload      TEXT NOT NULL DEFAULT '{}',
        template_id         TEXT,
        user_response       TEXT,
        user_audio_url      TEXT,
        response_time_ms    INTEGER,
        is_correct          INTEGER,
        score               REAL,
        ai_feedback         TEXT,
        affected_dimensions TEXT NOT NULL DEFAULT '[]',
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Cached generated activity content (cloze/synonym/use_in_sentence/mini_reading).
    CREATE TABLE IF NOT EXISTS pr_activity_template (
        id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        card_id          TEXT NOT NULL REFERENCES deck_cards(id) ON DELETE CASCADE,
        activity_type    TEXT NOT NULL,
        payload          TEXT NOT NULL,
        difficulty       TEXT NOT NULL DEFAULT 'medium',
        language_variant TEXT NOT NULL DEFAULT 'en-US',
        generated_by     TEXT,
        generated_at     TEXT NOT NULL DEFAULT (datetime('now')),
        used_count       INTEGER NOT NULL DEFAULT 0,
        success_rate     REAL,
        reported_issues  INTEGER NOT NULL DEFAULT 0
    );

    -- Real-content audio encounters for listen_again (podcast/video/manual clips).
    CREATE TABLE IF NOT EXISTS pr_card_encounter (
        id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        card_id         TEXT NOT NULL REFERENCES deck_cards(id) ON DELETE CASCADE,
        source_type     TEXT NOT NULL DEFAULT 'manual',
        source_id       TEXT,
        source_position INTEGER,
        source_snippet  TEXT,
        audio_clip_url  TEXT,
        audio_start_ms  INTEGER,
        audio_end_ms    INTEGER,
        encountered_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Landing-page daily plan preview (one row per date).
    CREATE TABLE IF NOT EXISTS pr_daily_plan (
        plan_date        TEXT PRIMARY KEY,
        card_queue       TEXT NOT NULL DEFAULT '[]',
        total_cards      INTEGER NOT NULL DEFAULT 0,
        estimated_minutes INTEGER NOT NULL DEFAULT 0,
        config_snapshot  TEXT,
        generated_at     TEXT NOT NULL DEFAULT (datetime('now')),
        consumed_at      TEXT,
        consumed_count   INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_pr_prof_card       ON pr_card_proficiency(card_id);
    CREATE INDEX IF NOT EXISTS idx_pr_prof_deck       ON pr_card_proficiency(deck_id);
    CREATE INDEX IF NOT EXISTS idx_pr_prof_stage      ON pr_card_proficiency(learning_stage);
    CREATE INDEX IF NOT EXISTS idx_pr_activity_session ON pr_activity(session_id);
    CREATE INDEX IF NOT EXISTS idx_pr_activity_card    ON pr_activity(card_id);
    CREATE INDEX IF NOT EXISTS idx_pr_template_card    ON pr_activity_template(card_id, activity_type);
    CREATE INDEX IF NOT EXISTS idx_pr_encounter_card   ON pr_card_encounter(card_id);
";

// V028 — podcast v2 per-episode difficulty + cloud identity.
//
// The web app scores every episode individually (`difficulty_band` A1..C2 +
// `difficulty_score` 0-100 + a band range and confidence), replacing the coarse
// per-feed `cefr_level`. We mirror those columns locally so cloud-discovered
// episodes keep their scores after `podcast_import_cloud_episode`.
//
// `video_id` (`podcast_{feed}_ep_{ep}`) and `curated_episode_id` (the
// `curated_episodes.id` UUID) are the cloud identities: the first addresses an
// episode in `?action=get-episode`, the second is what `?action=
// update-episode-activity` expects. Episodes that exist only on PodcastIndex
// (never curated) leave `curated_episode_id` NULL and skip the cloud heartbeat.
const V028_PODCAST_DIFFICULTY_V2: &str = "
    ALTER TABLE podcast_episodes ADD COLUMN video_id             TEXT;
    ALTER TABLE podcast_episodes ADD COLUMN curated_episode_id   TEXT;
    ALTER TABLE podcast_episodes ADD COLUMN difficulty_band      TEXT;
    ALTER TABLE podcast_episodes ADD COLUMN difficulty_score     INTEGER;
    ALTER TABLE podcast_episodes ADD COLUMN difficulty_range_low TEXT;
    ALTER TABLE podcast_episodes ADD COLUMN difficulty_range_high TEXT;
    ALTER TABLE podcast_episodes ADD COLUMN difficulty_confidence TEXT;
    ALTER TABLE podcast_episodes ADD COLUMN difficulty_lang      TEXT;
    ALTER TABLE podcast_episodes ADD COLUMN speech_rate_wpm      INTEGER;

    ALTER TABLE podcast_feeds ADD COLUMN remote_feed_id            INTEGER;
    ALTER TABLE podcast_feeds ADD COLUMN difficulty_band_low       TEXT;
    ALTER TABLE podcast_feeds ADD COLUMN difficulty_band_high      TEXT;
    ALTER TABLE podcast_feeds ADD COLUMN difficulty_score_median   INTEGER;
    ALTER TABLE podcast_feeds ADD COLUMN difficulty_episodes_scored INTEGER;

    CREATE INDEX IF NOT EXISTS idx_podcast_episodes_video    ON podcast_episodes(video_id);
    CREATE INDEX IF NOT EXISTS idx_podcast_feeds_remote      ON podcast_feeds(remote_feed_id);
";

/// Two transcripts can coexist per episode: the one Whisper produced on this
/// machine (`local`, with word-level timestamps) and the one FlexiLingo already
/// analyzed in the cloud (`cloud`, segment-level only). `podcast_episodes
/// .transcript_source` records which one the player is showing.
///
/// `podcast_nlp_analysis` had a column-level `UNIQUE(episode_id)`, which SQLite
/// cannot drop in place — so the table is rebuilt with a composite key. Existing
/// rows were all produced locally, hence `source = 'local'`.
const V029_TRANSCRIPT_SOURCES: &str = "
    ALTER TABLE podcast_transcript_segments ADD COLUMN source TEXT NOT NULL DEFAULT 'local';
    CREATE INDEX IF NOT EXISTS idx_pts_episode_source
        ON podcast_transcript_segments(episode_id, source, start_ms);

    ALTER TABLE podcast_episodes ADD COLUMN transcript_source       TEXT NOT NULL DEFAULT 'local';
    ALTER TABLE podcast_episodes ADD COLUMN cloud_transcript_status TEXT NOT NULL DEFAULT 'unknown';

    CREATE TABLE podcast_nlp_analysis_v2 (
        id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        episode_id          TEXT NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
        source              TEXT NOT NULL DEFAULT 'local',
        total_words         INTEGER DEFAULT 0,
        unique_words        INTEGER DEFAULT 0,
        cefr_level          TEXT,
        cefr_distribution   TEXT,
        avg_sentence_length REAL DEFAULT 0.0,
        vocabulary_richness REAL DEFAULT 0.0,
        top_words           TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(episode_id, source)
    );

    INSERT INTO podcast_nlp_analysis_v2
        (id, episode_id, source, total_words, unique_words, cefr_level,
         cefr_distribution, avg_sentence_length, vocabulary_richness, top_words, created_at)
    SELECT id, episode_id, 'local', total_words, unique_words, cefr_level,
           cefr_distribution, avg_sentence_length, vocabulary_richness, top_words, created_at
    FROM podcast_nlp_analysis;

    DROP TABLE podcast_nlp_analysis;
    ALTER TABLE podcast_nlp_analysis_v2 RENAME TO podcast_nlp_analysis;

    CREATE INDEX IF NOT EXISTS idx_pna_episode ON podcast_nlp_analysis(episode_id, source);
";

/// Episodes carry their own artwork — a podcast's cover is often not the
/// episode's. The cloud import was already sending `image_url`; there was simply
/// nowhere to put it, so the player fell back to the feed art (or nothing).
const V030_EPISODE_IMAGE: &str = "
    ALTER TABLE podcast_episodes ADD COLUMN image_url TEXT;
";

/// CELPIP local state. The exam itself (parts, grading, scoring) is a FlexiLingo
/// service — these tables hold only what must survive a crash on THIS machine:
/// in-progress section drafts, speaking recordings, and locally-generated AI
/// insight for users without a Pro subscription.
const V031_CELPIP: &str = "
    CREATE TABLE IF NOT EXISTS celpip_drafts (
        session_id   TEXT NOT NULL,
        section      TEXT NOT NULL,
        payload      TEXT NOT NULL,
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (session_id, section)
    );

    CREATE TABLE IF NOT EXISTS celpip_recordings (
        id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        session_id   TEXT NOT NULL,
        task_key     TEXT NOT NULL,
        local_path   TEXT NOT NULL,
        duration_sec INTEGER NOT NULL DEFAULT 0,
        transcript   TEXT,
        audio_url    TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(session_id, task_key)
    );

    -- One row per (session, skill). `status` mirrors the cloud's insight states
    -- so the UI can share a single state machine.
    CREATE TABLE IF NOT EXISTS celpip_local_insight (
        session_id  TEXT NOT NULL,
        skill       TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        result      TEXT,
        error       TEXT,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (session_id, skill)
    );

    CREATE INDEX IF NOT EXISTS idx_celpip_drafts_session ON celpip_drafts(session_id);
    CREATE INDEX IF NOT EXISTS idx_celpip_rec_session    ON celpip_recordings(session_id);
";

// V027 — record the SRS interval on each activity so the session summary can
// report real promotions/demotions. `review_logs` can't be reused: its FK points
// at `review_sessions`, not `pr_session`. NULL when the score stayed below
// SRS_WRITE_THRESHOLD (the schedule was left untouched).
const V027_STUDY_SRS_DELTAS: &str = "
    ALTER TABLE pr_activity ADD COLUMN srs_interval_before REAL;
    ALTER TABLE pr_activity ADD COLUMN srs_interval_after  REAL;
";

#[cfg(test)]
mod v032_migration_tests {
    use super::*;

    /// Seed a deck, a word-backed card and SRS state **at the pre-V032 schema**, then
    /// let V032 run. This is the only arrangement that actually exercises the rebuild:
    /// migrating first and inserting afterwards copies an empty table and proves nothing.
    fn seeded() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        // Match how the app opens the DB — cascades armed.
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        run_migrations_through(&conn, "V031").expect("migrations up to V031");
        assert!(
            !column_exists(&conn, "deck_cards", "order_index"),
            "precondition: V032 has not run yet",
        );

        conn.execute(
            "INSERT INTO decks (id, name, language) VALUES ('d1', 'Deck', 'en')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO vocabulary (id, word, language) VALUES (1, 'hello', 'en')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back)
             VALUES ('c1', 'd1', 1, 'hello', 'salam')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO srs_progress (id, card_id, algorithm, box_number)
             VALUES ('p1', 'c1', 'fsrs', 3)",
            [],
        )
        .unwrap();

        // Now the rebuild runs against a populated table.
        run_migrations(&conn).expect("V032 applies cleanly over existing data");
        conn
    }

    /// The whole reason V032 exists: a card that is not a dictionary word.
    /// Before the rebuild this INSERT failed with a NOT NULL violation.
    #[test]
    fn v032_allows_a_card_with_no_vocabulary_row() {
        let conn = seeded();
        conn.execute(
            "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back)
             VALUES ('c2', 'd1', NULL, 'a cloned card', 'from the cloud')",
            [],
        )
        .expect("cloned cards carry no vocabulary_id");

        // NULLs are distinct in SQLite, so many such cards may coexist in one deck.
        conn.execute(
            "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back)
             VALUES ('c3', 'd1', NULL, 'another', 'one')",
            [],
        )
        .expect("UNIQUE(deck_id, vocabulary_id) must not collide on NULL");
    }

    /// ...while still refusing to add the same real word to a deck twice.
    #[test]
    fn v032_still_rejects_a_duplicate_word_in_one_deck() {
        let conn = seeded();
        let err = conn.execute(
            "INSERT INTO deck_cards (id, deck_id, vocabulary_id, front, back)
             VALUES ('c9', 'd1', 1, 'hello', 'dup')",
            [],
        );
        assert!(err.is_err(), "UNIQUE(deck_id, vocabulary_id) must still hold");
    }

    /// The migration drops and recreates `deck_cards`. Five tables cascade off it.
    /// If the pragma toggle regressed, this test loses the SRS row.
    #[test]
    fn v032_rebuild_preserves_srs_progress_and_card_ids() {
        let conn = seeded();

        let cards: i64 = conn
            .query_row("SELECT COUNT(*) FROM deck_cards WHERE id = 'c1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(cards, 1, "the card survived the rebuild with its id intact");

        let srs: i64 = conn
            .query_row("SELECT COUNT(*) FROM srs_progress WHERE card_id = 'c1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(srs, 1, "the cascade must NOT have fired during the rebuild");

        let box_number: i64 = conn
            .query_row("SELECT box_number FROM srs_progress WHERE id = 'p1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(box_number, 3, "scheduling state is untouched");
    }

    /// Foreign keys must be back ON when the migration returns, or every later
    /// cascade in the app silently stops working.
    #[test]
    fn v032_restores_the_foreign_keys_pragma() {
        let conn = seeded();
        let fk: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
        assert_eq!(fk, 1, "foreign_keys must be re-enabled after V032");

        // Prove enforcement is live: deleting the deck cascades to its cards.
        conn.execute("DELETE FROM decks WHERE id = 'd1'", []).unwrap();
        let left: i64 = conn
            .query_row("SELECT COUNT(*) FROM deck_cards", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 0, "cascade is active again");
    }

    /// Every podcast bookmark becomes a note, keeping its id.
    #[test]
    fn v032_migrates_podcast_bookmarks_into_notes() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        // The bookmark must exist BEFORE V032, or the data migration copies nothing.
        run_migrations_through(&conn, "V031").expect("migrations up to V031");
        conn.execute(
            "INSERT INTO podcast_feeds (id, feed_url, title, language)
             VALUES ('f1', 'https://example.com/rss', 'Feed', 'en')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO podcast_episodes (id, feed_id, title, audio_url, duration_seconds)
             VALUES ('e1', 'f1', 'Ep', 'https://example.com/a.mp3', 60)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO podcast_bookmarks (id, episode_id, position_ms, label, note)
             VALUES ('bk1', 'e1', 12000, 'a label', 'a note')",
            [],
        )
        .unwrap();

        run_migrations(&conn).expect("V032 applies cleanly");

        // Re-running the copy must not duplicate the row.
        conn.execute_batch(V032_NOTES).unwrap();

        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes WHERE id = 'bk1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1, "the bookmark migrates exactly once, keeping its id");

        let (module, source_id, pos): (String, String, i64) = conn
            .query_row(
                "SELECT source_module, source_id, position_ms FROM notes WHERE id = 'bk1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!((module.as_str(), source_id.as_str(), pos), ("podcast", "e1", 12000));
    }

    /// The notes table refuses a source it cannot render.
    #[test]
    fn v032_notes_reject_an_unknown_source_module() {
        let conn = seeded();
        let err = conn.execute(
            "INSERT INTO notes (source_module, source_id) VALUES ('youtube', 'x')",
            [],
        );
        assert!(err.is_err(), "source_module CHECK must hold");
    }
}

#[cfg(test)]
mod study_migration_tests {
    use super::*;

    /// The V029 rebuild of `podcast_nlp_analysis` must carry existing rows over and
    /// stamp them `local` — a silent data loss here would wipe every offline analysis.
    #[test]
    fn v029_transcript_sources_preserve_existing_nlp_rows() {
        let conn = Connection::open_in_memory().expect("open in-memory db");

        // Run everything up to (not including) V029, then seed a legacy NLP row.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS _migrations (version TEXT PRIMARY KEY, applied_at TEXT);",
        )
        .unwrap();
        run_migrations(&conn).expect("migrations run cleanly");

        conn.execute(
            "INSERT INTO podcast_feeds (id, feed_url, title, language)
             VALUES ('f1', 'https://example.com/rss', 'Feed', 'en')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO podcast_episodes (id, feed_id, title, audio_url, duration_seconds)
             VALUES ('e1', 'f1', 'Ep', 'https://example.com/a.mp3', 60)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO podcast_nlp_analysis (episode_id, source, total_words, cefr_level)
             VALUES ('e1', 'local', 42, 'B1')",
            [],
        )
        .unwrap();

        // Both sources can hold an analysis for the same episode simultaneously.
        conn.execute(
            "INSERT INTO podcast_nlp_analysis (episode_id, source, total_words, cefr_level)
             VALUES ('e1', 'cloud', 99, 'B2')",
            [],
        )
        .expect("composite UNIQUE(episode_id, source) must allow a second source");

        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM podcast_nlp_analysis WHERE episode_id = 'e1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 2, "local and cloud analyses coexist");

        // The old column-level UNIQUE(episode_id) must be gone.
        conn.execute(
            "INSERT INTO podcast_nlp_analysis (episode_id, source, total_words) VALUES ('e1', 'local', 1)",
            [],
        )
        .expect_err("re-inserting the same (episode_id, source) must still conflict");
    }

    #[test]
    fn v031_creates_celpip_tables() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        run_migrations(&conn).expect("migrations run cleanly");

        for table in ["celpip_drafts", "celpip_recordings", "celpip_local_insight"] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    rusqlite::params![table],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "table {table} should exist");
        }

        // A draft is unique per (session, section) so re-saving overwrites.
        conn.execute(
            "INSERT INTO celpip_drafts (session_id, section, payload) VALUES ('s1','listening','{}')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO celpip_drafts (session_id, section, payload) VALUES ('s1','listening','{\"a\":1}')
             ON CONFLICT(session_id, section) DO UPDATE SET payload = excluded.payload",
            [],
        )
        .unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM celpip_drafts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1, "draft upsert must not duplicate");

        // Insight is unique per (session, skill).
        conn.execute(
            "INSERT INTO celpip_local_insight (session_id, skill, status) VALUES ('s1','writing','ready')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO celpip_local_insight (session_id, skill, status) VALUES ('s1','writing','pending')",
            [],
        )
        .expect_err("same (session, skill) must conflict");
    }

    #[test]
    fn v029_adds_transcript_source_columns() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        run_migrations(&conn).expect("migrations run cleanly");

        for col in ["transcript_source", "cloud_transcript_status"] {
            let found: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('podcast_episodes') WHERE name = ?1",
                    rusqlite::params![col],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(found, 1, "podcast_episodes.{col} should exist");
        }

        let found: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('podcast_transcript_segments') WHERE name = 'source'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(found, 1, "podcast_transcript_segments.source should exist");
    }

    #[test]
    fn v026_study_tables_created() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        run_migrations(&conn).expect("migrations run cleanly");

        // All pr_* study tables must exist after V026.
        for table in [
            "pr_practice_config",
            "pr_card_proficiency",
            "pr_session",
            "pr_activity",
            "pr_activity_template",
            "pr_card_encounter",
            "pr_daily_plan",
        ] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    rusqlite::params![table],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "table {table} should exist");
        }

        // V027 adds the SRS delta columns used by the session summary.
        for col in ["srs_interval_before", "srs_interval_after"] {
            let found: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('pr_activity') WHERE name = ?1",
                    rusqlite::params![col],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(found, 1, "pr_activity.{col} should exist");
        }

        // V028 adds the podcast v2 difficulty + cloud-identity columns.
        for col in [
            "video_id",
            "curated_episode_id",
            "difficulty_band",
            "difficulty_score",
            "difficulty_range_low",
            "difficulty_range_high",
            "difficulty_confidence",
            "difficulty_lang",
            "speech_rate_wpm",
        ] {
            let found: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('podcast_episodes') WHERE name = ?1",
                    rusqlite::params![col],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(found, 1, "podcast_episodes.{col} should exist");
        }
        for col in [
            "remote_feed_id",
            "difficulty_band_low",
            "difficulty_band_high",
            "difficulty_score_median",
            "difficulty_episodes_scored",
        ] {
            let found: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('podcast_feeds') WHERE name = ?1",
                    rusqlite::params![col],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(found, 1, "podcast_feeds.{col} should exist");
        }

        // Re-running migrations is idempotent (the ledger skips the ALTERs).
        run_migrations(&conn).expect("re-run migrations idempotent");
    }
}

// V035 — the Reader. PDFs and photos stay on this computer: `file_path` points into
// `$APPDATA/reader/`, and extraction (text layer + OCR) runs locally. The tables mirror
// the cloud's `reader_*` tables minus `user_id`, so the JSON the commands return has the
// same field names the website's components already consume. Everything cascades off
// `reader_documents`, so deleting a document leaves nothing behind.
//
// Columns whose name differs from the cloud (`kind`, `size_bytes`, `page`) are aliased
// back to the cloud's name (`source_kind`, `byte_size`, `page_number`) in the SELECTs.
const V035_READER: &str = "
    CREATE TABLE IF NOT EXISTS reader_documents (
        id                     TEXT PRIMARY KEY,
        title                  TEXT NOT NULL,
        original_filename      TEXT NOT NULL,
        kind                   TEXT NOT NULL DEFAULT 'pdf' CHECK (kind IN ('pdf', 'image')),
        file_path              TEXT NOT NULL,
        size_bytes             INTEGER NOT NULL DEFAULT 0,
        language               TEXT NOT NULL DEFAULT 'en',
        page_count             INTEGER,
        word_count             INTEGER,
        extraction_method      TEXT CHECK (extraction_method IS NULL OR extraction_method IN ('text', 'ocr', 'mixed')),
        last_page              INTEGER NOT NULL DEFAULT 1 CHECK (last_page >= 1),
        last_scroll_pct        INTEGER NOT NULL DEFAULT 0 CHECK (last_scroll_pct BETWEEN 0 AND 100),
        last_read_at           TEXT,
        finished_at            TEXT,
        book_edition           TEXT,
        text_layer_status      TEXT CHECK (text_layer_status IS NULL OR text_layer_status IN ('pending', 'running', 'ready', 'failed')),
        text_layer_pages_done  INTEGER,
        text_layer_pages_total INTEGER,
        text_layer_error       TEXT,
        created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reader_documents_created ON reader_documents(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reader_documents_size    ON reader_documents(size_bytes);

    -- One row per scanned page. `words_json` is the cloud's `ocr_words` shape:
    -- {\"v\":1,\"lines\":[[x0,y0,x1,y1]],\"words\":[[text,x0,y0,x1,y1,line]]}, fractions of the page.
    CREATE TABLE IF NOT EXISTS reader_ocr_pages (
        document_id TEXT NOT NULL REFERENCES reader_documents(id) ON DELETE CASCADE,
        page        INTEGER NOT NULL CHECK (page >= 1),
        words_json  TEXT,
        status      TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'failed')),
        error_code  TEXT,
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (document_id, page)
    );

    CREATE TABLE IF NOT EXISTS reader_sessions (
        id           TEXT PRIMARY KEY,
        document_id  TEXT NOT NULL REFERENCES reader_documents(id) ON DELETE CASCADE,
        started_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        start_page   INTEGER NOT NULL DEFAULT 1 CHECK (start_page >= 1),
        end_page     INTEGER NOT NULL DEFAULT 1 CHECK (end_page >= 1),
        word_count   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_reader_sessions_doc ON reader_sessions(document_id, last_seen_at DESC);

    -- Every word opened while reading. Not deduplicated: repetition is the signal.
    CREATE TABLE IF NOT EXISTS reader_word_log (
        id          TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES reader_documents(id) ON DELETE CASCADE,
        session_id  TEXT REFERENCES reader_sessions(id) ON DELETE SET NULL,
        word        TEXT NOT NULL CHECK (length(word) BETWEEN 1 AND 120),
        word_key    TEXT NOT NULL CHECK (length(word_key) BETWEEN 1 AND 120),
        context     TEXT,
        page        INTEGER NOT NULL CHECK (page >= 1),
        language    TEXT NOT NULL DEFAULT 'en',
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reader_word_log_doc     ON reader_word_log(document_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reader_word_log_session ON reader_word_log(session_id);

    CREATE TABLE IF NOT EXISTS reader_notes (
        id          TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES reader_documents(id) ON DELETE CASCADE,
        page_number INTEGER NOT NULL CHECK (page_number >= 1),
        quote       TEXT NOT NULL DEFAULT '' CHECK (length(quote) <= 2000),
        body        TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 8000),
        run_start   INTEGER,
        run_end     INTEGER,
        rect_x      REAL NOT NULL DEFAULT 0 CHECK (rect_x BETWEEN 0 AND 100),
        rect_y      REAL NOT NULL DEFAULT 0 CHECK (rect_y BETWEEN 0 AND 100),
        rect_w      REAL NOT NULL DEFAULT 0 CHECK (rect_w BETWEEN 0 AND 100),
        rect_h      REAL NOT NULL DEFAULT 0 CHECK (rect_h BETWEEN 0 AND 100),
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reader_notes_doc_page ON reader_notes(document_id, page_number);

    CREATE TABLE IF NOT EXISTS reader_text_boxes (
        id          TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES reader_documents(id) ON DELETE CASCADE,
        page_number INTEGER NOT NULL CHECK (page_number >= 1),
        body        TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 2000),
        x           REAL NOT NULL CHECK (x BETWEEN 0 AND 100),
        y           REAL NOT NULL CHECK (y BETWEEN 0 AND 100),
        w           REAL NOT NULL CHECK (w BETWEEN 1 AND 100),
        font_size   REAL NOT NULL DEFAULT 1.6 CHECK (font_size BETWEEN 0.3 AND 10),
        color       TEXT NOT NULL DEFAULT 'terra',
        bold        INTEGER NOT NULL DEFAULT 0 CHECK (bold IN (0, 1)),
        background  INTEGER NOT NULL DEFAULT 0 CHECK (background IN (0, 1)),
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reader_text_boxes_doc_page ON reader_text_boxes(document_id, page_number);

    CREATE TABLE IF NOT EXISTS reader_marks (
        id          TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES reader_documents(id) ON DELETE CASCADE,
        page_number INTEGER NOT NULL CHECK (page_number >= 1),
        kind        TEXT NOT NULL CHECK (kind IN ('arrow', 'box', 'check', 'cross', 'question', 'star', 'highlight')),
        x1          REAL NOT NULL CHECK (x1 BETWEEN 0 AND 100),
        y1          REAL NOT NULL CHECK (y1 BETWEEN 0 AND 100),
        x2          REAL NOT NULL CHECK (x2 BETWEEN 0 AND 100),
        y2          REAL NOT NULL CHECK (y2 BETWEEN 0 AND 100),
        size        REAL NOT NULL DEFAULT 1.6 CHECK (size BETWEEN 0.3 AND 10),
        color       TEXT NOT NULL DEFAULT 'terra',
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reader_marks_doc_page ON reader_marks(document_id, page_number);
";

// V036 — text documents. A pasted text or a web page becomes a Reader document of kind
// `text`, with its pages stored in `reader_text_pages` (there is no file to render).
// SQLite cannot widen a CHECK in place, so `reader_documents` is rebuilt; every child
// table references it by name, so the rebuild runs with foreign keys off and the rows
// of every child table survive untouched.
const V036_REBUILD: &str = "
    CREATE TABLE reader_documents_v036 (
        id                     TEXT PRIMARY KEY,
        title                  TEXT NOT NULL,
        original_filename      TEXT NOT NULL,
        kind                   TEXT NOT NULL DEFAULT 'pdf' CHECK (kind IN ('pdf', 'image', 'text')),
        file_path              TEXT NOT NULL,
        size_bytes             INTEGER NOT NULL DEFAULT 0,
        language               TEXT NOT NULL DEFAULT 'en',
        page_count             INTEGER,
        word_count             INTEGER,
        extraction_method      TEXT CHECK (extraction_method IS NULL OR extraction_method IN ('text', 'ocr', 'mixed')),
        last_page              INTEGER NOT NULL DEFAULT 1 CHECK (last_page >= 1),
        last_scroll_pct        INTEGER NOT NULL DEFAULT 0 CHECK (last_scroll_pct BETWEEN 0 AND 100),
        last_read_at           TEXT,
        finished_at            TEXT,
        book_edition           TEXT,
        text_layer_status      TEXT CHECK (text_layer_status IS NULL OR text_layer_status IN ('pending', 'running', 'ready', 'failed')),
        text_layer_pages_done  INTEGER,
        text_layer_pages_total INTEGER,
        text_layer_error       TEXT,
        created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT INTO reader_documents_v036 (
        id, title, original_filename, kind, file_path, size_bytes, language, page_count, word_count,
        extraction_method, last_page, last_scroll_pct, last_read_at, finished_at, book_edition,
        text_layer_status, text_layer_pages_done, text_layer_pages_total, text_layer_error,
        created_at, updated_at
    ) SELECT
        id, title, original_filename, kind, file_path, size_bytes, language, page_count, word_count,
        extraction_method, last_page, last_scroll_pct, last_read_at, finished_at, book_edition,
        text_layer_status, text_layer_pages_done, text_layer_pages_total, text_layer_error,
        created_at, updated_at
    FROM reader_documents;
    DROP TABLE reader_documents;
    ALTER TABLE reader_documents_v036 RENAME TO reader_documents;
    CREATE INDEX IF NOT EXISTS idx_reader_documents_created ON reader_documents(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reader_documents_size    ON reader_documents(size_bytes);
";

// V039 — the website's Cheatsheet, kept on this computer: every index, topic and verb response
// the app fetched, as the JSON it arrived as, so a page opened once opens again offline.
// `key` carries the explain locale (`en`, `en:petits-mots`, `en:prendre`).
const V039_CHEATSHEET_CACHE: &str = "
    CREATE TABLE IF NOT EXISTS cheatsheet_cache (
        lang       TEXT NOT NULL,
        kind       TEXT NOT NULL,
        key        TEXT NOT NULL,
        body       TEXT NOT NULL,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (lang, kind, key)
    );
";

// V038 — decks carry the whole language pair, a cover and the public-source flag, like the
// website's decks (`language_pair`, `cover_url`, `source_public`). `language` stays the
// language the cards are written in; `native_language` is the one the meanings are in
// (NULL on decks made before this, where only `language` is known).
const V038_DECK_PAIR: &str = "
    ALTER TABLE decks ADD COLUMN native_language TEXT;
    ALTER TABLE decks ADD COLUMN cover_url TEXT;
    ALTER TABLE decks ADD COLUMN source_public INTEGER NOT NULL DEFAULT 0;
";

// V037 — the Overview dashboard: listening time per day, when each episode was last
// played, and minutes a learner logs by hand. Reading time is derived from `reader_sessions`.
const V037_OVERVIEW: &str = "
    CREATE TABLE IF NOT EXISTS overview_listen_day (
        date   TEXT PRIMARY KEY,
        millis INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS overview_listen_last (
        episode_id     TEXT PRIMARY KEY,
        last_played_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS overview_manual (
        date    TEXT PRIMARY KEY,
        minutes INTEGER NOT NULL DEFAULT 0
    );
";

const V036_TEXT_PAGES: &str = "
    CREATE TABLE IF NOT EXISTS reader_text_pages (
        document_id TEXT NOT NULL REFERENCES reader_documents(id) ON DELETE CASCADE,
        page        INTEGER NOT NULL CHECK (page >= 1),
        content     TEXT NOT NULL,
        PRIMARY KEY (document_id, page)
    );
";

fn run_v036_reader_text(conn: &Connection) -> Result<(), String> {
    // The pragma is a no-op inside a transaction, so it is toggled out here.
    let fk_was_on: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap_or(0);
    conn.pragma_update(None, "foreign_keys", "OFF")
        .map_err(|e| format!("V036: could not disable foreign keys: {e}"))?;

    let result = (|| -> Result<(), String> {
        let tx = conn.unchecked_transaction().map_err(|e| format!("V036: begin: {e}"))?;
        // Already wide (a re-run after a crash between steps): nothing to rebuild.
        let sql: String = tx
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reader_documents'",
                [],
                |r| r.get(0),
            )
            .map_err(|e| format!("V036: read schema: {e}"))?;
        if !sql.contains("'image', 'text'") {
            tx.execute_batch(V036_REBUILD).map_err(|e| format!("V036: rebuild: {e}"))?;
        }
        tx.execute_batch(V036_TEXT_PAGES).map_err(|e| format!("V036: pages: {e}"))?;

        let violations: i64 = {
            let mut stmt = tx
                .prepare("PRAGMA foreign_key_check")
                .map_err(|e| format!("V036: foreign_key_check: {e}"))?;
            let mut rows = stmt.query([]).map_err(|e| format!("V036: fk rows: {e}"))?;
            let mut n = 0i64;
            while rows.next().map_err(|e| format!("V036: fk row: {e}"))?.is_some() {
                n += 1;
            }
            n
        };
        if violations > 0 {
            return Err(format!("V036: {violations} foreign-key violations after rebuild; refusing to commit"));
        }
        tx.commit().map_err(|e| format!("V036: commit: {e}"))
    })();

    if fk_was_on != 0 {
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| format!("V036: could not restore foreign keys: {e}"))?;
    }
    result
}

#[cfg(test)]
mod v036_reader_text_tests {
    use super::*;

    fn at_v035() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations_through(&conn, "V035").expect("migrations up to V035");
        conn
    }

    #[test]
    fn rebuild_keeps_documents_and_every_child_row() {
        let conn = at_v035();
        conn.execute(
            "INSERT INTO reader_documents (id, title, original_filename, file_path, last_page, language) VALUES ('d1', 'Toronto', 't.pdf', 'd1.pdf', 7, 'fr')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO reader_notes (id, document_id, page_number, body) VALUES ('n1', 'd1', 2, 'hi')", [])
            .unwrap();
        conn.execute("INSERT INTO reader_word_log (id, document_id, word, word_key, page) VALUES ('w1', 'd1', 'Maison', 'maison', 2)", [])
            .unwrap();

        run_migrations(&conn).expect("V036 applies on top of V035");

        let (title, page, lang): (String, i64, String) = conn
            .query_row("SELECT title, last_page, language FROM reader_documents WHERE id = 'd1'", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .unwrap();
        assert_eq!((title.as_str(), page, lang.as_str()), ("Toronto", 7, "fr"));
        let notes: i64 = conn.query_row("SELECT COUNT(*) FROM reader_notes", [], |r| r.get(0)).unwrap();
        let words: i64 = conn.query_row("SELECT COUNT(*) FROM reader_word_log", [], |r| r.get(0)).unwrap();
        assert_eq!((notes, words), (1, 1), "child rows survive the rebuild");
        let fk: i64 = conn.query_row("SELECT foreign_keys FROM pragma_foreign_keys", [], |r| r.get(0)).unwrap();
        assert_eq!(fk, 1, "foreign keys are switched back on");
        let violations = conn.prepare("PRAGMA foreign_key_check").unwrap().query([]).unwrap().next().unwrap().is_some();
        assert!(!violations);
    }

    #[test]
    fn text_kind_is_accepted_other_kinds_are_not_and_pages_cascade() {
        let conn = at_v035();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO reader_documents (id, title, original_filename, file_path, kind) VALUES ('t1', 'Pasted', 'pasted.txt', '', 'text')",
            [],
        )
        .unwrap();
        assert!(conn
            .execute(
                "INSERT INTO reader_documents (id, title, original_filename, file_path, kind) VALUES ('x', 'T', 't', 'p', 'video')",
                [],
            )
            .is_err());
        conn.execute("INSERT INTO reader_text_pages (document_id, page, content) VALUES ('t1', 1, 'Hello')", [])
            .unwrap();
        conn.execute("DELETE FROM reader_documents WHERE id = 't1'", []).unwrap();
        let left: i64 = conn.query_row("SELECT COUNT(*) FROM reader_text_pages", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0, "deleting a document takes its pages with it");
        // Indexes came back with the rebuilt table.
        let idx: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_reader_documents_size'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(idx, 1);
    }

    #[test]
    fn running_twice_is_harmless() {
        let conn = at_v035();
        run_migrations(&conn).unwrap();
        run_v036_reader_text(&conn).expect("a second run changes nothing");
    }
}

#[cfg(test)]
mod v035_reader_migration_tests {
    use super::*;

    fn at_v034() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        run_migrations_through(&conn, "V034").expect("migrations up to V034");
        conn
    }

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
            rusqlite::params![name],
            |r| r.get::<_, i64>(0),
        )
        .unwrap()
            == 1
    }

    #[test]
    fn creates_every_reader_table_on_an_existing_database() {
        let conn = at_v034();
        assert!(!table_exists(&conn, "reader_documents"), "precondition: V035 has not run");
        // Existing data must survive the migration.
        conn.execute(
            "INSERT INTO podcast_feeds (id, feed_url, title, language) VALUES ('f1', 'https://example.com/rss', 'Feed', 'en')",
            [],
        )
        .unwrap();

        run_migrations(&conn).expect("V035 applies on top of V034");

        for t in [
            "reader_documents",
            "reader_ocr_pages",
            "reader_sessions",
            "reader_word_log",
            "reader_notes",
            "reader_text_boxes",
            "reader_marks",
        ] {
            assert!(table_exists(&conn, t), "{t} should exist");
        }
        let feeds: i64 = conn.query_row("SELECT COUNT(*) FROM podcast_feeds", [], |r| r.get(0)).unwrap();
        assert_eq!(feeds, 1);
        let applied: i64 = conn
            .query_row("SELECT COUNT(*) FROM _migrations WHERE version = 'V035'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(applied, 1);

        // Idempotent.
        run_migrations(&conn).expect("re-run is a no-op");
    }

    #[test]
    fn deleting_a_document_cascades_to_everything_hanging_off_it() {
        let conn = at_v034();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO reader_documents (id, title, original_filename, file_path) VALUES ('d1', 'T', 't.pdf', 'd1.pdf')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO reader_ocr_pages (document_id, page, words_json) VALUES ('d1', 1, '{}')", []).unwrap();
        conn.execute("INSERT INTO reader_sessions (id, document_id) VALUES ('s1', 'd1')", []).unwrap();
        conn.execute(
            "INSERT INTO reader_word_log (id, document_id, session_id, word, word_key, page) VALUES ('w1', 'd1', 's1', 'Hi', 'hi', 1)",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO reader_notes (id, document_id, page_number) VALUES ('n1', 'd1', 1)", []).unwrap();
        conn.execute(
            "INSERT INTO reader_text_boxes (id, document_id, page_number, x, y, w) VALUES ('t1', 'd1', 1, 1, 1, 10)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO reader_marks (id, document_id, page_number, kind, x1, y1, x2, y2) VALUES ('m1', 'd1', 1, 'box', 1, 1, 2, 2)",
            [],
        )
        .unwrap();

        conn.execute("DELETE FROM reader_documents WHERE id = 'd1'", []).unwrap();

        for t in [
            "reader_ocr_pages",
            "reader_sessions",
            "reader_word_log",
            "reader_notes",
            "reader_text_boxes",
            "reader_marks",
        ] {
            let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0)).unwrap();
            assert_eq!(n, 0, "{t} must be emptied by the cascade");
        }
    }

    #[test]
    fn check_constraints_reject_bad_enums_and_ranges() {
        let conn = at_v034();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO reader_documents (id, title, original_filename, file_path) VALUES ('d1', 'T', 't.pdf', 'd1.pdf')",
            [],
        )
        .unwrap();
        assert!(conn
            .execute(
                "INSERT INTO reader_documents (id, title, original_filename, file_path, kind) VALUES ('d2', 'T', 't', 'p', 'video')",
                [],
            )
            .is_err());
        assert!(conn
            .execute(
                "INSERT INTO reader_marks (id, document_id, page_number, kind, x1, y1, x2, y2) VALUES ('m', 'd1', 1, 'sparkle', 1, 1, 2, 2)",
                [],
            )
            .is_err());
        assert!(conn
            .execute(
                "INSERT INTO reader_text_boxes (id, document_id, page_number, x, y, w) VALUES ('t', 'd1', 1, 101, 1, 10)",
                [],
            )
            .is_err());
        assert!(conn
            .execute("INSERT INTO reader_ocr_pages (document_id, page, status) VALUES ('d1', 1, 'weird')", [])
            .is_err());
    }
}
