import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SpeakOutcome } from '@/lib/speech';

const voice = vi.hoisted(() => ({ said: [] as string[], progress: null as unknown, speaks: true }));
vi.mock('@/lib/speech', () => ({
  speakThrough: (text: string) => {
    voice.said.push(text);
    return new Promise<SpeakOutcome>(() => {});
  },
  stop: () => {},
  prefetchSpeech: () => {},
  adjustSpeech: () => {},
  getSpeechProgress: () => voice.progress,
  plannedVoice: () => 'local',
  localVoiceSpeaks: () => voice.speaks,
  speak: async () => {},
  getSpeechState: () => ({ speaking: false, loading: false, text: null, lang: null }),
  useSpeechState: () => ({ speaking: false, loading: false, text: null, lang: null }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null), convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/components/WordDialog', () => ({ WordDialog: () => null }));
vi.mock('@/components/auth/SignInDialog', () => ({ SignInDialog: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) => (o ? `${key}${JSON.stringify(o)}` : key),
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { ListenMiniPlayer } from '@/pages/reader/listen/ListenMiniPlayer';
import { useListenStore } from '@/pages/reader/listen/listenStore';
import { pageSentences } from '@/pages/reader/text/listen-sequence';

const TEXT = Array.from({ length: 42 }, (_, i) => `Sentence number ${i + 1} is here.`).join(' ');

beforeEach(() => {
  voice.said.length = 0;
  voice.progress = null;
  voice.speaks = true;
  useListenStore.setState({
    source: {
      bookId: 'b1',
      title: 'The Lesson Plans',
      subtitle: 'The Tuesday Class · Season 2 · Episode 3',
      language: 'en',
      coverPath: null,
      requiresLogin: false,
      seriesOrder: 3,
      nextEpisode: null,
    },
    page: 1,
    pageCount: 11,
    hasNext: true,
    sentences: pageSentences(TEXT),
    index: 6,
    status: 'paused',
    rate: 1,
    repeat: false,
    invite: null,
    problem: null,
    readerOpen: null,
  });
});
afterEach(() => useListenStore.getState().close());

const bar = () =>
  render(
    <MemoryRouter>
      <ListenMiniPlayer />
    </MemoryRouter>,
  );

describe('the player bar reading a book', () => {
  it('shows the book, where it is and the sentence being read', () => {
    bar();
    expect(screen.getByText('The Lesson Plans')).toBeInTheDocument();
    expect(
      screen.getByText('listen.position{"n":"7","total":"42","page":"1","pages":"11"}'),
    ).toBeInTheDocument();
    // The sentence above the bar, its words each a button for the word dialog.
    expect(screen.getByRole('button', { name: '7' })).toBeInTheDocument();
    expect(screen.getByTitle('listen.shortcuts')).toBeInTheDocument();
  });

  it('previous / next step a sentence; speed and repeat are switches', () => {
    bar();
    fireEvent.click(screen.getByRole('button', { name: 'listen.nextTitle' }));
    expect(useListenStore.getState().index).toBe(7);
    expect(voice.said.at(-1)).toBe('Sentence number 8 is here.');
    fireEvent.click(screen.getByRole('button', { name: 'listen.prevTitle' }));
    expect(useListenStore.getState().index).toBe(6);

    fireEvent.click(screen.getByRole('button', { name: /listen\.speed/ }));
    expect(useListenStore.getState().rate).toBe(1.25);
    const repeat = screen.getByRole('button', { name: 'listen.repeat' });
    fireEvent.click(repeat);
    expect(useListenStore.getState().repeat).toBe(true);
    expect(repeat).toHaveAttribute('aria-pressed', 'true');
  });

  it('keys: Space plays, → and ← step, R repeats — not while typing', () => {
    bar();
    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
    });
    expect(useListenStore.getState().status).toBe('playing');
    expect(voice.said.at(-1)).toBe('Sentence number 7 is here.');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(useListenStore.getState().index).toBe(7);
    act(() => {
      fireEvent.keyDown(window, { key: 'r' });
    });
    expect(useListenStore.getState().repeat).toBe(true);

    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      fireEvent.keyDown(input, { key: 'ArrowRight' });
    });
    expect(useListenStore.getState().index).toBe(7);
    input.remove();
  });

  it('close takes the book out of the bar', () => {
    bar();
    fireEvent.click(screen.getByRole('button', { name: 'np.closePlayer' }));
    expect(useListenStore.getState().source).toBeNull();
  });

  const pageSentence = () => {
    // The page's sentence 7, as TappableText draws it while the bar reads that page.
    const page = document.createElement('p');
    page.innerHTML =
      '<span data-sentence="0:6" data-listen-active=""><span data-flexi-word="Sentence">Sentence</span> ' +
      '<span data-flexi-word="number">number</span> <span data-flexi-word="7">7</span> ' +
      '<span data-flexi-word="is">is</span> <span data-flexi-word="here">here</span>.</span>';
    document.body.appendChild(page);
    return page;
  };
  const WORD = 'bg-primary-light/30';
  const SENTENCE = 'bg-primary/[0.11]';
  const SENTENCE_FAINT = 'bg-primary/[0.05]';

  it('marks the word being said — on the page and in the bar’s line — and moves with the voice', async () => {
    const page = pageSentence();
    useListenStore.setState({ status: 'playing' });
    voice.progress = {
      engine: 'device',
      text: 'Sentence number 7 is here.',
      charIndex: 'Sentence number '.length,
    };
    bar();
    const onPage = () => Array.from(page.querySelectorAll('[data-flexi-word]'));
    await vi.waitFor(() => expect(onPage()[2].classList.contains(WORD)).toBe(true));
    expect(screen.getByRole('button', { name: '7' }).classList.contains(WORD)).toBe(true);
    expect(onPage().filter((el) => el.classList.contains(WORD))).toHaveLength(1);
    // A word is marked, so the sentence keeps only a faint wash, not a second highlight.
    const sentence = page.querySelector('[data-listen-active]')!;
    expect(sentence.classList.contains(SENTENCE)).toBe(false);
    expect(sentence.classList.contains(SENTENCE_FAINT)).toBe(true);

    voice.progress = { engine: 'device', text: 'Sentence number 7 is here.', charIndex: 21 };
    await vi.waitFor(() => expect(onPage()[4].classList.contains(WORD)).toBe(true));
    expect(onPage()[2].classList.contains(WORD)).toBe(false);

    // Paused: the word stays marked — the place to come back to.
    act(() => useListenStore.setState({ status: 'paused' }));
    voice.progress = null;
    await new Promise((r) => setTimeout(r, 200));
    expect(onPage()[4].classList.contains(WORD)).toBe(true);

    // Closing the bar leaves no mark behind.
    act(() => useListenStore.getState().close());
    expect(onPage().some((el) => el.classList.contains(WORD))).toBe(false);
    expect(sentence.classList.contains(SENTENCE_FAINT)).toBe(false);
    page.remove();
  });

  it('the system voice cannot tell its words: the sentence is marked instead', async () => {
    const page = pageSentence();
    useListenStore.setState({ status: 'playing' });
    voice.progress = { engine: 'system', text: 'Sentence number 7 is here.' };
    bar();
    const sentence = page.querySelector('[data-listen-active]')!;
    await vi.waitFor(() => expect(sentence.classList.contains(SENTENCE)).toBe(true));
    expect(sentence.classList.contains(SENTENCE_FAINT)).toBe(false);
    expect(page.querySelectorAll(`.${CSS.escape(WORD)}`)).toHaveLength(0);
    page.remove();
  });

  it('leaves out its sentence line while the book’s own page is open, and shows it elsewhere', () => {
    useListenStore.setState({ readerOpen: 'b1' });
    const view = bar();
    expect(screen.queryByRole('button', { name: '7' })).toBeNull();
    expect(screen.getByText('The Lesson Plans')).toBeInTheDocument();
    act(() => useListenStore.setState({ readerOpen: null }));
    view.rerender(
      <MemoryRouter>
        <ListenMiniPlayer />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: '7' })).toBeInTheDocument();
  });
});

