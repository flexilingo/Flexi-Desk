import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@/i18n/config';
import { VideoFilterBar } from '@/pages/videos/components/VideoFilterBar';
import { levelPillOptions } from '@/pages/videos/components/FilterControls';
import { pageWindow } from '@/pages/videos/components/Pager';
import type { CatalogState } from '@/pages/videos/lib/videoFilters';
import type { VideoFiltersResponse } from '@/pages/videos/lib/videosApi';

afterEach(cleanup);

const base: CatalogState = { q: '', view: 'newest', page: 1 };
const filters = {
  total: 40,
  levels: [
    { level: 'A1', count: 5 },
    { level: 'B1', count: 30 },
  ],
  tags: [{ tag: 'travel', count: 4 }],
  languages: [
    { code: 'en', count: 30, catalogue_count: 30 },
    { code: 'fr', count: 10, catalogue_count: 10 },
  ],
  categories: [],
} as unknown as VideoFiltersResponse;

describe('video filter bar', () => {
  it('shows no chips and no Clear all while nothing is chosen', () => {
    render(<VideoFilterBar state={base} onChange={vi.fn()} filters={filters} />);
    expect(screen.queryByText(/clear all/i)).toBeNull();
    expect(screen.queryByLabelText(/remove filter/i)).toBeNull();
  });

  it('lists each active filter as a removable chip, with the honest count', () => {
    const onChange = vi.fn();
    render(
      <VideoFilterBar
        state={{ ...base, cefr: 'B1', topic: 'travel', page: 3 }}
        onChange={onChange}
        filters={filters}
        resultCount={7}
      />,
    );
    expect(screen.getByText(/7/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/remove filter.*travel/i));
    expect(onChange).toHaveBeenCalledWith({ topic: undefined, page: 1 });
    fireEvent.click(screen.getByLabelText(/remove filter.*B1/i));
    expect(onChange).toHaveBeenCalledWith({ cefr: undefined, page: 1 });
  });

  it('level pills drop empty levels, keep the chosen one, and a click sets the level', () => {
    const onChange = vi.fn();
    render(<VideoFilterBar state={base} onChange={onChange} filters={filters} />);
    expect(screen.queryByRole('button', { name: 'A2' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /B1/ }));
    expect(onChange).toHaveBeenCalledWith({ cefr: 'B1', page: 1 });
  });

  it('Clear all resets every filter and the page', () => {
    const onChange = vi.fn();
    render(
      <VideoFilterBar state={{ ...base, q: 'cats', cefr: 'A1' }} onChange={onChange} filters={filters} />,
    );
    fireEvent.click(screen.getByText(/clear all/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: '', cefr: undefined, page: 1 }));
  });

  it('a search hides the view switcher (results replace the views)', () => {
    const { rerender } = render(<VideoFilterBar state={base} onChange={vi.fn()} filters={filters} />);
    expect(screen.getByLabelText(/view/i, { selector: 'button' })).toBeTruthy();
    rerender(<VideoFilterBar state={{ ...base, q: 'cats' }} onChange={vi.fn()} filters={filters} />);
    expect(screen.queryByLabelText(/view/i, { selector: 'button' })).toBeNull();
  });
});

describe('level pill options and the pager window', () => {
  const t = (k: string) => k;
  it('keeps the selected level even with no videos, drops the other empty ones', () => {
    const ids = levelPillOptions(t, { counts: { B1: 3 }, selected: 'C2' }).map((o) => o.id);
    expect(ids).toEqual(['', 'B1', 'C2']);
  });
  it('shows every level when there are no counts yet', () => {
    expect(levelPillOptions(t).map((o) => o.id)).toHaveLength(7);
  });
  it('page window matches the website pager', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 9)).toEqual([1, 2, 3, 4, '…', 9]);
    expect(pageWindow(5, 9)).toEqual([1, '…', 4, 5, 6, '…', 9]);
    expect(pageWindow(9, 9)).toEqual([1, '…', 6, 7, 8, 9]);
  });
});
