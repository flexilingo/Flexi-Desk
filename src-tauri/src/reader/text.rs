//! Text documents: a pasted text or a web page, turned into pages the text reader can show.
//!
//! Pure logic only (no database, no network), so it is tested with plain strings and a
//! fixture page. Three jobs:
//!
//! * `split_pages` — cut a text into pages near the website's page size, on paragraph
//!   boundaries, falling back to sentences and then to words for a paragraph that is
//!   longer than a page.
//! * `extract_article` — the readable part of an HTML page: no scripts, styles, menus or
//!   footers, paragraphs kept.
//! * `title_from_text` / `count_words` — the small helpers the import needs.

use regex::Regex;

/// A page is cut when adding the next paragraph would pass this many characters.
pub const PAGE_TARGET_CHARS: usize = 1800;
/// No page is allowed past this (a single paragraph that long is cut at sentences).
pub const PAGE_MAX_CHARS: usize = 2600;
/// A last page shorter than this is folded into the one before it.
const MIN_LAST_PAGE_CHARS: usize = 300;
/// Pasting more than this is almost certainly a mistake (a book is ~1M characters).
pub const MAX_TEXT_CHARS: usize = 3_000_000;

/// CRLF to LF, no NULs, tabs and non-breaking spaces as plain spaces, trailing space off lines.
pub fn normalise_text(raw: &str) -> String {
    let unified = raw.replace("\r\n", "\n").replace('\r', "\n");
    unified
        .chars()
        .filter(|c| *c != '\0' && *c != '\u{feff}')
        .map(|c| if c == '\t' || c == '\u{a0}' { ' ' } else { c })
        .collect::<String>()
        .split('\n')
        .map(|l| l.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Paragraphs of a text. Blank lines separate them; lines inside one block are a hard-wrapped
/// paragraph and are joined with a space. A text with no blank line at all (one line per
/// paragraph, as many editors copy) is read one line per paragraph instead.
pub fn paragraphs(text: &str) -> Vec<String> {
    let text = normalise_text(text);
    let text = text.trim();
    let has_blank = text.split('\n').any(|l| l.trim().is_empty());
    let mut out = Vec::new();
    if has_blank {
        let mut block: Vec<&str> = Vec::new();
        let mut flush = |block: &mut Vec<&str>, out: &mut Vec<String>| {
            if !block.is_empty() {
                out.push(collapse(&block.join(" ")));
                block.clear();
            }
        };
        for line in text.split('\n') {
            if line.trim().is_empty() {
                flush(&mut block, &mut out);
            } else {
                block.push(line.trim());
            }
        }
        flush(&mut block, &mut out);
    } else {
        out.extend(text.split('\n').map(collapse).filter(|l| !l.is_empty()));
    }
    out.into_iter().filter(|p| !p.is_empty()).collect()
}

fn collapse(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_sentence_end(c: char) -> bool {
    matches!(c, '.' | '!' | '?' | '\u{2026}' | '\u{3002}' | '\u{ff01}' | '\u{ff1f}' | '\u{61f}' | '\u{964}')
}

fn is_closing(c: char) -> bool {
    matches!(c, '"' | '\'' | ')' | ']' | '\u{bb}' | '\u{201d}' | '\u{2019}')
}

/// A paragraph cut into sentences. A terminator ends a sentence when whitespace follows it
/// (or when it is a CJK terminator, which is not followed by a space).
fn sentences(p: &str) -> Vec<String> {
    let chars: Vec<char> = p.chars().collect();
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        cur.push(c);
        if is_sentence_end(c) {
            let cjk = matches!(c, '\u{3002}' | '\u{ff01}' | '\u{ff1f}');
            // Swallow closing quotes and repeated terminators ("?!", `."`).
            while i + 1 < chars.len() && (is_sentence_end(chars[i + 1]) || is_closing(chars[i + 1])) {
                i += 1;
                cur.push(chars[i]);
            }
            let next_is_space = chars.get(i + 1).map_or(true, |n| n.is_whitespace());
            if cjk || next_is_space {
                out.push(cur.trim().to_string());
                cur.clear();
            }
        }
        i += 1;
    }
    if !cur.trim().is_empty() {
        out.push(cur.trim().to_string());
    }
    out.into_iter().filter(|s| !s.is_empty()).collect()
}

/// Cut a too-long run of text at a space near `limit` characters (or at `limit` when it has none).
fn hard_split(s: &str, limit: usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest: Vec<char> = s.chars().collect();
    while rest.len() > limit {
        let window = &rest[..limit];
        let cut = window.iter().rposition(|c| c.is_whitespace()).filter(|i| *i > limit / 2).unwrap_or(limit);
        let head: String = rest[..cut].iter().collect();
        out.push(head.trim().to_string());
        rest = rest[cut..].iter().skip_while(|c| c.is_whitespace()).copied().collect();
    }
    if !rest.is_empty() {
        out.push(rest.iter().collect());
    }
    out.into_iter().filter(|s| !s.is_empty()).collect()
}

/// A unit of the page: a paragraph, or a piece of one that was too long for a page
/// (`continues` is true for every piece after the first, so it is joined with a space).
struct Unit {
    text: String,
    continues: bool,
}

fn units_of(paragraphs: Vec<String>) -> Vec<Unit> {
    let mut units = Vec::new();
    for p in paragraphs {
        if p.chars().count() <= PAGE_MAX_CHARS {
            units.push(Unit { text: p, continues: false });
            continue;
        }
        // Too long for one page: sentences, packed up to the target.
        let mut pieces: Vec<String> = Vec::new();
        for s in sentences(&p) {
            if s.chars().count() > PAGE_MAX_CHARS {
                pieces.extend(hard_split(&s, PAGE_TARGET_CHARS));
            } else {
                pieces.push(s);
            }
        }
        let mut cur = String::new();
        let mut first = true;
        for piece in pieces {
            let joined = cur.chars().count() + 1 + piece.chars().count();
            if !cur.is_empty() && joined > PAGE_TARGET_CHARS {
                units.push(Unit { text: std::mem::take(&mut cur), continues: !first });
                first = false;
            }
            if !cur.is_empty() {
                cur.push(' ');
            }
            cur.push_str(&piece);
        }
        if !cur.is_empty() {
            units.push(Unit { text: cur, continues: !first });
        }
    }
    units
}

/// Pages of a text, each near `PAGE_TARGET_CHARS`, cut only between paragraphs where it can
/// be. Empty text gives no pages.
pub fn split_pages(text: &str) -> Vec<String> {
    // Each page remembers whether it opens in the middle of a paragraph.
    let mut pages: Vec<(String, bool)> = Vec::new();
    let mut cur = String::new();
    let mut cur_continues = false;
    for unit in units_of(paragraphs(text)) {
        let sep = if unit.continues { " " } else { "\n\n" };
        let would_be = cur.chars().count() + sep.len() + unit.text.chars().count();
        if !cur.is_empty() && would_be > PAGE_TARGET_CHARS {
            pages.push((std::mem::take(&mut cur), cur_continues));
        }
        if cur.is_empty() {
            cur_continues = unit.continues;
        } else {
            cur.push_str(sep);
        }
        cur.push_str(&unit.text);
    }
    if !cur.is_empty() {
        pages.push((cur, cur_continues));
    }
    // No stub of a page at the end.
    if pages.len() > 1 {
        let last_len = pages[pages.len() - 1].0.chars().count();
        let prev_len = pages[pages.len() - 2].0.chars().count();
        if last_len < MIN_LAST_PAGE_CHARS && prev_len + 2 + last_len <= PAGE_MAX_CHARS {
            let (last, continues) = pages.pop().unwrap_or_default();
            if let Some((prev, _)) = pages.last_mut() {
                prev.push_str(if continues { " " } else { "\n\n" });
                prev.push_str(&last);
            }
        }
    }
    pages.into_iter().map(|(p, _)| p).collect()
}

/// Words in a text. Chinese and Japanese are written without spaces, so there a character is
/// the unit.
pub fn count_words(text: &str, language: &str) -> i64 {
    if matches!(language, "zh" | "ja") {
        text.chars().filter(|c| !c.is_whitespace()).count() as i64
    } else {
        text.split_whitespace().count() as i64
    }
}

/// A title for a pasted text: its first line, cut at a word, no more than 60 characters.
pub fn title_from_text(text: &str) -> String {
    let first = paragraphs(text).into_iter().next().unwrap_or_default();
    let first = first.trim();
    if first.chars().count() <= 60 {
        return first.to_string();
    }
    let head: String = first.chars().take(60).collect();
    let cut = head.rfind(' ').filter(|i| *i > 20).map(|i| &head[..i]).unwrap_or(&head);
    format!("{}\u{2026}", cut.trim_end_matches(|c: char| !c.is_alphanumeric()))
}

// ── Web pages ────────────────────────────────────────────────────────────────

/// What a web page held that is worth reading.
#[derive(Debug, Clone, PartialEq)]
pub struct Article {
    pub title: Option<String>,
    /// The page's declared language (`<html lang>`), as a two-letter code.
    pub language: Option<String>,
    /// Paragraphs separated by a blank line.
    pub text: String,
}

fn re(pattern: &str) -> Regex {
    // Patterns here are literals; a failure is a programming error caught by the tests.
    Regex::new(pattern).expect("valid pattern")
}

/// Named entities seen in running text. Anything else named is left as it is.
fn named_entity(name: &str) -> Option<&'static str> {
    Some(match name {
        "amp" => "&", "lt" => "<", "gt" => ">", "quot" => "\"", "apos" => "'", "nbsp" => " ",
        "ndash" => "\u{2013}", "mdash" => "\u{2014}", "hellip" => "\u{2026}", "lsquo" => "\u{2018}",
        "rsquo" => "\u{2019}", "ldquo" => "\u{201c}", "rdquo" => "\u{201d}", "laquo" => "\u{ab}",
        "raquo" => "\u{bb}", "copy" => "\u{a9}", "reg" => "\u{ae}", "euro" => "\u{20ac}",
        "agrave" => "\u{e0}", "aacute" => "\u{e1}", "acirc" => "\u{e2}", "auml" => "\u{e4}",
        "ccedil" => "\u{e7}", "egrave" => "\u{e8}", "eacute" => "\u{e9}", "ecirc" => "\u{ea}",
        "euml" => "\u{eb}", "icirc" => "\u{ee}", "iuml" => "\u{ef}", "ocirc" => "\u{f4}",
        "ouml" => "\u{f6}", "ugrave" => "\u{f9}", "ucirc" => "\u{fb}", "uuml" => "\u{fc}",
        "ntilde" => "\u{f1}", "szlig" => "\u{df}", "oelig" => "\u{153}",
        _ => return None,
    })
}

pub fn decode_entities(s: &str) -> String {
    let pattern = re(r"&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]{1,8});");
    pattern
        .replace_all(s, |caps: &regex::Captures| {
            let body = &caps[1];
            if let Some(num) = body.strip_prefix('#') {
                let code = match num.strip_prefix(['x', 'X']) {
                    Some(hex) => u32::from_str_radix(hex, 16).ok(),
                    None => num.parse::<u32>().ok(),
                };
                return code
                    .and_then(char::from_u32)
                    .map(|c| if c == '\u{a0}' { ' '.to_string() } else { c.to_string() })
                    .unwrap_or_else(|| caps[0].to_string());
            }
            named_entity(body).map(String::from).unwrap_or_else(|| caps[0].to_string())
        })
        .into_owned()
}

/// Blocks whose content is never prose.
const NOISE_TAGS: [&str; 14] = [
    "script", "style", "noscript", "template", "svg", "iframe", "form", "nav", "header", "footer", "aside",
    "button", "select", "dialog",
];

fn remove_noise(html: &str) -> String {
    let mut out = re(r"(?s)<!--.*?-->").replace_all(html, " ").into_owned();
    for tag in NOISE_TAGS {
        out = re(&format!(r"(?is)<{tag}\b[^>]*>.*?</{tag}\s*>")).replace_all(&out, " ").into_owned();
    }
    out
}

fn block_text(fragment: &str) -> String {
    let with_breaks = re(r"(?i)<br\s*/?>").replace_all(fragment, "\n");
    let with_breaks = re(r"(?i)</?(p|div|section|article|main|li|ul|ol|h[1-6]|tr|table|blockquote|pre|dd|dt|figure|figcaption|hr)\b[^>]*>")
        .replace_all(&with_breaks, "\n\n");
    let stripped = re(r"<[^>]*>").replace_all(&with_breaks, "");
    decode_entities(&stripped)
}

fn capture(html: &str, pattern: &str) -> Option<String> {
    re(pattern)
        .captures(html)
        .and_then(|c| c.get(1))
        .map(|m| collapse(&decode_entities(&re(r"<[^>]*>").replace_all(m.as_str(), ""))))
        .filter(|s| !s.is_empty())
}

fn page_title(html: &str) -> Option<String> {
    capture(html, r#"(?is)<meta\s[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']*)["']"#)
        .or_else(|| capture(html, r#"(?is)<meta\s[^>]*content\s*=\s*["']([^"']*)["'][^>]*property\s*=\s*["']og:title["']"#))
        .or_else(|| capture(html, r"(?is)<title[^>]*>(.*?)</title>"))
        .or_else(|| capture(html, r"(?is)<h1[^>]*>(.*?)</h1>"))
}

fn page_language(html: &str) -> Option<String> {
    let code = capture(html, r#"(?is)<html\b[^>]*\blang\s*=\s*["']?([A-Za-z]{2,3})"#)?.to_lowercase();
    (code.len() == 2 || code.len() == 3).then_some(code)
}

/// A page's prose. The `<article>` is preferred, then `<main>`, then the whole `<body>`; the
/// first of those that holds a real amount of text wins. Menus, headers, footers, forms,
/// scripts and styles are removed first.
pub fn extract_article(html: &str) -> Article {
    let title = page_title(html);
    let language = page_language(html);
    let cleaned = remove_noise(html);

    let scopes = [
        r"(?is)<article\b[^>]*>(.*)</article\s*>",
        r"(?is)<main\b[^>]*>(.*)</main\s*>",
    ];
    let mut text = String::new();
    let mut scoped = false;
    for scope in scopes {
        if let Some(inner) = re(scope).captures(&cleaned).and_then(|c| c.get(1)) {
            let candidate = paragraphs(&block_text(inner.as_str())).join("\n\n");
            if candidate.chars().count() >= 200 {
                text = candidate;
                scoped = true;
                break;
            }
        }
    }
    if !scoped {
        let body = re(r"(?is)<body\b[^>]*>(.*)</body\s*>")
            .captures(&cleaned)
            .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
            .unwrap_or(cleaned);
        let mut blocks = paragraphs(&block_text(&body));
        // Without an article to trust, one- and two-word lines are menu items ("Home",
        // "Sign in", "Share") — but only when there is real prose around them.
        let prose = blocks.iter().filter(|b| b.split_whitespace().count() >= 8).count();
        if prose >= 2 {
            blocks.retain(|b| b.split_whitespace().count() > 2);
        }
        text = blocks.join("\n\n");
    }

    Article { title, language, text }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn long_paragraph(sentence: &str, n: usize) -> String {
        std::iter::repeat(sentence).take(n).collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn paragraphs_follow_blank_lines_and_join_wrapped_lines() {
        let p = paragraphs("First line\nstill the first paragraph.\n\nSecond paragraph.\r\n\r\n\r\nThird.");
        assert_eq!(p, vec!["First line still the first paragraph.", "Second paragraph.", "Third."]);
    }

    #[test]
    fn a_text_without_blank_lines_is_one_paragraph_per_line() {
        assert_eq!(paragraphs("Toronto is large.\nVancouver is on the coast.\n"), vec!["Toronto is large.", "Vancouver is on the coast."]);
        assert!(paragraphs("  \n \n").is_empty());
    }

    #[test]
    fn short_text_is_one_page_and_empty_text_is_none() {
        assert_eq!(split_pages("Hello Toronto."), vec!["Hello Toronto."]);
        assert!(split_pages("   ").is_empty());
    }

    #[test]
    fn pages_break_between_paragraphs_near_the_target_and_lose_nothing() {
        let para = long_paragraph("The streetcar crosses the city every morning.", 10); // ~450 chars
        let text = (0..12).map(|_| para.clone()).collect::<Vec<_>>().join("\n\n");
        let pages = split_pages(&text);
        assert!(pages.len() >= 3, "{} pages", pages.len());
        for page in &pages {
            let n = page.chars().count();
            assert!(n <= PAGE_MAX_CHARS, "page of {n}");
            // Only whole paragraphs: every page is a multiple of the paragraph.
            assert!(page.split("\n\n").all(|p| p == para));
        }
        let rejoined = pages.join("\n\n");
        assert_eq!(rejoined, text, "no word is lost or reordered");
    }

    #[test]
    fn one_huge_paragraph_is_cut_at_sentences() {
        let text = long_paragraph("The harbour is quiet in the early morning.", 200); // ~8400 chars
        let pages = split_pages(&text);
        assert!(pages.len() >= 4);
        for page in &pages {
            assert!(page.chars().count() <= PAGE_MAX_CHARS);
            assert!(page.ends_with('.'), "cut on a sentence end: {:?}", &page[page.len().saturating_sub(10)..]);
            assert!(!page.contains("\n\n"), "pieces of one paragraph are not separated by a blank line");
        }
        assert_eq!(pages.join(" "), text);
    }

    #[test]
    fn a_sentence_longer_than_a_page_is_cut_at_a_space_and_text_without_spaces_at_the_limit() {
        let words = long_paragraph("word", 1500).replace('.', ""); // one 7.5k-char "sentence"
        let pages = split_pages(&words);
        assert!(pages.len() > 2);
        assert!(pages.iter().all(|p| p.chars().count() <= PAGE_MAX_CHARS));
        assert_eq!(pages.join(" "), words);

        let cjk: String = std::iter::repeat('\u{5b57}').take(5000).collect();
        let pages = split_pages(&cjk);
        assert!(pages.len() >= 2 && pages.iter().all(|p| p.chars().count() <= PAGE_MAX_CHARS));
        assert_eq!(pages.concat(), cjk);
    }

    #[test]
    fn cjk_sentences_end_without_a_following_space() {
        let s = sentences("\u{4eca}\u{5929}\u{5f88}\u{597d}\u{3002}\u{6211}\u{4eec}\u{53bb}\u{516c}\u{56ed}\u{3002}");
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn a_tiny_last_page_is_folded_into_the_previous_one() {
        let para = long_paragraph("A sentence about the lake.", 28); // ~730 chars
        let text = format!("{para}\n\n{para}\n\n{para}\n\nThe end.");
        let pages = split_pages(&text);
        assert!(pages.last().unwrap().ends_with("The end."));
        assert!(pages.last().unwrap().chars().count() > "The end.".chars().count());
    }

    #[test]
    fn word_counts_and_titles() {
        assert_eq!(count_words("one two  three\nfour", "en"), 4);
        assert_eq!(count_words("\u{4eca}\u{5929} \u{597d}", "zh"), 3);
        assert_eq!(title_from_text("\n\nA walk in High Park\n\nMore text follows."), "A walk in High Park");
        let long = title_from_text(&format!("{} end", "word ".repeat(30)));
        assert!(long.chars().count() <= 61 && long.ends_with('\u{2026}'), "{long}");
    }

    #[test]
    fn entities_decode() {
        assert_eq!(decode_entities("Caf&eacute; &amp; bar &#8212; &#x41; &nbsp;ok &unknown;"), "Caf\u{e9} & bar \u{2014} A  ok &unknown;");
    }

    const PAGE: &str = r#"<!DOCTYPE html>
<html lang="en-CA"><head><meta charset="utf-8">
<title>Ignored &amp; replaced</title>
<meta property="og:title" content="A Day at the Harbour &mdash; Toronto">
<style>.x { color: red } p { margin: 0 }</style>
<script>var tracker = "should not appear"; if (a < b) { x(); }</script>
</head><body>
<header><nav><a href="/">Home</a><a href="/about">About us</a></nav></header>
<main>
<article>
<h1>A Day at the Harbour</h1>
<p>The ferry leaves the terminal at nine, and the water is calm. Gulls follow the boat across the bay while commuters read the news.</p>
<!-- <p>A hidden comment that must not appear.</p> -->
<p>On the island, the bicycle paths are quiet.<br>Families rent bikes and ride toward the lighthouse, stopping for lunch near the beach.</p>
<ul><li>Bring water</li><li>Wear a hat</li></ul>
<aside>Subscribe to our newsletter today!</aside>
<p>By late afternoon the skyline glows. The last ferry home is always the most crowded, but nobody seems to mind the wait.</p>
</article>
<footer><p>Copyright 2026 Harbour Times. All rights reserved.</p></footer>
<form><input type="text" value="search"><button>Go</button></form>
</main></body></html>"#;

    #[test]
    fn article_extraction_keeps_paragraphs_and_drops_everything_around_them() {
        let a = extract_article(PAGE);
        assert_eq!(a.title.as_deref(), Some("A Day at the Harbour \u{2014} Toronto"));
        assert_eq!(a.language.as_deref(), Some("en"));
        let paras: Vec<&str> = a.text.split("\n\n").collect();
        assert_eq!(paras[0], "A Day at the Harbour");
        assert!(paras[1].starts_with("The ferry leaves the terminal at nine"));
        assert!(paras.iter().any(|p| p.starts_with("On the island") && p.contains("bicycle paths are quiet. Families rent bikes")));
        assert!(paras.contains(&"Bring water") && paras.contains(&"Wear a hat"));
        for banned in ["tracker", "color: red", "Home", "About us", "hidden comment", "newsletter", "Copyright", "search", "<"] {
            assert!(!a.text.contains(banned), "{banned} leaked into {:?}", a.text);
        }
        assert!(a.text.contains("last ferry home"));
    }

    #[test]
    fn a_page_without_article_or_main_falls_back_to_the_body_without_menu_words() {
        let html = r#"<html><body>
<div>Home</div><div>Sign in</div>
<div>The city library opens its doors at eight in the morning and stays open late on Thursday evenings for students.</div>
<div>Every second Saturday there is a reading circle for children, with stories, songs and a snack for everyone.</div>
<div>Share</div>
</body></html>"#;
        let a = extract_article(html);
        assert!(a.text.starts_with("The city library"));
        assert!(!a.text.contains("Sign in") && !a.text.contains("Share") && !a.text.starts_with("Home"));
        assert_eq!(a.title, None);
        assert_eq!(a.language, None);
    }

    #[test]
    fn a_thin_article_falls_back_to_the_rest_of_the_page() {
        let html = r#"<html lang="fr"><head><title>Titre</title></head><body>
<article><p>Court.</p></article>
<p>Le marché de la ville ouvre le samedi matin et propose des fruits, des légumes et du pain frais pour toute la famille.</p>
<p>Les habitants y viennent depuis des années pour discuter, acheter leurs produits et profiter du soleil de la place.</p>
</body></html>"#;
        let a = extract_article(html);
        assert!(a.text.starts_with("Le marché de la ville") && !a.text.contains("Court."));
        assert_eq!(a.language.as_deref(), Some("fr"));
        assert_eq!(a.title.as_deref(), Some("Titre"));
    }

    #[test]
    fn a_page_with_no_prose_gives_empty_text() {
        let a = extract_article("<html><body><script>1</script><nav>x</nav></body></html>");
        assert!(a.text.is_empty());
    }
}
