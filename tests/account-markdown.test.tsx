import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown, parseBlocks, safeHref } from '@/lib/account/markdown';

describe('markdown for topics and comments', () => {
  it('only http(s) links are links', () => {
    expect(safeHref('https://flexilingo.com')).toBe('https://flexilingo.com');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
  });
  it('parses headings, lists, quotes and code', () => {
    const b = parseBlocks('# T\n\n- a\n- b\n\n1. x\n2. y\n\n> q\n\n```\ncode\n```\n\ntext');
    expect(b.map((x) => x.type)).toEqual(['heading', 'ul', 'ol', 'quote', 'code', 'p']);
  });
  it('renders bold, italic, code and safe links', () => {
    const { container } = render(
      <Markdown content={'**b** *i* `c` [ok](https://a.b) [bad](javascript:x)'} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('b');
    expect(container.querySelector('em')?.textContent).toBe('i');
    expect(container.querySelector('code')?.textContent).toBe('c');
    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('rel')).toContain('noopener');
  });
  it('never injects HTML', () => {
    const { container } = render(
      <Markdown content={'<script>window.x=1</script><img src=x onerror=alert(1)>'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });
});
