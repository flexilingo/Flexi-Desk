<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="FlexiDesk icon" />
</p>

<h1 align="center">FlexiDesk</h1>

<p align="center">
  <strong>Open-source, offline-first desktop language learning workstation</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#development">Development</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#contributing">Contributing</a> &bull;
  <a href="#license">License</a>
</p>

---

FlexiDesk is a comprehensive desktop application for language learners. It combines **10 learning modules** — from podcast listening to AI-powered tutoring — into a single offline-capable app. Built with [Tauri 2](https://v2.tauri.app/) (Rust) and React 19, it's fast, lightweight (~15 MB), and works on macOS, Windows, and Linux.

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | XP tracking, streak calendar, CEFR radar chart, study heatmap, vocabulary growth timeline, goals with freeze days |
| **Podcast** | Subscribe to RSS feeds, download episodes, transcribe with local Whisper, translate words, interactive learning |
| **SRS Review** | Spaced repetition flashcards with Leitner, SM-2, and FSRS algorithms. Multi-deck management, merge, bulk operations |
| **Reading** | Import text from files, URLs, or paste. Highlight words, track progress, vocabulary extraction |
| **AI Tutor** | Chat with a local AI tutor — supports Ollama (offline), OpenAI, and Anthropic. Scenario-based conversations, grammar correction, vocabulary suggestions |
| **Live Caption** | Real-time speech-to-text from any audio source using local Whisper models. System audio capture via CPAL |
| **Pronunciation** | Record yourself, transcribe with Whisper, compare against target text. Track improvement over sessions |
| **Writing** | Timed writing sessions with community prompts. AI-powered correction and feedback |
| **Exam** | Practice TOEFL/IELTS-style exams with timed sections, question scoring, and history tracking |
| **Vocabulary** | Central vocabulary manager. Filter by CEFR, language, source. Bulk operations, CSV/Anki export |

### Additional Capabilities

- **100% Offline AI** — All AI features (tutor, word analysis, sentence chat, writing coach) run locally via Ollama. No cloud required.
- **One-Click Ollama Install** — Install and manage Ollama directly from the app. No terminal needed.
- **Keyboard Shortcuts** — 23 customizable shortcuts across all modules
- **Export/Import** — CSV and Anki (.apkg) format support
- **Gamification** — XP system, streak freezes, daily goals, milestone celebrations
- **i18n** — UI in 6 languages: English, Persian, Arabic, French, Hindi, Chinese
- **RTL Support** — Full right-to-left layout for Arabic and Persian
- **Dark/Light/System** theme with the FlexiLingo color palette

## Installation

### Pre-built Binaries

Download the latest release for your platform from the [Releases](../../releases) page:

| Platform | Format |
|----------|--------|
| macOS | `.dmg` (Universal — Intel + Apple Silicon) |
| Windows | `.msi` installer |
| Linux | `.AppImage`, `.deb` |

### Build from Source

**Prerequisites:**
- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+
- [Rust](https://rustup.rs/) (stable)
- Platform-specific dependencies (see below)

```bash
# Clone the repo
git clone https://github.com/flexilingo/Flexi-Desk.git
cd Flexi-Desk

# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

#### Linux Dependencies

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libasound2-dev
```

## Development

```bash
pnpm tauri dev      # Start dev server + Tauri window
pnpm lint           # ESLint
pnpm format:check   # Prettier check
pnpm test           # Vitest
```

The app uses hot-reload for the React frontend. Rust changes require a restart.

### Environment Setup

FlexiDesk works fully offline out of the box. For optional cloud features (sync, AI cloud providers, OAuth login), copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

## Architecture

```
flexi-lingo-desk/
├── src/                          # React 19 frontend
│   ├── components/layout/        # Shell, Sidebar, Header
│   ├── components/ui/            # Radix UI primitives (Card, Button, Dialog, etc.)
│   ├── hooks/                    # useTheme, useShortcuts, useDirection
│   ├── stores/                   # Zustand + Immer (appStore, authStore, syncStore, shortcutStore)
│   ├── pages/
│   │   ├── dashboard/            # Analytics, goals, achievements, streak
│   │   ├── podcast/              # Feed management, player, transcription
│   │   ├── review/               # SRS decks, flashcard sessions
│   │   ├── reading/              # Document import, highlights
│   │   ├── tutor/                # AI conversations, scenarios
│   │   ├── caption/              # Live audio capture, Whisper
│   │   ├── pronunciation/        # Recording, analysis
│   │   ├── writing/              # Sessions, prompts, corrections
│   │   ├── exam/                 # Templates, timed sessions
│   │   ├── vocabulary/           # Word management, bulk ops
│   │   ├── plugins/              # Plugin manager
│   │   └── settings/             # Account, AI, languages, shortcuts, sync, export
│   └── lib/                      # Utilities, supabase wrapper
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── auth/                 # Google + Apple OAuth via localhost callback
│   │   ├── caption/              # CPAL audio capture, Whisper sidecar
│   │   ├── commands/             # Tauri IPC command handlers (18 modules)
│   │   ├── dashboard/            # Analytics, streaks, XP, achievements
│   │   ├── db/                   # SQLite schema + versioned migrations (V001-V022)
│   │   ├── export/               # CSV + Anki .apkg export/import
│   │   ├── plugins/              # Plugin manifest parsing, registration
│   │   ├── podcast/              # RSS parsing, download, transcription
│   │   ├── shortcuts/            # Keyboard shortcut system
│   │   ├── srs/                  # Leitner, SM-2, FSRS algorithms
│   │   ├── sync/                 # Offline queue, conflict resolution
│   │   └── ...                   # reading, tutor, writing, exam, pronunciation, ollama
│   └── Cargo.toml
└── .github/workflows/            # CI (lint + build) + Release (auto-publish)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri 2](https://v2.tauri.app/) |
| Frontend | React 19, TypeScript, Vite 7 |
| State | Zustand 5 + Immer |
| UI Components | Radix UI + CVA |
| Styling | Tailwind CSS v4 (`@theme` directive) |
| Charts | Recharts |
| Routing | React Router v7 |
| i18n | react-i18next |
| Backend | Rust (stable) |
| Database | SQLite via rusqlite (bundled) |
| Audio | CPAL (system audio capture) |
| Speech-to-Text | Whisper (local, via sidecar binary) |
| Local AI | [Ollama](https://ollama.com) — auto-installed, supports llama3.2, mistral, gemma, qwen, etc. |
| Auth | Google + Apple OAuth (optional, system browser flow) |
| Cloud | Supabase (optional, for sync) |

### Data Flow

```
React Component → Zustand Store → invoke<T>() → Tauri Command → Rust → SQLite
                                                                    ↓
                                                              supabaseCall() → Edge Functions (optional)
```

All data is stored locally in SQLite. The `Raw*` types (snake_case from Rust) are mapped to camelCase TypeScript types via mapper functions in each module's `types.ts`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture details, how to add a new module, code style, and PR guidelines.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) — see the LICENSE file for details.

**Why AGPL?** We want FlexiDesk to remain free and open. The AGPL ensures that modifications and derivative works are also shared with the community, even when deployed as a service.

---

<p align="center">
  Built with Tauri, Rust, and React<br/>
  Part of the <a href="https://flexilingo.com">FlexiLingo</a> ecosystem
</p>
