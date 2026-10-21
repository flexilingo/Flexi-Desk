/**
 * Feature flags for controlling which modules are enabled.
 *
 * Start with the most stable modules enabled, then flip flags
 * as each module is tested and ready for users.
 */

export const ENABLED_MODULES = {
  // Tier 1 — Core loop (stable, ship first)
  dashboard: true,
  study: true,
  review: true,
  podcast: true,
  settings: true,

  // Tier 2 — High-value features (enable when tested)
  caption: true,
  vocabulary: false,

  // Tier 3 — AI-powered (enable next)
  pronunciation: false,
  tutor: true,
  celpip: true,
  // The legacy local-SQLite exam module (`src/pages/exam/`) is superseded by
  // CELPIP but left in the tree, unrouted, until you say to remove it.
  exam: false,
  podcastQuiz: false,

  // Tier 4 — Early stage (enable later)
  reading: false,
  writing: false,
  plugins: false,
} as const;

export type ModuleKey = keyof typeof ENABLED_MODULES;

export function isModuleEnabled(key: ModuleKey): boolean {
  return ENABLED_MODULES[key];
}
