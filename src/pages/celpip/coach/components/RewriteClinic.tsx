/**
 * Their own paragraph, repaired line by line.
 *
 * The instruction to the model is that `upgraded_paragraph` must be
 * recognisably theirs — same content, same argument, same voice, with the
 * broken parts fixed. That constraint is the entire value: a learner shown a
 * better essay written by someone else learns nothing and knows it. A learner
 * shown their own sentence with one preposition changed learns the preposition.
 *
 * So the layout puts their words and the repair side by side, with the reason
 * underneath in their own language.
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink } from 'lucide-react';
import type { CoachClinic, CoachSkill } from '../coachTypes';
import { shortDate } from './shared';

export function RewriteClinic({
  clinic,
  skill,
  examType,
}: {
  clinic: CoachClinic;
  skill: CoachSkill;
  examType: string;
}) {
  const { t, i18n } = useTranslation('exam');
  const locale = i18n.language;

  return (
    <article className="px-4 py-4 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-foreground">
          {skill === 'speaking' ? t('coach.replyClinic') : t('coach.rewriteClinic')}
          {clinic.task_type ? (
            <span className="ms-2 text-[11.5px] font-semibold text-caption">
              {clinic.task_type.replace(/_/g, ' ')}
              {clinic.date ? ` · ${shortDate(clinic.date, locale)}` : ''}
            </span>
          ) : null}
        </h3>
        {clinic.session_id && (
          <Link
            to={`/exam/${examType}/results/${clinic.session_id}`}
            className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary hover:text-primary shrink-0"
          >
            {t('coach.openSession')}
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        )}
      </header>

      {clinic.your_paragraph && (
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-caption mb-1">
            {t('coach.whatYouWrote')}
          </p>
          <p
            dir="ltr"
            className="text-left text-[12.5px] text-muted-foreground leading-relaxed bg-muted rounded-[7px] px-3 py-2.5"
          >
            {clinic.your_paragraph}
          </p>
        </div>
      )}

      {(clinic.line_by_line?.length ?? 0) > 0 && (
        <div className="space-y-2.5">
          {clinic.line_by_line!.map((line, i) => (
            <div key={i} className="border-s-2 border-border ps-3 space-y-1">
              <div
                dir="ltr"
                className="text-left flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]"
              >
                <span className="text-muted-foreground line-through decoration-danger-500/40">
                  {line.yours}
                </span>
                <ArrowRight className="w-3 h-3 text-caption shrink-0 self-center" />
                <span className="text-foreground font-semibold">{line.better}</span>
              </div>
              {line.why && (
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">{line.why}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {clinic.upgraded_paragraph && (
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-caption mb-1">
            {t('coach.sameIdeaRepaired')}
            {clinic.band_delta ? (
              <span className="ms-2 text-success normal-case tracking-normal">
                {clinic.band_delta}
              </span>
            ) : null}
          </p>
          <p
            dir="ltr"
            className="text-left text-[12.5px] text-foreground leading-relaxed rounded-[7px] bg-success/[0.08] px-3 py-2.5"
          >
            {clinic.upgraded_paragraph}
          </p>
        </div>
      )}
    </article>
  );
}
