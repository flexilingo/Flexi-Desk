import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', exists: () => true } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { PdfNoteDialog } from '@/pages/reader/pdf/PdfNoteDialog';

const note = { quote: 'a phrase', body: '', pageNumber: 4 };

describe('PdfNoteDialog', () => {
  it('stays open with the text and shows the error when the save fails, then closes on success', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(<PdfNoteDialog note={note} onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('pdf.notes.placeholder'), { target: { value: 'remember this' } });
    fireEvent.click(screen.getByRole('button', { name: 'pdf.notes.save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('notes.saveFailed');
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText('pdf.notes.placeholder') as HTMLTextAreaElement).value).toBe('remember this');

    fireEvent.click(screen.getByRole('button', { name: 'pdf.notes.save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith('remember this');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the quote, and offers delete only for a stored note', () => {
    const { rerender } = render(<PdfNoteDialog note={note} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('a phrase')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'pdf.notes.delete' })).toBeNull();
    rerender(<PdfNoteDialog note={{ ...note, id: 'n1' }} onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'pdf.notes.delete' })).toBeInTheDocument();
  });
});
