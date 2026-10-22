/**
 * A message or note that marks its French in backticks — "The `nous` form",
 * "`que` + clause" — shown with the French set apart instead of the backticks
 * printed as they are. The French is isolated, so it keeps its own direction
 * inside a Persian or Arabic sentence.
 */
export default function Ticks({ text }: { text: string }) {
  if (!text.includes('`')) return <>{text}</>;
  return (
    <span>
      {text.split('`').map((part, i) =>
        i % 2 ? (
          <bdi key={i} className="font-semibold normal-case">
            {part}
          </bdi>
        ) : (
          part
        ),
      )}
    </span>
  );
}
