import registryJson from './data/registry.json';

export interface FeatureEntry {
  slug: string;
  category: string;
  icon: string;
  platforms: string[];
  href: string | null;
  addedAt: string;
  featured: boolean;
  goal: string | null;
}

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[]; variant?: string }
  | { type: 'steps'; items: { title: string; text: string }[] }
  | { type: 'note'; title?: string; text: string }
  | { type: 'where'; text: string; href?: string };

export interface FeatureCopy {
  title: string;
  tagline: string;
  subtitle: string;
  blocks: Block[];
  specs: { label: string; value: string }[];
  faq: { q: string; a: string }[];
}

export interface Labels {
  categories: Record<string, string>;
  platforms: Record<string, string>;
  features: Record<string, string>;
  detail: Record<string, string>;
}

export const REGISTRY = registryJson as FeatureEntry[];

const SITE = 'https://flexilingo.com';
const SITE_LOCALES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh', 'de', 'vi'];

/** Newest first. */
export const byDate = (list: FeatureEntry[] = REGISTRY) =>
  [...list].sort((a, b) => b.addedAt.localeCompare(a.addedAt));

/** "New" for a month after it first appeared. */
export const isNew = (addedAt: string, now = Date.now()) =>
  now - new Date(addedAt).getTime() < 30 * 86400000;

export function filterByCategory(list: FeatureEntry[], category: string): FeatureEntry[] {
  return category === 'all' ? list : list.filter((f) => f.category === category);
}

/** Where a feature opens on the website (internal paths get the language prefix). */
export function webUrl(href: string | null, language: string): string | null {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  const base = (language ?? 'en').split('-')[0];
  return `${SITE}/${SITE_LOCALES.includes(base) ? base : 'en'}${href}`;
}

const dataFiles = import.meta.glob('./data/{en,fa,ar,fr,hi,zh}.json');
const labelFile = () => import('./data/labels.json');

export async function loadCopy(language: string): Promise<Record<string, FeatureCopy>> {
  const base = (language ?? 'en').split('-')[0];
  const load = dataFiles[`./data/${base}.json`] ?? dataFiles['./data/en.json'];
  return ((await load()) as { default: Record<string, FeatureCopy> }).default;
}

export async function loadLabels(language: string): Promise<Labels> {
  const base = (language ?? 'en').split('-')[0];
  const all = (await labelFile()).default as unknown as Record<string, Labels>;
  return all[base] ?? all.en;
}
