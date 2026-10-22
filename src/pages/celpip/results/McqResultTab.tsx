import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Circle } from 'lucide-react';
import type {
  SectionResult,
  ListeningContent,
  ReadingContent,
  InsightSkillState,
  TcfExplanationEntry,
} from '../types';
import { LookupText } from '../components/session/WordLookup';
import { TcfLevelBadge } from '../components/session/tcf/tcfShared';
import { InsightSubTab } from './InsightSubTab';
import { TcfMcqExplanationBlock, isTcfExplanation } from './TcfExplanations';
import { ListeningItemAudio, MediaLockNote } from './TaskRecordingPlayer';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

interface McqResultTabProps {
  result: SectionResult;
  examContent: ListeningContent | ReadingContent | null | undefined;
  yourAnswerLabel: string;
  /** AI-insight panel, surfaced as a trailing "Insight" sub-tab. */
  insightNode?: ReactNode;
  insightLabel?: string;
  insightState?: InsightSkillState;
  /** One question per part (TCF): review every item in one list, level shown. */
  itemsMode?: boolean;
  /** lang attribute for the questions and options (TCF: fr). */
  contentLang?: string;
  /**
   * TCF only (get_results tcf_explanations[section]): item position → its
   * explanation, or { locked } for a free account. Undefined for CELPIP, which
   * then renders exactly as before.
   */
  tcfExplanations?: Record<string, TcfExplanationEntry>;
  /** Listening, full result only (get_results listening_audio): part / item position → its recording. */
  listeningAudio?: Record<string, string>;
  /**
   * The recordings / transcripts exist but this result is locked (not Pro, and
   * not one of a free account's 2 full results this month): the server sent
   * none of them, and one note says where they are — never one per item.
   */
  reviewLocked?: boolean;
  reviewLockedText?: string;
  /**
   * CELPIP (get_results celpip_explanations[section]): answer key
   * `part_<p>_q_<q>` → its explanation, or { locked }. Letters and option
   * indices already follow the order this learner saw.
   */
  celpipExplanations?: Record<string, TcfExplanationEntry>;
  /** CELPIP: this session, sent with a translate request. */
  sessionId?: string;
}

/**
 * Listening/reading answer review for both exams: wrong / right tabs (wrong
 * first), one card per question, the AI insight as a third pill. TCF reviews its
 * single-question items numbered by place in the paper; CELPIP numbers its
 * several questions part.question.
 */
export function McqResultTab({
  result,
  examContent,
  yourAnswerLabel,
  insightNode,
  insightLabel,
  insightState,
  itemsMode = false,
  contentLang,
  tcfExplanations,
  listeningAudio,
  reviewLocked = false,
  reviewLockedText,
  celpipExplanations,
  sessionId,
}: McqResultTabProps) {
  const userAnswers = (result.answers || {}) as Record<string, number>;

  const parts = examContent?.parts ?? [];

  // TCF: one question per part, its explanation keyed by the part's position.
  // CELPIP: several per part, keyed by the answer key.
  const explanations = itemsMode ? tcfExplanations : celpipExplanations;
  return (
    <ItemsReview
      parts={parts}
      userAnswers={userAnswers}
      sectionType={result.section_type === 'listening' ? 'listening' : 'reading'}
      yourAnswerLabel={yourAnswerLabel}
      contentLang={contentLang}
      multi={!itemsMode}
      explanations={explanations}
      sessionId={itemsMode ? undefined : sessionId}
      audio={listeningAudio}
      lockNote={reviewLocked && reviewLockedText ? <MediaLockNote text={reviewLockedText} /> : null}
      insightNode={insightNode}
      insightLabel={insightLabel}
      insightState={insightState}
    />
  );
}

