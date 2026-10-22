import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', exists: () => true } }),
}));
vi.mock('@/pages/reader/components/AddDocumentDialog', () => ({
  AddDocumentDialog: () => <div data-testid="add-dialog" />,
}));

import { ReaderShell } from '@/pages/reader/components/ReaderShell';
import { ReaderPager } from '@/pages/reader/text/ReaderPager';

const shell = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ReaderShell>
        <p>body</p>
      </ReaderShell>
    </MemoryRouter>,
  );

describe('reader shell header', () => {
  it('reading home: Reader title with the Add button and dialog', () => {
    shell('/reader');
    expect(screen.getByRole('heading', { name: 'title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /home\.add/ })).toBeInTheDocument();
    expect(screen.getByTestId('add-dialog')).toBeInTheDocument();
  });

  it('library: Library title and subtitle, no Add button, no dialog', () => {
    shell('/reader/library');
    expect(screen.getByRole('heading', { name: 'nav.library' })).toBeInTheDocument();
    expect(screen.getByText('catalog.subtitle')).toBeInTheDocument();
    expect(screen.queryByText('home.add')).toBeNull();
    expect(screen.queryByTestId('add-dialog')).toBeNull();
  });
});

describe('pager with an unknown total', () => {
  const pager = (page: number, total: number) =>
    render(
      <ReaderPager page={page} total={total} hasPrev hasNext onPrev={() => {}} onNext={() => {}} />,
    );

  it('shows only the page when the total is smaller than the page (unknown)', () => {
    pager(2, 1);
    expect(screen.queryByText(/read\.pageOf/)).toBeNull();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows "n of total" when known', () => {
    pager(2, 5);
    expect(screen.getByText(/read\.pageOf/)).toBeInTheDocument();
  });
});
