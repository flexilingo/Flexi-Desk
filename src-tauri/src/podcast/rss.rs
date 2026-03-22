use super::types::{ParsedEpisode, ParsedFeed};

/// Parse RSS/Atom XML into a structured feed.
/// Uses a lightweight regex-based approach to avoid heavy XML crate dependencies.
pub fn parse_rss(xml: &str) -> Result<ParsedFeed, String> {
    let title = extract_tag(xml, "title").unwrap_or_else(|| "Untitled".into());
    let description = extract_tag(xml, "description").or_else(|| extract_tag(xml, "subtitle"));
    let author = extract_tag(xml, "itunes:author")
        .or_else(|| extract_tag(xml, "managingEditor"))
        .or_else(|| extract_tag(xml, "author"));
    let website_url = extract_tag(xml, "link");
    let artwork_url = extract_attr(xml, "itunes:image", "href")
        .or_else(|| extract_nested_tag(xml, "image", "url"));
    let language = extract_tag(xml, "language");
    let category = extract_attr(xml, "itunes:category", "text");

    // Parse episodes from <item> or <entry> blocks
    let episodes = parse_items(xml);

    Ok(ParsedFeed {
        title,
        author,
        description,
        website_url,
        artwork_url,
        language,
        category,
        episodes,
    })
}

/// Parse iTunes Search API JSON response.
pub fn parse_itunes_results(json: &str) -> Result<Vec<super::types::ITunesSearchResult>, String> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("JSON parse error: {e}"))?;

    let results = value["results"]
        .as_array()
        .ok_or("No results array in iTunes response")?;

    let mut podcasts = Vec::new();
    for item in results {
        let feed_url = item["feedUrl"].as_str().unwrap_or_default();
        if feed_url.is_empty() {
            continue;
        }

        podcasts.push(super::types::ITunesSearchResult {
            title: item["collectionName"]
                .as_str()
                .unwrap_or("Untitled")
                .to_string(),
            author: item["artistName"]
                .as_str()
                .unwrap_or("Unknown")
                .to_string(),
            feed_url: feed_url.to_string(),
            artwork_url: item["artworkUrl600"]
                .as_str()
                .or_else(|| item["artworkUrl100"].as_str())
                .unwrap_or_default()
                .to_string(),
            genre: item["primaryGenreName"]
                .as_str()
                .unwrap_or("Podcast")
                .to_string(),
        });
    }

    Ok(podcasts)
}

// ── XML Helpers ─────────────────────────────────────────

fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);

    let start_idx = xml.find(&open)?;
    let after_open = &xml[start_idx..];
    let content_start = after_open.find('>')? + 1;
    let content_xml = &after_open[content_start..];
    let end_idx = content_xml.find(&close)?;
    let content = &content_xml[..end_idx];

    let cleaned = content
        .trim()
        .trim_start_matches("<![CDATA[")
        .trim_end_matches("]]>");

    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.to_string())
    }
}

