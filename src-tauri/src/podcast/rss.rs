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
fn parse_duration(s: &str) -> i64 {
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
