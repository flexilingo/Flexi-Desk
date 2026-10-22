import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionHero } from '@/pages/study/components/session/report/SessionHero';

describe('SessionHero', () => {
  it('sits on a cream card, not a dark-green ground, and keeps its content', () => {
    render(<SessionHero headline="12 words moved" facts={['8 min', '90%']} xp={40} xpLabel="XP" />);
    const hero = screen.getByTestId('session-hero');
    expect(hero.className).toContain('bg-card');
    expect(hero.className).not.toContain('bg-primary');
    expect(screen.getByText('12 words moved')).toBeTruthy();
    expect(screen.getByText('8 min · 90%')).toBeTruthy();
    expect(screen.getByText('+40')).toBeTruthy();
    expect(hero.querySelector('.bg-olive-700')).toBeTruthy();
  });
  it('hides the XP block when none was earned', () => {
    render(<SessionHero headline="Done" facts={[]} xp={0} xpLabel="XP" />);
    expect(screen.queryByText('XP')).toBeNull();
  });
});