fn extract_attr(xml: &str, tag: &str, attr: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let start_idx = xml.find(&open)?;
    let after_open = &xml[start_idx..];
    let tag_end = after_open.find('>')?;
    let tag_content = &after_open[..tag_end];

    let attr_pattern = format!("{}=\"", attr);
    let attr_start = tag_content.find(&attr_pattern)?;
    let value_start = attr_start + attr_pattern.len();
    let value_end = tag_content[value_start..].find('"')?;
    let value = &tag_content[value_start..value_start + value_end];

    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn extract_nested_tag(xml: &str, parent: &str, child: &str) -> Option<String> {
    let open = format!("<{}", parent);
    let close = format!("</{}>", parent);

    let start_idx = xml.find(&open)?;
    let after_open = &xml[start_idx..];
    let end_idx = after_open.find(&close)?;
    let parent_content = &after_open[..end_idx];

    extract_tag(parent_content, child)
}

fn parse_items(xml: &str) -> Vec<ParsedEpisode> {
    let mut episodes = Vec::new();

    // Split on <item> or <entry>
    let item_tag = if xml.contains("<item") { "item" } else { "entry" };
    let parts: Vec<&str> = xml.split(&format!("<{}", item_tag)).collect();

    for (i, part) in parts.iter().enumerate() {
        if i == 0 {
            continue; // Skip the part before the first <item>
        }

        // Find the closing tag
        let close = format!("</{}>", item_tag);
        let item_xml = if let Some(end) = part.find(&close) {
            &part[..end]
        } else {
            part
        };

        let title = extract_tag(item_xml, "title")
            .unwrap_or_else(|| format!("Episode {}", i));

        // Audio URL from <enclosure url="...">
        let audio_url = extract_attr(item_xml, "enclosure", "url")
            .or_else(|| extract_tag(item_xml, "link"))
            .unwrap_or_default();

        if audio_url.is_empty() {
            continue;
        }

        let description = extract_tag(item_xml, "description")
            .or_else(|| extract_tag(item_xml, "summary"));
        let guid = extract_tag(item_xml, "guid");
        let published_at = extract_tag(item_xml, "pubDate")
            .or_else(|| extract_tag(item_xml, "published"));

        // Duration from <itunes:duration>
        let duration_str = extract_tag(item_xml, "itunes:duration");
        let duration_seconds = duration_str
            .map(|d| parse_duration(&d))
            .unwrap_or(0);

        // File size from <enclosure length="...">
        let file_size = extract_attr(item_xml, "enclosure", "length")
            .and_then(|s| s.parse::<i64>().ok());

        episodes.push(ParsedEpisode {
            guid,
            title,
            description,
            audio_url,
            duration_seconds,
            published_at,
            file_size,
        });
    }

    episodes
}

/// Parse duration from "HH:MM:SS", "MM:SS", or raw seconds.
pub(crate) fn parse_duration(s: &str) -> i64 {
    let s = s.trim();
    if let Ok(secs) = s.parse::<i64>() {
        return secs;
    }

    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        3 => {
            let h: i64 = parts[0].parse().unwrap_or(0);
            let m: i64 = parts[1].parse().unwrap_or(0);
            let s: i64 = parts[2].parse().unwrap_or(0);
            h * 3600 + m * 60 + s
        }
        2 => {
            let m: i64 = parts[0].parse().unwrap_or(0);
            let s: i64 = parts[1].parse().unwrap_or(0);
            m * 60 + s
        }
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_duration ───────────────────────────────────

    #[test]
    fn test_duration_hhmmss() {
        assert_eq!(parse_duration("01:30:00"), 5400);
    }

    #[test]
    fn test_duration_mmss() {
        assert_eq!(parse_duration("45:30"), 2730);
    }

    #[test]
    fn test_duration_raw_seconds() {
        assert_eq!(parse_duration("3600"), 3600);
    }

    #[test]
    fn test_duration_zero() {
        assert_eq!(parse_duration("0"), 0);
    }

    #[test]
    fn test_duration_invalid_returns_zero() {
        assert_eq!(parse_duration("not-a-duration"), 0);
    }

    // ── parse_rss feed metadata ──────────────────────────

    #[test]
    fn test_parse_rss_title_and_author() {
        let xml = r#"<?xml version="1.0"?>
        <rss><channel>
            <title>My Podcast</title>
            <itunes:author>Jane Doe</itunes:author>
            <language>en</language>
        </channel></rss>"#;
        let feed = parse_rss(xml).unwrap();
        assert_eq!(feed.title, "My Podcast");
        assert_eq!(feed.author.as_deref(), Some("Jane Doe"));
        assert_eq!(feed.language.as_deref(), Some("en"));
    }

    #[test]
    fn test_parse_rss_description_cdata() {
        let xml = r#"<rss><channel>
            <title>Test</title>
            <description><![CDATA[A great podcast about <b>learning</b>]]></description>
        </channel></rss>"#;
        let feed = parse_rss(xml).unwrap();
        assert_eq!(
            feed.description.as_deref(),
            Some("A great podcast about <b>learning</b>")
        );
    }

    #[test]
    fn test_parse_rss_artwork_from_itunes_image() {
        let xml = r#"<rss><channel>
            <title>Test</title>
            <itunes:image href="https://example.com/art.jpg"/>
        </channel></rss>"#;
        let feed = parse_rss(xml).unwrap();
        assert_eq!(
            feed.artwork_url.as_deref(),
            Some("https://example.com/art.jpg")
        );
    }

    #[test]
    fn test_parse_rss_category_from_itunes() {
        let xml = r#"<rss><channel>
            <title>Test</title>
            <itunes:category text="Education"/>
        </channel></rss>"#;
        let feed = parse_rss(xml).unwrap();
        assert_eq!(feed.category.as_deref(), Some("Education"));
    }

    #[test]
    fn test_parse_rss_fallback_title_when_missing() {
        let xml = "<rss><channel></channel></rss>";
        let feed = parse_rss(xml).unwrap();
        assert_eq!(feed.title, "Untitled");
    }

    // ── parse_rss episodes ───────────────────────────────

    #[test]
    fn test_parse_rss_episode_basic() {
        let xml = r#"<rss><channel>
            <title>My Podcast</title>
            <item>
                <title>Episode 1</title>
                <enclosure url="https://example.com/ep1.mp3" length="1234567" type="audio/mpeg"/>
                <itunes:duration>00:45:30</itunes:duration>
                <pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate>
            </item>
        </channel></rss>"#;
        let feed = parse_rss(xml).unwrap();
        assert_eq!(feed.episodes.len(), 1);
        let ep = &feed.episodes[0];
        assert_eq!(ep.title, "Episode 1");
        assert_eq!(ep.audio_url, "https://example.com/ep1.mp3");
        assert_eq!(ep.duration_seconds, 2730);
        assert_eq!(ep.file_size, Some(1234567));
        assert!(ep.published_at.is_some());
    }

    #[test]
    fn test_parse_rss_skips_episode_without_audio_url() {
        let xml = r#"<rss><channel>
            <title>Test</title>
            <item>
                <title>No Audio Episode</title>
            </item>
            <item>
                <title>Has Audio</title>
                <enclosure url="https://example.com/ep.mp3"/>
            </item>
        </channel></rss>"#;
        let feed = parse_rss(xml).unwrap();
        assert_eq!(feed.episodes.len(), 1);
        assert_eq!(feed.episodes[0].title, "Has Audio");
    }

    #[test]
    fn test_parse_rss_multiple_episodes() {
        let xml = r#"<rss><channel>
            <title>Test</title>
            <item>
                <title>Ep 1</title>
                <enclosure url="https://ex.com/1.mp3"/>
            </item>
            <item>
                <title>Ep 2</title>
                <enclosure url="https://ex.com/2.mp3"/>
            </item>
        </channel></rss>"#;
        let feed = parse_rss(xml).unwrap();
        assert_eq!(feed.episodes.len(), 2);
        assert_eq!(feed.episodes[0].title, "Ep 1");
        assert_eq!(feed.episodes[1].title, "Ep 2");
    }

    #[test]
    fn test_parse_rss_episode_guid() {
        let xml = r#"<rss><channel>
            <title>Test</title>
            <item>
                <title>Ep</title>
                <guid>urn:uuid:abc-123</guid>
                <enclosure url="https://ex.com/ep.mp3"/>
            </item>
        </channel></rss>"#;
        let feed = parse_rss(xml).unwrap();
        assert_eq!(feed.episodes[0].guid.as_deref(), Some("urn:uuid:abc-123"));
    }

    #[test]
    fn test_parse_rss_atom_entry_format() {
        let xml = r#"<feed>
            <title>Atom Feed</title>
            <entry>
                <title>Entry 1</title>
                <link>https://ex.com/ep.mp3</link>
            </entry>
        </feed>"#;
        let feed = parse_rss(xml).unwrap();
        assert_eq!(feed.episodes.len(), 1);
        assert_eq!(feed.episodes[0].title, "Entry 1");
    }

    // ── parse_itunes_results ─────────────────────────────

    #[test]
    fn test_parse_itunes_results_basic() {
        let json = r#"{
            "results": [
                {
                    "collectionName": "Tech Talk",
                    "artistName": "John Smith",
                    "feedUrl": "https://example.com/feed.xml",
                    "artworkUrl600": "https://example.com/art.jpg",
                    "primaryGenreName": "Technology"
                }
            ]
        }"#;
        let results = parse_itunes_results(json).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Tech Talk");
        assert_eq!(results[0].author, "John Smith");
        assert_eq!(results[0].feed_url, "https://example.com/feed.xml");
        assert_eq!(results[0].genre, "Technology");
    }

    #[test]
    fn test_parse_itunes_results_skips_empty_feed_url() {
        let json = r#"{
            "results": [
                { "collectionName": "No Feed", "feedUrl": "" },
                { "collectionName": "Has Feed", "feedUrl": "https://ex.com/feed.xml",
                  "artistName": "A", "artworkUrl600": "", "primaryGenreName": "Podcast" }
            ]
        }"#;
        let results = parse_itunes_results(json).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Has Feed");
    }

    #[test]
    fn test_parse_itunes_results_invalid_json() {
        let result = parse_itunes_results("not json");
        assert!(result.is_err());
    }
}
