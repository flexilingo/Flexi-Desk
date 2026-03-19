# Contributing to FlexiDesk

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- Node.js 22+, pnpm 9+, Rust stable
- See the [README](README.md) for platform-specific dependencies

### Setup

```bash
git clone https://github.com/AminForou/flexi-lingo-desk.git
cd flexi-lingo-desk
pnpm install
pnpm tauri dev
```

## Project Structure

FlexiDesk follows a **modular architecture** where each feature is self-contained across both Rust and React.

### Module Anatomy

Every feature module (podcast, review, reading, etc.) follows this pattern:

```
# Rust backend
src-tauri/src/{module}/
├── mod.rs          # Module exports
├── types.rs        # Structs with #[derive(Serialize)]
└── ...             # Business logic files

src-tauri/src/commands/{module}.rs  # Tauri IPC commands

# React frontend
src/pages/{module}/
├── index.tsx              # Main page component (exported)
├── types.ts               # TypeScript types + Raw* types + mapper functions
├── stores/{module}Store.ts  # Zustand + Immer store
└── components/            # Module-specific components
```

### Adding a New Module

1. **Rust**: Create `src-tauri/src/{module}/mod.rs` and `types.rs`
2. **Commands**: Create `src-tauri/src/commands/{module}.rs` with `#[tauri::command]` functions
3. **Register**: Add `pub mod {module};` to `commands/mod.rs` and `mod {module};` to `lib.rs`
4. **Register commands**: Add to the `invoke_handler![]` in `lib.rs`
5. **Frontend**: Create `src/pages/{module}/` with page component, store, and types
6. **Route**: Add route in `App.tsx` and nav item in `Sidebar.tsx`
7. **Migration**: If you need new tables, add a migration constant in `db/schema.rs`

### Database Migrations

Migrations are versioned constants in `src-tauri/src/db/schema.rs`:

```rust
const V022_MY_FEATURE: &str = "
CREATE TABLE IF NOT EXISTS my_table (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    ...
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
";
```

Add it to the `MIGRATIONS` array. Migrations run automatically on app startup. **Never modify existing migrations** — always create new ones.

### Type Mapping Pattern

Rust returns snake_case JSON. The frontend uses camelCase. Each module has mapper functions:

```typescript
// types.ts
export interface RawThing { my_field: string; }  // From Rust
export interface Thing { myField: string; }       // Used in React

export function mapThing(raw: RawThing): Thing {
  return { myField: raw.my_field };
}
```

### State Management

All stores use **Zustand + Immer**:

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';

export const useMyStore = create<MyState>()(
  immer((set) => ({
    items: [],
    isLoading: false,
    error: null,

    fetchItems: async () => {
      set((s) => { s.isLoading = true; });
      try {
        const raw = await invoke<RawItem[]>('my_list_items');
        set((s) => {
          s.items = raw.map(mapItem);
          s.isLoading = false;
        });
      } catch (err) {
        set((s) => { s.error = String(err); s.isLoading = false; });
      }
    },
  })),
);
```

## Code Style

### Rust

- Use `Result<T, String>` for Tauri commands (Tauri requires string errors)
- Prefix all commands with the module name: `podcast_list_feeds`, `srs_add_card`
- Use `rusqlite::params![]` for SQL parameters
- IDs are `lower(hex(randomblob(16)))` — 32-char hex strings

### TypeScript / React

- **Tailwind CSS v4** with standard classes (no prefix). Theme colors: `bg-primary`, `text-accent`, `bg-card`, `border-border`, etc.
- **Never use inline styles** — always Tailwind classes
- **Never use purple/indigo** — project uses Sage (#8BB7A3), Terracotta (#C58C6E), Olive (#6B705C) palette
- Components use `lucide-react` icons
- Radix UI for all interactive primitives (Dialog, Select, Switch, etc.)
- `cn()` utility from `src/lib/utils.ts` for conditional classes

### Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Rust structs | PascalCase | `DailyStats` |
| Rust fields | snake_case | `study_minutes` |
| Tauri commands | snake_case | `dashboard_get_summary` |
| TS interfaces | PascalCase | `DailyStats` |
| TS fields | camelCase | `studyMinutes` |
| Raw IPC types | `Raw` prefix | `RawDailyStats` |
| Store hooks | `use{Module}Store` | `useDashboardStore` |
| Components | PascalCase files | `GoalProgressBar.tsx` |

## Pull Request Guidelines

1. **One feature per PR** — keep changes focused
2. **Run checks before submitting:**
   ```bash
   cargo check                    # Rust compiles
   pnpm lint                      # No lint errors
   pnpm format:check              # Formatting OK
   pnpm test                      # Tests pass
   ```
3. **Write a clear PR description** — what changed and why
4. **Add a migration** if you changed the DB schema (never modify existing ones)
5. **Test on your platform** — we can't test all 3 OS in every PR

## What to Work On

Check the [Issues](../../issues) tab for tasks labeled:
- `good first issue` — small, well-defined tasks
- `help wanted` — features that need contributors
- `bug` — confirmed bugs

Or pick from the [Roadmap](docs/ROADMAP.md) for larger features.

## Questions?

Open a [Discussion](../../discussions) or file an issue. We're happy to help!
