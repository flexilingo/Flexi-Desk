import { ipaGroups, LIAISON_TIE } from '../lib/ipa';

/**
 * The transcription, with the places two words run into each other tied. The
 * tie is the accent colour because the accent means one thing on these cards:
 * what French changed.
 */
export function IpaLine({
  text,
  ipa,
  className,
}: {
  text: string;
  ipa: string;
  className?: string;
}) {
  const groups = ipaGroups(text, ipa);
  if (groups.length === 0) return null;
  return (
    <p dir="ltr" className={className}>
      /
      {groups.map((g, i) => (
        <span key={i}>
          {i > 0 &&
            (groups[i - 1].tied ? (
              <span className="font-bold text-accent">{LIAISON_TIE}</span>
            ) : (
              ' '
            ))}
          {g.ipa}
        </span>
      ))}
      /
    </p>
  );
}
