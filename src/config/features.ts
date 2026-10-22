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
  // The website's My vocabulary: this computer's words merged with the account's history.
  vocabulary: true,

  // Tier 3 — AI-powered (enable next)
  tutor: true,
  celpip: true,

  // Tier 4 — Early stage (enable later)
  // The website's Reader, ported: PDFs and photos stay on this computer.
  reader: true,
  // The website's Writing practice (no menu entry, like the website): prompts and grading on the user's own AI.
  writingPractice: true,

  // The website's menu (see components/layout/sidebarConfig.ts). ON = the page
  // is ported and complete; OFF = defined in the sidebar, hidden until its port
  // lands. Flip one to true in the same change that adds its route.
  // The Reader's book library (/reader/library), complete.
  library: true,
  // The website's Videos (catalogue, channels, watch page with the shared player), complete.
  videos: true,
  // Public decks (/explore): browse, preview, save into the library — complete.
  browse: true,
  // TCF Canada / Québec / IRN: the CELPIP exam engine run on an exam profile — complete.
  tcf: true,
  // The website's Sentence practice and its record, on the signed-in `sentences-app` function; calm until the server update is live.
  sentences: true,
  // The website's French cheatsheet: topics, verbs, conjugator, offline copy, reader panel.
  cheatsheet: true,
  // The website's Notes: podcast notes, reader notes and the account's notes in one list.
  notes: true,
  // The website's account pages: Learning, Profile, XP log, Stats, Payments, Community, Friends.
  account: true,
  // The Pro page: plans, usage, checkout in the browser, gift codes.
  subscription: true,
  // The website's feature catalogue, in the app.
  whatsNew: true,
} as const;

export type ModuleKey = keyof typeof ENABLED_MODULES;

export function isModuleEnabled(key: ModuleKey): boolean {
  return ENABLED_MODULES[key];
}
