import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
  id?: string;
}

/** Type a tag and press Enter (or comma); click × to remove. */
export function TagInput({
  tags,
  onChange,
  placeholder,
  maxTags = 10,
  disabled,
  id,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const tag = raw.trim().replace(/,+$/, '').trim();
    if (!tag || tags.length >= maxTags) return;
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...tags, tag]);
  };

  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5',
        'focus-within:ring-2 focus-within:ring-primary',
        disabled && 'opacity-50',
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
        >
          {tag}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-muted-foreground hover:text-error"
            aria-label={`${tag} ×`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {tags.length < maxTags && (
        <input
          id={id}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(',')) {
              commit(v);
              setDraft('');
            } else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(draft);
              setDraft('');
            } else if (e.key === 'Backspace' && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            commit(draft);
            setDraft('');
          }}
          placeholder={tags.length === 0 ? placeholder : undefined}
          className="min-w-[8rem] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}
