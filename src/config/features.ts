/**
 * Feature flags for controlling which modules are enabled.
 *
 * Start with the most stable modules enabled, then flip flags
 * as each module is tested and ready for users.
 */

export const ENABLED_MODULES = {
  // Tier 1 — Core loop (stable, ship first)
  dashboard: true,
  review: true,
  podcast: true,
  settings: true,

  // Tier 2 — High-value features (enable when tested)
  caption: false,
  vocabulary: false,

  // Tier 3 — AI-powered (enable next)
  pronunciation: false,
  tutor: false,
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
