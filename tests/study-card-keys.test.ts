import { describe, expect, it } from 'vitest';
import { resolveCardKey } from '../src/pages/study/lib/cardKeys';

const ctx = (over = {}) => ({ focusMode: false, isAnswer: false, submittingRating: null, ...over });
const press = (key: string, extra = {}) => ({ key, ...extra });

describe('the flashcard keyboard (focus mode and out of it)', () => {
  it('e / w / t / r work everywhere the card is open — not only in focus mode', () => {
    for (const focusMode of [false, true]) {
      expect(resolveCardKey(press('e'), ctx({ focusMode }))).toEqual({ type: 'nextExample' });
      expect(resolveCardKey(press('w'), ctx({ focusMode }))).toEqual({ type: 'prevExample' });
      expect(resolveCardKey(press('t'), ctx({ focusMode }))).toEqual({ type: 'exampleMeaning' });
      expect(resolveCardKey(press('r'), ctx({ focusMode }))).toEqual({ type: 'replay' });
    }
    expect(resolveCardKey(press('E'), ctx())).toEqual({ type: 'nextExample' });
  });

  it('m and l bind in focus mode only — a bare letter never reshapes the session for someone scrolling past', () => {
    expect(resolveCardKey(press('m'), ctx())).toBeNull();
    expect(resolveCardKey(press('l'), ctx())).toBeNull();
    expect(resolveCardKey(press('m'), ctx({ focusMode: true }))).toEqual({ type: 'toggleMeaning' });
    expect(resolveCardKey(press('l'), ctx({ focusMode: true }))).toEqual({ type: 'toggleLayout' });
  });

  it('Space and Enter flip; 1-5 grade only once the answer is showing, and only one at a time', () => {
    expect(resolveCardKey(press(' '), ctx())).toEqual({ type: 'flip' });
    expect(resolveCardKey(press('Enter'), ctx())).toEqual({ type: 'flip' });
    expect(resolveCardKey(press('3'), ctx())).toBeNull();
    expect(resolveCardKey(press('3'), ctx({ isAnswer: true }))).toEqual({ type: 'grade', rating: 3 });
    expect(resolveCardKey(press('5'), ctx({ isAnswer: true, submittingRating: 4 }))).toBeNull();
    expect(resolveCardKey(press('6'), ctx({ isAnswer: true }))).toBeNull();
    expect(resolveCardKey(press('0'), ctx({ isAnswer: true }))).toBeNull();
  });

  it('Space / Enter on a focused button leave it to the button (no double flip)', () => {
    expect(resolveCardKey(press(' ', { target: { tagName: 'BUTTON' } }), ctx())).toBeNull();
    expect(resolveCardKey(press('Enter', { target: { tagName: 'button' } }), ctx())).toBeNull();
    expect(resolveCardKey(press(' ', { target: { tagName: 'DIV' } }), ctx())).toEqual({ type: 'flip' });
    // the letter and grade keys still work from a focused button
    expect(resolveCardKey(press('e', { target: { tagName: 'BUTTON' } }), ctx())).toEqual({ type: 'nextExample' });
  });

  it('never hijacks typing, shortcuts with a modifier, or auto-repeat', () => {
    expect(resolveCardKey(press('e', { target: { tagName: 'INPUT' } }), ctx())).toBeNull();
    expect(resolveCardKey(press('e', { target: { tagName: 'textarea' } }), ctx())).toBeNull();
    expect(resolveCardKey(press('e', { target: { isContentEditable: true } }), ctx())).toBeNull();
    expect(resolveCardKey(press('e', { metaKey: true }), ctx())).toBeNull();
    expect(resolveCardKey(press('r', { ctrlKey: true }), ctx())).toBeNull();
    expect(resolveCardKey(press('e', { repeat: true }), ctx())).toBeNull();
    expect(resolveCardKey(press('e', { target: { tagName: 'BUTTON' } }), ctx())).toEqual({ type: 'nextExample' });
  });
});
