//! Local Reader.
//!
//! PDFs and photos stay on this computer and extraction (text layer + OCR) runs here, so
//! there is no upload, no Pro gate and no size / page / hour cap. What this module keeps
//! from the cloud (`flexi-lingo-core/supabase/functions/reader`) is the *shape* of every
//! response and the validation that protects data: lengths, enums, percentage ranges.
//! Later phases port the website's components, which read these field names.
//!
//! * `mod.rs`   — pure logic (validation, clamping, grouping) with tests.
//! * `store.rs` — SQLite access taking a `&Connection`, tested against in-memory databases.
//! * `files.rs` — copying documents into `$APPDATA/reader/`.

pub mod files;
pub mod store;
pub mod text;

use serde_json::Value;

pub const MAX_WORD_CHARS: usize = 120;
pub const MAX_CONTEXT_CHARS: usize = 400;
pub const MAX_TITLE_CHARS: usize = 200;
pub const MAX_EDITION_CHARS: usize = 60;
pub const SESSION_IDLE_MINUTES: i64 = 90;

pub const MARK_KINDS: [&str; 7] = ["arrow", "box", "check", "cross", "question", "star", "highlight"];
pub const TEXT_LAYER_STATUSES: [&str; 4] = ["pending", "running", "ready", "failed"];

/// `Math.min(max, Math.max(min, n))`, with `fallback` for NaN / missing.
pub fn clamp(n: Option<f64>, min: f64, max: f64, fallback: f64) -> f64 {
    match n {
        Some(v) if v.is_finite() => v.clamp(min, max),
        _ => fallback,
    }
}

/// A page number: at least 1, whole.
pub fn page_number(n: Option<f64>) -> i64 {
    match n {
        Some(v) if v.is_finite() => (v.floor() as i64).max(1),
        _ => 1,
    }
}

/// Ink is a palette name or the learner's own `#rrggbb` — never arbitrary text.
pub fn is_valid_ink(color: &str) -> bool {
    if matches!(color, "terra" | "ink" | "olive" | "danger") {
        return true;
    }
    let b = color.as_bytes();
    b.len() == 7 && b[0] == b'#' && b[1..].iter().all(|c| c.is_ascii_hexdigit())
}

pub fn ink_or_default(color: Option<&str>) -> String {
    match color {
        Some(c) if is_valid_ink(c) => c.to_string(),
        _ => "terra".to_string(),
    }
}

pub fn is_mark_kind(kind: &str) -> bool {
    MARK_KINDS.contains(&kind)
}

/// A language code: 2-3 lowercase letters, optionally with a short region (`pt-br`).
/// The cloud restricts to ten languages; the desktop reads whatever the learner owns.
pub fn normalise_language(requested: Option<&str>, fallback: &str) -> String {
    if let Some(raw) = requested {
        let l: String = raw.trim().to_lowercase();
        let ok = (2..=5).contains(&l.len())
            && l.chars().all(|c| c.is_ascii_lowercase() || c == '-')
            && !l.starts_with('-')
            && !l.ends_with('-');
        if ok {
            return l;
        }
    }
    fallback.to_string()
}

/// A filename safe to use as a path segment (same rule as the cloud's `safeFileName`).
pub fn safe_file_name(file_name: Option<&str>, kind: &str) -> String {
    let fallback = if kind == "pdf" { "document.pdf" } else { "image.jpg" };
    let name = match file_name {
        Some(n) if !n.trim().is_empty() => n,
        _ => fallback,
    };
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') { c } else { '_' })
        .take(128)
        .collect()
}

/// A human title: the filename without its extension.
pub fn title_from_file_name(file_name: Option<&str>) -> String {
    let raw = match file_name {
        Some(n) if !n.trim().is_empty() => n,
        _ => "Document",
    };
    // Same as the cloud's /\.[^.]+$/: strip the last dot and a non-empty extension.
    let stem = match raw.rfind('.') {
        Some(i) if i + 1 < raw.len() => &raw[..i],
        _ => raw,
    };
    let spaced: String = stem.chars().map(|c| if c == '_' || c == '-' { ' ' } else { c }).collect();
    let collapsed = spaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let title: String = if collapsed.is_empty() { "Document".to_string() } else { collapsed };
    title.chars().take(MAX_TITLE_CHARS).collect()
}

/// `%PDF-` within the first KiB, as every PDF reader tolerates a short preamble.
pub fn looks_like_pdf(bytes: &[u8]) -> bool {
    let head = &bytes[..bytes.len().min(1024)];
    head.windows(5).any(|w| w == b"%PDF-")
}

/// Percent-decoded header value (file names travel in an IPC header).
pub fn decode_header(value: &str) -> String {
    urlencoding::decode(value).map(|c| c.into_owned()).unwrap_or_else(|_| value.to_string())
}

