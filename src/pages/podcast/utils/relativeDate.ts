import type { TFunction } from 'i18next';

/**
 * "today", "3d ago", "2w ago" ... in the active UI language (podcastUi `rel.*` keys).
 * `tp` must be bound to the `podcastUi` namespace.
 * Past `maxUnit` the caller decides what to show (null), e.g. an absolute date.
 */
export function relativeDays(
  tp: TFunction,
  days: number,
  maxUnit: 'week' | 'month' | 'year' = 'year',
): string | null {
  if (days <= 0) return tp('rel.today');
  if (days < 7) return tp('rel.daysAgo', { count: days });
  if (days < 30) return tp('rel.weeksAgo', { count: Math.floor(days / 7) });
  if (maxUnit === 'week') return null;
  if (days < 365) return tp('rel.monthsAgo', { count: Math.floor(days / 30) });
  if (maxUnit === 'month') return null;
  return tp('rel.yearsAgo', { count: Math.floor(days / 365) });
}