describe('the computer has no voice for the book’s language', () => {
  it('says so, with how to hear it properly, until its × is pressed', () => {
    voice.speaks = false;
    bar();
    const note = screen.getByText(/book\.noLanguageVoiceSignedOut/);
    expect(note.textContent).toContain('"language":"English"');
    expect(screen.getByText('listen.signInCta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'book.closeNote' }));
    expect(screen.queryByText(/book\.noLanguageVoice/)).toBeNull();
  });

  it('says nothing when the computer’s voice speaks the language', () => {
    bar();
    expect(screen.queryByText(/book\.noLanguageVoice/)).toBeNull();
  });
});

describe('the seek bar', () => {
  it('is a slider: a click sends the reader to that sentence', () => {
    bar();
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () =>
      ({ left: 0, width: 420, top: 0, height: 14, right: 420, bottom: 14, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    act(() => {
      fireEvent.pointerDown(slider, { clientX: 210, pointerId: 1 });
    });
    act(() => {
      fireEvent.pointerUp(slider, { clientX: 210, pointerId: 1 });
    });
    expect(useListenStore.getState().index).toBe(21);
    // Paused (as the bar starts here): it only moves there — nothing is read until play.
    expect(useListenStore.getState().status).toBe('paused');
    expect(voice.said).toEqual([]);
  });
});