/// One looked-up word, as stored.
#[derive(Debug, Clone)]
pub struct WordEvent {
    pub word: String,
    pub word_key: String,
    pub context: Option<String>,
    pub page: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct WordSummary {
    pub word: String,
    pub key: String,
    pub count: i64,
    pub pages: Vec<i64>,
    pub context: Option<String>,
    pub last_seen: String,
}

/// Fold events (newest first) into one entry per word: count, pages, the NEWEST context.
/// Sorted by count, then by most recently seen — identical to `reader?action=words`.
pub fn group_words(events: &[WordEvent]) -> Vec<WordSummary> {
    let mut out: Vec<WordSummary> = Vec::new();
    for e in events {
        if let Some(existing) = out.iter_mut().find(|s| s.key == e.word_key) {
            existing.count += 1;
            if !existing.pages.contains(&e.page) {
                existing.pages.push(e.page);
            }
            continue;
        }
        out.push(WordSummary {
            word: e.word.clone(),
            key: e.word_key.clone(),
            count: 1,
            pages: vec![e.page],
            context: e.context.clone(),
            last_seen: e.created_at.clone(),
        });
    }
    out.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| b.last_seen.cmp(&a.last_seen)));
    out
}

/// Validate the `ocr_words` shape the front's `OcrWords` type describes:
/// `{ v: 1, lines: [[x0,y0,x1,y1]], words: [[text,x0,y0,x1,y1,lineIndex]] }`, all
/// coordinates fractions of the page (0..=1, with a little slack for rounding).
pub fn validate_ocr_words(v: &Value) -> Result<(), String> {
    let bad = || "INVALID_OCR_WORDS".to_string();
    let obj = v.as_object().ok_or_else(bad)?;
    if obj.get("v").and_then(Value::as_i64) != Some(1) {
        return Err(bad());
    }
    let lines = obj.get("lines").and_then(Value::as_array).ok_or_else(bad)?;
    let words = obj.get("words").and_then(Value::as_array).ok_or_else(bad)?;
    let in_range = |x: &Value| x.as_f64().map(|f| (-0.01..=1.01).contains(&f)).unwrap_or(false);

    for l in lines {
        let a = l.as_array().ok_or_else(bad)?;
        if a.len() != 4 || !a.iter().all(in_range) {
            return Err(bad());
        }
    }
    for w in words {
        let a = w.as_array().ok_or_else(bad)?;
        if a.len() != 6 {
            return Err(bad());
        }
        let text = a[0].as_str().ok_or_else(bad)?;
        if text.is_empty() || text.chars().count() > MAX_WORD_CHARS * 2 {
            return Err(bad());
        }
        if !a[1..5].iter().all(in_range) {
            return Err(bad());
        }
        let line = a[5].as_u64().ok_or_else(bad)? as usize;
        if line >= lines.len() {
            return Err(bad());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn clamp_matches_the_cloud_helper() {
        assert_eq!(clamp(Some(150.0), 0.0, 100.0, 0.0), 100.0);
        assert_eq!(clamp(Some(-3.0), 0.0, 100.0, 0.0), 0.0);
        assert_eq!(clamp(None, 1.0, 100.0, 20.0), 20.0);
        assert_eq!(clamp(Some(f64::NAN), 1.0, 100.0, 20.0), 20.0);
    }

    #[test]
    fn page_numbers_are_whole_and_at_least_one() {
        assert_eq!(page_number(None), 1);
        assert_eq!(page_number(Some(0.0)), 1);
        assert_eq!(page_number(Some(-4.0)), 1);
        assert_eq!(page_number(Some(7.9)), 7);
    }

    #[test]
    fn ink_accepts_palette_names_and_hex_only() {
        for ok in ["terra", "ink", "olive", "danger", "#a1B2c3"] {
            assert!(is_valid_ink(ok), "{ok}");
        }
        for bad in ["red", "#fff", "#12345g", "#1234567", "url(x)", ""] {
            assert!(!is_valid_ink(bad), "{bad}");
        }
        assert_eq!(ink_or_default(Some("javascript:1")), "terra");
        assert_eq!(ink_or_default(None), "terra");
        assert_eq!(ink_or_default(Some("#00ff00")), "#00ff00");
    }

    #[test]
    fn mark_kinds_include_highlight_and_reject_unknown() {
        assert!(is_mark_kind("highlight"));
        assert!(!is_mark_kind("circle"));
    }

    #[test]
    fn language_is_a_short_lowercase_code_or_the_fallback() {
        assert_eq!(normalise_language(Some("FR"), "en"), "fr");
        assert_eq!(normalise_language(Some("pt-BR"), "en"), "pt-br");
        assert_eq!(normalise_language(Some("fa"), "en"), "fa");
        assert_eq!(normalise_language(Some("english!"), "en"), "en");
        assert_eq!(normalise_language(Some("x"), "en"), "en");
        assert_eq!(normalise_language(None, "de"), "de");
    }

    #[test]
    fn file_names_become_safe_segments_and_titles() {
        assert_eq!(safe_file_name(Some("../My Book (1).pdf"), "pdf"), ".._My_Book__1_.pdf");
        assert_eq!(safe_file_name(None, "pdf"), "document.pdf");
        assert_eq!(safe_file_name(Some("  "), "image"), "image.jpg");
        assert_eq!(safe_file_name(Some(&"a".repeat(300)), "pdf").len(), 128);
        assert_eq!(title_from_file_name(Some("my_great-book.pdf")), "my great book");
        assert_eq!(title_from_file_name(Some(".pdf")), "Document");
        assert_eq!(title_from_file_name(Some("a.")), "a.");
        assert_eq!(title_from_file_name(None), "Document");
        assert_eq!(title_from_file_name(Some("___.pdf")), "Document");
        assert_eq!(title_from_file_name(Some(&format!("{}.pdf", "t".repeat(400)))).chars().count(), 200);
    }

    #[test]
    fn pdf_magic_is_found_in_the_first_kib_only() {
        assert!(looks_like_pdf(b"%PDF-1.7\n..."));
        assert!(looks_like_pdf(b"\xEF\xBB\xBFjunk%PDF-1.4"));
        assert!(!looks_like_pdf(b"GIF89a"));
        assert!(!looks_like_pdf(b""));
        let mut late = vec![b'x'; 2000];
        late.extend_from_slice(b"%PDF-");
        assert!(!looks_like_pdf(&late));
    }

    #[test]
    fn header_values_are_percent_decoded() {
        assert_eq!(decode_header("My%20Book%20%C3%A9.pdf"), "My Book \u{e9}.pdf");
        assert_eq!(decode_header("plain.pdf"), "plain.pdf");
    }

    fn ev(word: &str, page: i64, at: &str, ctx: Option<&str>) -> WordEvent {
        WordEvent {
            word: word.into(),
            word_key: word.to_lowercase(),
            context: ctx.map(String::from),
            page,
            created_at: at.into(),
        }
    }

    #[test]
    fn words_group_by_key_and_keep_the_newest_context() {
        // Newest first, like the query returns them.
        let events = vec![
            ev("Cat", 3, "2026-01-03", Some("newest")),
            ev("dog", 1, "2026-01-02", None),
            ev("cat", 3, "2026-01-02", Some("older")),
            ev("cat", 1, "2026-01-01", Some("oldest")),
        ];
        let g = group_words(&events);
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].key, "cat");
        assert_eq!(g[0].word, "Cat");
        assert_eq!(g[0].count, 3);
        assert_eq!(g[0].pages, vec![3, 1]);
        assert_eq!(g[0].context.as_deref(), Some("newest"));
        assert_eq!(g[0].last_seen, "2026-01-03");
        assert_eq!(g[1].count, 1);
    }

    #[test]
    fn equal_counts_sort_by_most_recent() {
        let events = vec![ev("b", 1, "2026-02-01", None), ev("a", 1, "2026-01-01", None)];
        let g = group_words(&events);
        assert_eq!(g[0].key, "b");
    }

    #[test]
    fn ocr_words_shape_is_validated() {
        let good = json!({"v":1,"lines":[[0.1,0.1,0.5,0.2]],"words":[["Hello",0.1,0.1,0.3,0.2,0],["world",0.3,0.1,0.5,0.2,0]]});
        assert!(validate_ocr_words(&good).is_ok());
        let empty = json!({"v":1,"lines":[],"words":[]});
        assert!(validate_ocr_words(&empty).is_ok());

        for bad in [
            json!({"v":2,"lines":[],"words":[]}),
            json!({"lines":[],"words":[]}),
            json!([1, 2]),
            json!({"v":1,"lines":[[0,0,1]],"words":[]}),
            json!({"v":1,"lines":[[0,0,1,1]],"words":[["a",0,0,1,1]]}),
            json!({"v":1,"lines":[[0,0,1,1]],"words":[["a",0,0,1,1,5]]}),
            json!({"v":1,"lines":[[0,0,1,1]],"words":[["a",0,0,9,1,0]]}),
            json!({"v":1,"lines":[[0,0,1,1]],"words":[["",0,0,1,1,0]]}),
            json!({"v":1,"lines":[[0,0,1,1]],"words":[[1,0,0,1,1,0]]}),
        ] {
            assert_eq!(validate_ocr_words(&bad), Err("INVALID_OCR_WORDS".to_string()), "{bad}");
        }
    }
}
