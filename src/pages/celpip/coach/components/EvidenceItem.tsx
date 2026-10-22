/**
 * One real question this learner got wrong, shown in full.
 *
 * This component is why the report is believable. Anyone can be told "you
 * struggle with inference questions"; being shown the actual question you saw
 * on 18 July, the sentence in the passage that settled it, the option you
 * picked and the one that was right, is a different kind of claim — it is
 * checkable. So nothing here is summarised or paraphrased.
 *
 * Two design constraints shape the markup:
 *
 *   · Nesting. This sits inside a skill panel, which is already the one
 *     permitted card. So it is a rule-and-indent block, not another bordered
 *     box — otherwise the page is boxes inside boxes inside boxes.
 *   · Direction. Every quoted string is English inside prose that may be
 *     Persian or Arabic, so each one carries its own dir="ltr". Without that,
 *     an RTL reader gets the punctuation thrown to the wrong end of the
 *     sentence and the quotation stops being a quotation.
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check, X, ExternalLink } from 'lucide-react';
import { LookupText } from '../../components/session/WordLookup';
import type { CoachEvidence } from '../coachTypes';
import { shortDate } from './shared';

export function EvidenceItem({
  evidence,
  examType,
}: {
  evidence: CoachEvidence;
  examType: string;
}) {
  const { t, i18n } = useTranslation('exam');
  const locale = i18n.language;

  return (
    <div className="border-s-2 border-border ps-3 py-0.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold text-caption tabular-nums truncate">
          {evidence.ref}
          {evidence.date ? ` · ${shortDate(evidence.date, locale)}` : ''}
        </span>
        {evidence.session_id && (
          <Link
            to={`/exam/${examType}/results/${evidence.session_id}`}
            className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary hover:text-primary shrink-0"
          >
            {t('coach.openSession')}
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        )}
      </div>

      {evidence.question && (
        <p
          dir="ltr"
          className="text-left text-[12.5px] font-semibold text-foreground leading-relaxed"
        >
          <LookupText text={evidence.question} />
        </p>
      )}

      {evidence.passage_span && (
        <p
          dir="ltr"
          className="text-left text-[12px] text-muted-foreground leading-relaxed italic bg-muted rounded-[7px] px-2.5 py-2"
        >
          <LookupText text={evidence.passage_span} />
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-x-4 gap-y-1.5 text-[12px]">
        <p dir="ltr" className="text-left flex items-start gap-1.5 min-w-0 flex-1">
          <X className="w-3 h-3 text-error shrink-0 mt-[3px]" />
          <span className="text-muted-foreground line-through decoration-danger-500/40">
            {evidence.your_answer || '—'}
          </span>
        </p>
        <p dir="ltr" className="text-left flex items-start gap-1.5 min-w-0 flex-1">
          <Check className="w-3 h-3 text-success shrink-0 mt-[3px]" />
          <span className="text-foreground font-semibold">{evidence.correct_answer || '—'}</span>
        </p>
      </div>

      {/* The sharpest sentence in the report: which word decided it. */}
      {evidence.the_tell && (
        <p className="text-[12px] text-foreground leading-relaxed">
          <span className="font-bold text-primary">{t('coach.theTell')}: </span>
          {evidence.the_tell}
        </p>
      )}
    </div>
  );
}
