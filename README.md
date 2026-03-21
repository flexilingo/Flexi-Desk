<div align="center">
  <a name="readme-top"></a>

  <img height="100" src="https://www.flexilingo.com/logo.svg" alt="FlexiLingo Desk" />

  <h1>FlexiLingo Desk</h1>

  Offline-first desktop learning companion — podcasts, SRS review, AI tutor, live caption, and more.

  [![Release][release-badge]][releases-url] [![Website][website-badge]][website-url]

  [Download][releases-url] · [Website][website-url] · [Report Bug][issues-url]

</div>

---

<p align="center">
  <a href="docs/screenshot.png"><img src="docs/screenshot.png" width="32%" alt="FlexiDesk — Podcast Player" /></a>
  <a href="docs/screenshot2.png"><img src="docs/screenshot2.png" width="32%" alt="FlexiDesk — Dashboard" /></a>
  <a href="docs/screenshot3.png"><img src="docs/screenshot3.png" width="32%" alt="FlexiDesk — Settings" /></a>
</p>

---

## ✨ Features

Built with **Tauri 2 + Rust** on the backend and **React 19** on the frontend. All data lives in a local **SQLite** database and syncs to the cloud when online.

| Module | Status | Description |
| :--- | :---: | :--- |
| 🎧 Podcast Player | ✅ Available | PodcastIndex + RSS, Whisper transcription, CEFR subtitles, word lookup |
| 🧠 SRS Review | ✅ Available | Spaced repetition with Leitner, SM-2, and FSRS algorithms |
| 📊 Dashboard | ✅ Available | XP, streaks, daily stats, learning overview |
| ⚙️ Settings | ✅ Available | Theme, language, AI provider, Whisper model management |
| 🎙 Caption | 🔄 In Development | Live audio capture + real-time Whisper transcription |
| 🤖 Tutor | 🔄 In Development | AI conversation partner with scenarios |
| 📖 Reading | 🔄 In Development | Import PDF, EPUB, URLs with highlights and vocabulary |
| 🗣 Pronunciation | 🔄 In Development | Speech analysis and feedback |
| 📝 Writing | 🔄 In Development | Writing exercises with AI feedback |
| 📚 Vocabulary | 🔄 In Development | Personal word list across all modules |
| 📋 Exam | 🔄 In Development | Quiz and exam creation |

## 🖥 Platform Support

| [<img src="https://cdn.simpleicons.org/apple/555555" alt="macOS" width="22px" height="22px" />][releases-url]<br>macOS | [<img src="https://cdn.simpleicons.org/windows/0078D4" alt="Windows" width="22px" height="22px" />][releases-url]<br>Windows | [<img src="https://cdn.simpleicons.org/linux/FCC624" alt="Linux" width="22px" height="22px" />][releases-url]<br>Linux |
| :---: | :---: | :---: |
| macOS 12+ | Windows 10+ | Ubuntu 20.04+ |

## 📥 Download

Download the latest release for your OS from the [Releases page][releases-url].

## 🏗 Architecture

FlexiLingo Desk is **offline-first** — built with **Tauri 2 (Rust)** and **React 19**. All data lives in a local SQLite database and syncs to the cloud when online.

## 🌍 Language Support

| Language | Code | Transcription | CEFR + NLP |
| :--- | :---: | :---: | :---: |
| 🇬🇧 English | `en` | ✅ | ✅ |
| 🇪🇸 Spanish | `es` | ✅ | ✅ |
| 🇫🇷 French | `fr` | ✅ | ✅ |
| 🇩🇪 German | `de` | ✅ | ✅ |
| 🇨🇳 Chinese | `zh` | ✅ | ✅ |
| 🇸🇦 Arabic | `ar` | ✅ | ✅ |
| 🇮🇷 Persian | `fa` | ✅ | ✅ |
| 🇹🇷 Turkish | `tr` | ✅ | ✅ |
| 🇮🇳 Hindi | `hi` | ✅ | ✅ |
| 🇷🇺 Russian | `ru` | ✅ | ✅ |

## 🤖 AI Models

| Layer | Model | Purpose |
| :--- | :--- | :--- |
| Transcription | Whisper `turbo` | ~98% accuracy, ~12 min/hr of audio |
| Transcription fallback | Whisper `small` | Degraded mode |
| NLP | spaCy | POS tagging, collocations, dependency parsing |
| LLM | GPT-4o-mini | Tutor conversations, AI feedback |

## 🌐 FlexiLingo Ecosystem

FlexiLingo Desk is part of a larger platform available on **Web**, **Mobile**, **Browser Extension**, and **Desktop**. Learn more at [flexilingo.com][website-url].

## 🧪 Development

### Prerequisites

- [Rust](https://rustup.rs/) 1.77+
- [Node.js](https://nodejs.org/) 20+
- [Tauri CLI](https://tauri.app/start/prerequisites/) v2

### Build & Run

```bash
# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

### Tests

The Rust backend has **214 unit tests** covering all pure-logic modules (SRS algorithms, sync queue, analytics, NLP, export/import, tutor, plugins, and more).

```bash
# Run all backend unit tests
cd src-tauri && cargo test --lib

# Run tests for a specific module
cargo test --lib srs::leitner
cargo test --lib srs::sm2
cargo test --lib sync::queue
cargo test --lib dashboard::analytics
```

All tests run offline with no external dependencies (in-memory SQLite, temp files).

## 🔗 Links

- [Download Releases][releases-url]
- [FlexiLingo Website][website-url]
- [Report a Bug][issues-url]

---

[release-badge]: https://img.shields.io/github/v/release/flexilingo/Flexi-Desk?style=flat-square&label=release&color=6B705C
[releases-url]: https://github.com/flexilingo/Flexi-Desk/releases
[website-badge]: https://img.shields.io/badge/website-flexilingo.com-6B705C?style=flat-square
[website-url]: https://www.flexilingo.com
[issues-url]: https://github.com/flexilingo/Flexi-Desk/issues
