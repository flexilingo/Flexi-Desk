import { useLookup } from '@/components/lookup/lookup-context';

/**
 * The verb in the page title, opening the word dialog like every French word in
 * the examples below. Plain text when no lookup provider is mounted.
 */
export default function VerbLemma({ lemma }: { lemma: string }) {
  const lookup = useLookup();
  if (!lookup) return <>{lemma}</>;
  return (
    <button
      type="button"
      onClick={() => lookup(lemma)}
      className="-mx-1 cursor-pointer rounded-[7px] px-1 text-start transition-colors hover:bg-accent/15 hover:text-accent"
    >
      {lemma}
    </button>
  );
}
