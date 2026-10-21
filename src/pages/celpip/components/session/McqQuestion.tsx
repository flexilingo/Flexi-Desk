import { LookupText } from './WordLookup';
import { ExamText } from './ExamText';

interface McqQuestionProps {
  questionText: string;
  options: string[];
  selectedIndex: number | null;
  onChange: (index: number) => void;
  questionNumber: number;
}

export function McqQuestion({
  questionText,
  options,
  selectedIndex,
  onChange,
  questionNumber,
}: McqQuestionProps) {
  return (
    <div className="mb-6">
      {/* Question and option words are clickable in learning mode (LookupText
          no-ops without a provider). Inside an option, tapping a word translates
          it; tapping the radio badge or anywhere else on the row selects. */}
      <ExamText base={15} className="font-medium text-foreground mb-3">
        <span className="text-muted-foreground mr-2">{questionNumber}.</span>
        <LookupText text={questionText} />
      </ExamText>
      <div className="space-y-2">
        {options.map((option, i) => (
          <button
            key={i}
            onClick={() => {
              // A drag-selection inside the option is a translate gesture, not an
              // answer — don't let it flip the choice.
              if (!window.getSelection()?.isCollapsed) return;
              onChange(i);
            }}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-start gap-2.5 select-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 ${
              selectedIndex === i
                ? 'border-accent bg-accent/10 text-accent font-medium'
                : 'border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            {/* Radio circle — a dedicated, always-plain select target so word
                lookups never block choosing the answer. */}
            <span
              className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border-2 shrink-0 mt-0.5 ${
                selectedIndex === i ? 'border-accent' : 'border-border'
              }`}
            >
              {selectedIndex === i && <span className="w-2 h-2 rounded-full bg-accent" />}
            </span>
            <ExamText as="span" base={14} className="flex-1 min-w-0">
              <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
              <LookupText text={option} />
            </ExamText>
          </button>
        ))}
      </div>
    </div>
  );
}