// ── ItemsReview (the results page, both exams) ───────────────────────────────
//
// Two tabs, wrong first (owner, 2026-10-16: «اکثرا افراد دنبال اونایی هستن که
// غلط زدن»): a learner opens the results to see what they missed, so the misses
// are the default view and the right answers wait one tap away. Unanswered
// items count as wrong. Numbers stay the item's place in the paper — TCF's
// item number, CELPIP's part.question. CELPIP (owner, same day: both exams
// alike) reviews the same way, its Insight a third pill beside the two tabs.

type ItemRef = { pi: number; qi: number };

function ItemsReview({
  parts,
  userAnswers,
  sectionType,
  yourAnswerLabel,
  contentLang,
  multi,
  explanations,
  sessionId,
  audio,
  lockNote,
  insightNode,
  insightLabel,
  insightState,
}: {
  parts: (ListeningContent | ReadingContent)['parts'];
  userAnswers: Record<string, number>;
  sectionType: 'listening' | 'reading';
  yourAnswerLabel: string;
  contentLang?: string;
  /** CELPIP: several questions per part. TCF: one. */
  multi: boolean;
  /** TCF: keyed by the part's position. CELPIP: by the answer key part_<p>_q_<q>. */
  explanations?: Record<string, TcfExplanationEntry>;
  sessionId?: string;
  audio?: Record<string, string>;
  /** A locked result: the one note on what was withheld, under the tabs. */
  lockNote?: ReactNode;
  /** CELPIP: the section's AI insight, a third pill beside Wrong / Right. */
  insightNode?: ReactNode;
  insightLabel?: string;
  insightState?: InsightSkillState;
}) {
  const { t } = useTranslation('exam');
  const answerKey = ({ pi, qi }: ItemRef) => `part_${pi}_q_${qi}`;
  const items: ItemRef[] = multi
    ? parts.flatMap((part, pi) => (part?.questions ?? []).map((_, qi) => ({ pi, qi })))
    : parts.map((_, pi) => ({ pi, qi: 0 })).filter(({ pi }) => parts[pi]?.questions[0]);
  const isMissed = (item: ItemRef) =>
    userAnswers[answerKey(item)] !== parts[item.pi]?.questions[item.qi]?.correct_index;
  const wrong = items.filter(isMissed);
  const right = items.filter((item) => !isMissed(item));
  const [view, setView] = useState<'wrong' | 'right' | 'insight'>(
    wrong.length > 0 ? 'wrong' : 'right',
  );
  // The Insight pill can disappear once its report turns out to add nothing (SkillTab):
  // never leave the learner on a tab that is no longer there.
  const current =
    view === 'insight' && !insightNode ? (wrong.length > 0 ? 'wrong' : 'right') : view;
  const shown = current === 'wrong' ? wrong : current === 'right' ? right : [];

  const tab = (key: 'wrong' | 'right', label: string, count: number) => {
    const isActive = current === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setView(key)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12px] font-semibold border transition-colors ${
          isActive
            ? 'bg-primary text-white border-primary'
            : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
        }`}
      >
        {label}
        <span
          className={`text-[10.5px] tabular-nums font-bold px-1.5 py-[1px] rounded-full ${
            isActive
              ? 'bg-card/20 text-white'
              : key === 'wrong'
                ? 'bg-error/10 text-error'
                : 'bg-success/15 text-success'
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {tab('wrong', t('results.reviewTabs.wrong'), wrong.length)}
        {tab('right', t('results.reviewTabs.right'), right.length)}
        {insightNode ? (
          <InsightSubTab
            label={insightLabel ?? t('insightTab')}
            active={current === 'insight'}
            state={insightState}
            onClick={() => setView('insight')}
          />
        ) : null}
        <span className="ms-auto text-[10px] text-caption tabular-nums">
          {right.length}/{items.length}
        </span>
      </div>
      {current === 'insight' ? (
        insightNode
      ) : (
        <>
          {lockNote}
          {shown.length === 0 ? (
            <p className="px-1 py-6 text-[13.5px] leading-relaxed text-muted-foreground">
              {current === 'wrong'
                ? t('results.reviewTabs.noneWrong')
                : t('results.reviewTabs.noneRight')}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {shown.map((item, i) => (
                <div key={answerKey(item)} className="flex flex-col gap-2.5">
                  {/* CELPIP: where the list moves on to another part, say which. */}
                  {multi && (i === 0 || shown[i - 1].pi !== item.pi) && (
                    <div className={`flex items-center gap-2 px-1 ${i === 0 ? '' : 'pt-1'}`}>
                      <h3 className="text-[10.5px] font-bold uppercase tracking-[.12em] text-caption">
                        {t('part')} {item.pi + 1}
                      </h3>
                      <span className="flex-1 h-px bg-muted" />
                    </div>
                  )}
                  <ReviewItem
                    pi={item.pi}
                    qi={item.qi}
                    multi={multi}
                    part={parts[item.pi]}
                    userChoice={userAnswers[answerKey(item)]}
                    missed={current === 'wrong'}
                    sectionType={sectionType}
                    yourAnswerLabel={yourAnswerLabel}
                    contentLang={contentLang}
                    explanation={explanations?.[multi ? answerKey(item) : String(item.pi)]}
                    lettered={Boolean(explanations)}
                    sessionId={sessionId}
                    audioSrc={sectionType === 'listening' ? audio?.[String(item.pi)] : undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReviewItem({
  pi,
  qi,
  multi,
  part,
  userChoice,
  missed,
  sectionType,
  yourAnswerLabel,
  contentLang,
  explanation: rawExplanation,
  lettered,
  sessionId,
  audioSrc,
}: {
  pi: number;
  qi: number;
  multi: boolean;
  part: (ListeningContent | ReadingContent)['parts'][number];
  userChoice: number | undefined;
  missed: boolean;
  sectionType: 'listening' | 'reading';
  yourAnswerLabel: string;
  contentLang?: string;
  explanation?: TcfExplanationEntry;
  lettered: boolean;
  sessionId?: string;
  /** This item's (TCF) or this part's (CELPIP) recording — listening, full result only. */
  audioSrc?: string;
}) {
  const { t } = useTranslation('exam');
  // A right answer opens its explanation on request (a locked result is not
  // shown a lock under every question it got right).
  const [open, setOpen] = useState(false);
  const q = part.questions[qi];
  const level = (part as { level?: string }).level ?? null;
  const canExplainRight = !missed && isTcfExplanation(rawExplanation);
  const explanation = missed || open ? rawExplanation : undefined;
  // TCF: the content's own question_index. CELPIP: the catalogue's, which is the
  // question's place in its part.
  const questionIndex = multi
    ? isTcfExplanation(rawExplanation) && typeof rawExplanation.question_index === 'number'
      ? rawExplanation.question_index
      : qi
    : typeof q.question_index === 'number'
      ? q.question_index
      : undefined;
  // Only a full result carries these: the server strips the sentence that holds
  // the answer, the transcript, the reading text and the audio from a locked one.
  const evidence = (part as { evidence?: string }).evidence;
  const script = (part as { script?: unknown }).script;
  // Listen again and read along (listening), or read the text again (reading) —
  // at the top of the card, before the question, where it is seen; it used to
  // sit under the card, past the explanation. Every item, right or wrong. The
  // sentence that holds the answer (TCF) is marked inside it, so there is no
  // separate "the answer is here" line any more.
  const hasScript = sectionType === 'listening' && scriptLines(script).length > 0;
  const hasText = sectionType === 'reading' && readingBlocks(part).length > 0;
  const header =
    audioSrc || hasScript || hasText ? (
      <div className="flex flex-col gap-2 pb-3 mb-3 border-b border-border">
        {audioSrc && <ListeningItemAudio src={audioSrc} />}
        {hasScript && (
          <PartTranscript script={script} evidence={evidence} lang={contentLang} flat />
        )}
        {hasText && <ReadingText part={part} evidence={evidence} lang={contentLang} flat />}
      </div>
    ) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <McqReviewCard
        header={header}
        number={multi ? `${pi + 1}.${qi + 1}` : pi + 1}
        question={q.question}
        options={q.options}
        correctIndex={q.correct_index}
        userChoice={userChoice}
        yourAnswerLabel={yourAnswerLabel}
        contentLang={contentLang}
        badge={<TcfLevelBadge level={level} />}
        // The explanations name options by letter (A–D, in the order shown).
        lettered={lettered}
        // CELPIP's English question and options keep their word lookup.
        lookup={multi}
        footer={
          explanation ? (
            <TcfMcqExplanationBlock
              entry={explanation}
              sectionType={sectionType}
              userChoice={userChoice}
              questionIndex={questionIndex}
              contentLang={contentLang ?? 'en'}
              sessionId={sessionId}
            />
          ) : canExplainRight ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-3 inline-flex items-center gap-1 h-8 px-3 rounded-[8px] text-[13px] font-semibold text-foreground bg-muted hover:bg-muted/70"
            >
              {t('results.reviewTabs.showExplanation')}
            </button>
          ) : null
        }
      />
    </div>
  );
}

// ── McqReviewCard (one question of the review list) ──────────────────────────
// Same card as the per-part review above, for one item of the wrong / right
// list. Kept separate so the per-part markup (the public demo) stays untouched.

function McqReviewCard({
  number,
  question,
  options,
  correctIndex,
  userChoice,
  yourAnswerLabel,
  contentLang,
  badge,
  lettered = false,
  lookup = false,
  header,
  footer,
}: {
  /** TCF: the item number. CELPIP: "part.question". */
  number: number | string;
  question: string;
  options: string[];
  correctIndex: number;
  userChoice: number | undefined;
  yourAnswerLabel: string;
  contentLang?: string;
  badge: ReactNode;
  /**
   * Explanations present: each option carries its letter (A–D, in the order
   * shown) and the question and options stay left-to-right.
   */
  lettered?: boolean;
  /** Tap a word to look it up (CELPIP's English). */
  lookup?: boolean;
  /** Above the question, inside the card (the item's audio and transcript). */
  header?: ReactNode;
  /** Under the options, inside the card (the explanation). */
  footer?: ReactNode;
}) {
  const answered = userChoice !== undefined;
  const correct = answered && userChoice === correctIndex;
  const text = (value: string) => (lookup ? <LookupText text={value} /> : value);
  return (
    <div
      className={`rounded-[9px] border border-border bg-card border-l-[3px] p-4 shadow-sm ${
        correct ? 'border-l-success' : 'border-l-error'
      }`}
    >
      {header}
      <div className={`flex items-start gap-3 ${correct ? 'sm:mb-3' : 'mb-3'}`}>
        <span
          className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full ${
            correct ? 'bg-success/20 text-success' : 'bg-error/15 text-error'
          }`}
        >
          {correct ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        </span>
        <p
          dir={lettered ? 'ltr' : undefined}
          className={`text-[13.5px] text-foreground leading-relaxed flex-1${lettered ? ' text-left' : ''}`}
        >
          <span className="font-bold text-caption me-1.5 tabular-nums">{number}.</span>
          <span lang={contentLang} translate="no" className="notranslate">
            {text(question)}
          </span>
        </p>
        {badge}
      </div>
      <div
        lang={contentLang}
        dir={lettered ? 'ltr' : undefined}
        className={`${correct ? '' : ''}grid grid-cols-1 sm:grid-cols-2 gap-1.5`}
      >
        {options.map((opt, oi) => {
          const isCorrect = oi === correctIndex;
          const isUserWrong = answered && oi === userChoice && !correct;
          return (
            <div
              key={oi}
              className={`text-[12px] px-3 py-2 rounded-[7px] flex items-center gap-2 ${
                isCorrect
                  ? 'bg-success/[0.10] text-success font-semibold border border-success/30'
                  : isUserWrong
                    ? 'bg-error/10 text-error border border-error/30'
                    : 'text-muted-foreground bg-card border border-border'
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${
                  isCorrect
                    ? 'bg-success text-white'
                    : isUserWrong
                      ? 'bg-error text-white'
                      : 'bg-muted text-caption'
                }`}
              >
                {lettered ? (
                  <span className="text-[10.5px] font-bold leading-none">
                    {OPTION_LETTERS[oi] ?? oi + 1}
                  </span>
                ) : isCorrect ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : isUserWrong ? (
                  <XCircle className="w-3 h-3" />
                ) : (
                  <Circle className="w-2.5 h-2.5" />
                )}
              </span>
              <span translate="no" className="notranslate flex-1 min-w-0">
                {text(opt)}
              </span>
              {isUserWrong && (
                <span
                  lang=""
                  className="shrink-0 text-[10px] uppercase tracking-wider font-bold opacity-70"
                >
                  {yourAnswerLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

// ── Why was it that answer ───────────────────────────────────────────────────
// The part's content already carries the audio script (every listening part)
// and, for TCF items, the sentence that holds the answer ("evidence"). Results
// used to show only right/wrong; a learner could not see what they missed.

type ScriptLine = { speaker?: string; text?: string };

function scriptLines(script: unknown): ScriptLine[] {
  if (typeof script === 'string')
    return script
      .split(/\n+/)
      .filter(Boolean)
      .map((text) => ({ text }));
  if (Array.isArray(script)) return script as ScriptLine[];
  return [];
}

/** The line with the evidence in it, the evidence marked. */
function withEvidence(text: string, evidence?: string): ReactNode {
  if (!evidence) return text;
  const at = text.indexOf(evidence);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[3px] bg-accent/25 px-0.5 text-foreground">{evidence}</mark>
      {text.slice(at + evidence.length)}
    </>
  );
}

export function PartTranscript({
  script,
  evidence,
  lang,
  flat = false,
}: {
  script: unknown;
  evidence?: string;
  lang?: string;
  /** Inside a card already: no box of its own (one level of nesting at most). */
  flat?: boolean;
}) {
  const { t } = useTranslation('exam');
  const lines = scriptLines(script);
  if (lines.length === 0) return null;
  return (
    <details
      className={flat ? 'group' : 'group rounded-[9px] border border-border bg-card px-3.5 py-2.5'}
    >
      <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-primary">
        {t('results.showTranscript')}
      </summary>
      {/* The recording's own language (English / French) reads left-to-right on any
          page, and is kept out of the browser's page translation (exam content). */}
      <div
        lang={lang}
        dir="ltr"
        translate="no"
        className="notranslate mt-2 flex flex-col gap-1.5 text-left text-[13px] leading-relaxed text-foreground"
      >
        {lines.map((l, i) => (
          <p key={i}>
            {l.speaker ? (
              <span className="font-semibold text-muted-foreground">{l.speaker}: </span>
            ) : null}
            {withEvidence(l.text ?? '', evidence)}
          </p>
        ))}
      </div>
      <EvidenceFallback
        text={lines.map((l) => l.text ?? '').join('\n')}
        evidence={evidence}
        lang={lang}
        className="mt-2"
      />
    </details>
  );
}

/** "The answer is here: «…»" — only where the marked sentence could not be found in the text. */
function EvidenceFallback({
  text,
  evidence,
  lang,
  className = '',
}: {
  text: string;
  evidence?: string;
  lang?: string;
  className?: string;
}) {
  const { t } = useTranslation('exam');
  if (!evidence || text.includes(evidence)) return null;
  return (
    <p className={`text-[12.5px] leading-relaxed text-muted-foreground ${className}`}>
      <span className="font-semibold text-foreground">{t('results.answerIsHere')} </span>
      {/* French: isolated left-to-right, or an RTL page moves its closing
          punctuation to the front («.Votre chambre…»). */}
      <bdi dir="ltr" lang={lang} translate="no" className="notranslate">
        «{evidence}»
      </bdi>
    </p>
  );
}

type ReadingBlock = { label?: string; text: string };

/**
 * The text a reading item or part was asked on, whatever its shape: TCF's
 * `document`; CELPIP's two letters, its sources / passages, or its single
 * passage with the diagram described in words.
 */
function readingBlocks(part: unknown): ReadingBlock[] {
  const p = (part ?? {}) as {
    document?: unknown;
    passage?: unknown;
    passages?: Array<{ source?: string; text?: string }>;
    sources?: Array<{ label?: string; text?: string }>;
    message_1?: { from?: string; to?: string; subject?: string; text?: string };
    message_2?: { from?: string; to?: string; subject?: string; text?: string };
    diagram_description?: unknown;
  };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  const out: ReadingBlock[] = [];
  const doc = str(p.document);
  if (doc) out.push({ text: doc });
  for (const m of [p.message_1, p.message_2]) {
    const text = str(m?.text);
    if (!text) continue;
    const label = [m?.from && m?.to ? `${m.from} → ${m.to}` : m?.from || m?.to, m?.subject]
      .filter(Boolean)
      .join(' · ');
    out.push({ label: label || undefined, text });
  }
  for (const src of [
    ...(Array.isArray(p.passages)
      ? p.passages.map((x) => ({ label: x?.source, text: x?.text }))
      : []),
    ...(Array.isArray(p.sources) ? p.sources.map((x) => ({ label: x?.label, text: x?.text })) : []),
  ]) {
    const text = str(src.text);
    if (text) out.push({ label: src.label || undefined, text });
  }
  const passage = str(p.passage);
  if (passage) out.push({ text: passage });
  const diagram = str(p.diagram_description);
  if (diagram) out.push({ label: 'diagram', text: diagram });
  return out;
}

/** The reading text, folded, with the sentence that holds the answer marked (TCF). */
export function ReadingText({
  part,
  evidence,
  lang,
  flat = false,
}: {
  part: unknown;
  evidence?: string;
  lang?: string;
  /** Inside a card already: no box of its own (one level of nesting at most). */
  flat?: boolean;
}) {
  const { t } = useTranslation('exam');
  const blocks = readingBlocks(part);
  if (blocks.length === 0) return null;
  const all = blocks.map((b) => b.text).join('\n');
  return (
    <details
      className={flat ? 'group' : 'group rounded-[9px] border border-border bg-card px-3.5 py-2.5'}
    >
      <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-primary">
        {t('results.showText')}
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        {blocks.map((b, i) => (
          <div key={i} className="flex flex-col gap-1">
            {b.label === 'diagram' ? (
              <p className="text-[11px] font-semibold text-caption uppercase tracking-[.1em]">
                {t('readingDiagramLabel')}
              </p>
            ) : b.label ? (
              <p
                dir="ltr"
                lang={lang}
                translate="no"
                className="notranslate text-left text-[11px] font-semibold text-caption uppercase tracking-[.1em]"
              >
                {b.label}
              </p>
            ) : null}
            {/* The text's own language (English / French) reads left-to-right on any
                page, and is kept out of the browser's page translation (exam content). */}
            <div
              lang={lang}
              dir="ltr"
              translate="no"
              className="notranslate flex flex-col gap-1.5 text-left text-[13px] leading-relaxed text-foreground"
            >
              {b.text
                .split(/\n+/)
                .filter(Boolean)
                .map((line, j) => (
                  <p key={j}>{withEvidence(line, evidence)}</p>
                ))}
            </div>
          </div>
        ))}
        <EvidenceFallback text={all} evidence={evidence} lang={lang} />
      </div>
    </details>
  );
}
