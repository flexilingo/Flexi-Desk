/**
 * Lightweight markdown renderer for chat messages.
 * Handles: **bold**, *italic*, `code`, - bullet lists, numbered lists, paragraphs.
 * No external dependencies.
 */
export function SimpleMarkdown({ content, className = '' }: { content: string; className?: string }) {
  const blocks = content.split(/\n\n+/);

  return (
    <div className={`space-y-2 ${className}`} dir="auto">
      {blocks.map((block, i) => (
        <Block key={i} text={block.trim()} />
      ))}
    </div>
  );
}

function Block({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split('\n');

  // Check if this is a bullet list
  const isBulletList = lines.every((l) => /^\s*[-*•]\s/.test(l) || !l.trim());
  if (isBulletList) {
    return (
      <ul className="space-y-1 list-disc list-inside">
        {lines
          .filter((l) => l.trim())
          .map((line, i) => (
            <li key={i} className="text-sm leading-relaxed">
              <InlineMarkdown text={line.replace(/^\s*[-*•]\s+/, '')} />
            </li>
          ))}
      </ul>
    );
  }

  // Check if this is a numbered list
  const isNumberedList = lines.every((l) => /^\s*\d+[.)]\s/.test(l) || !l.trim());
  if (isNumberedList) {
    return (
      <ol className="space-y-1 list-decimal list-inside">
        {lines
          .filter((l) => l.trim())
          .map((line, i) => (
            <li key={i} className="text-sm leading-relaxed">
              <InlineMarkdown text={line.replace(/^\s*\d+[.)]\s+/, '')} />
            </li>
          ))}
      </ol>
    );
  }

  // Regular paragraph (may have single newlines)
  return (
    <p className="text-sm leading-relaxed">
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          <InlineMarkdown text={line} />
        </span>
      ))}
    </p>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  // Process inline markdown: **bold**, *italic*, `code`
  const parts: { type: 'text' | 'bold' | 'italic' | 'code'; content: string }[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push({ type: 'text', content: boldMatch[1] });
      parts.push({ type: 'bold', content: boldMatch[2] });
      remaining = boldMatch[3];
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push({ type: 'text', content: italicMatch[1] });
      parts.push({ type: 'italic', content: italicMatch[2] });
      remaining = italicMatch[3];
      continue;
    }

    // Code: `text`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) parts.push({ type: 'text', content: codeMatch[1] });
      parts.push({ type: 'code', content: codeMatch[2] });
      remaining = codeMatch[3];
      continue;
    }

    // Plain text
    parts.push({ type: 'text', content: remaining });
    break;
  }

  return (
    <>
      {parts.map((part, i) => {
        switch (part.type) {
          case 'bold':
            return <strong key={i} className="font-semibold">{part.content}</strong>;
          case 'italic':
            return <em key={i}>{part.content}</em>;
          case 'code':
            return (
              <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                {part.content}
              </code>
            );
          default:
            return <span key={i}>{part.content}</span>;
        }
      })}
    </>
  );
}
