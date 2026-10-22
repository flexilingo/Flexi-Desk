import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Cloud, Cpu, FileText, Info, KeyRound, RotateCw } from 'lucide-react';
import { AIError, analyzeWord } from '../api';
import { AiStoppedNotice, AiWorkingStatus } from '@/components/ai/AiWait';
import { cancelAiRequests } from '@/lib/aiWait';
import { aiStopKind } from '@/lib/aiSource';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { useAiSource } from '@/stores/aiSourceStore';
import { isAiSetupError } from '@/lib/aiSource';
import { directionOf } from '../languages';
import type { AIWordAnalysis, DeckCardData } from '../types';
import {
  ActionButton,
  AnswerCard,
  Card,
  Chip,
  ErrorBox,
  ExampleList,
  LoadingBlock,
  LookupChip,
  LookupSentence,
  Section,
} from '../ui';
import { useWordTrail } from '../WordTrail';
import { CefrChip } from '../CefrChip';

interface Props {
  word: string;
  sentenceContext: string | undefined;
  targetLanguage: string | null;
  sourceLanguage: string;
  isActive: boolean;
  /** `cloud` only when the user switched FlexiLingo's cloud AI on (and is entitled); otherwise the user's own AI. */
  route: 'cloud' | 'local';
  onDeckDataChange?: (data: DeckCardData | null) => void;
  /** Answers this dialog already holds, so going back up the trail spends no new analysis. */
  cache: Map<string, AIWordAnalysis>;
}

function notesFor(d: AIWordAnalysis): string {
  const parts = ['Source: AI Analysis', ''];
  if (d.ipa) parts.push(`Pronunciation: ${d.ipa}`);
  parts.push(`Contextual translation: ${d.contextualTranslation}`);
  if (d.definition) parts.push('', `Definition: ${d.definition}`);
  if (d.partOfSpeech) parts.push('', `Part of speech: ${d.partOfSpeech}`);
  if (d.difficulty) parts.push(`CEFR level: ${d.difficulty}`);
  if (d.tip) parts.push('', `Tip: ${d.tip}`);
  if (d.synonyms?.length) parts.push('', `Synonyms: ${d.synonyms.join(', ')}`);
  if (d.antonyms?.length) parts.push(`Antonyms: ${d.antonyms.join(', ')}`);
  if (d.collocations?.length) parts.push('', `Collocations: ${d.collocations.join(', ')}`);
  if (d.otherMeanings?.length) {
    parts.push('', 'Other meanings:');
    d.otherMeanings.forEach((s) => {
      const gloss = [s.translation, s.definition || s.definitionEn].filter(Boolean).join(' - ');
      parts.push(`   * ${s.label}${gloss ? `: ${gloss}` : ''}`);
    });
  }
  if (d.examples?.length) {
    parts.push('', 'Examples:');
    d.examples.forEach((ex, i) => {
      parts.push(`   ${i + 1}. "${ex.source || ex.en}"`);
      parts.push(`      -> "${ex.target || ex.tr}"`);
    });
  }
  return parts.join('\n');
}

export function AITab({
  word,
  sentenceContext,
  targetLanguage,
  sourceLanguage,
  isActive,
  route,
  onDeckDataChange,
  cache,
}: Props) {
  const { t } = useTranslation('wordDialog');
  const { t: tAi } = useTranslation('ai');
  const trail = useWordTrail();
  const { own } = useAiSource();
  // "Use the on-device model instead" after a cloud failure: this tab only.
  const [forceLocal, setForceLocal] = useState(false);
  const effectiveRoute = forceLocal ? 'local' : route;
  // Never a silent cloud fallback: when the user's own AI is not ready, ask them to set it up.
  const needsSetup = effectiveRoute === 'local' && own.kind === 'unconfigured';
  const origin = effectiveRoute === 'cloud' ? 'cloud' : own.kind === 'own' ? own.origin : 'device';

  // A collocation or synonym chip opens the dialog with no sentence; the phrase IS
  // the unit of meaning, so the word stands in for it (what the backend reads as "no context").
  const sentence = sentenceContext?.trim() || word;
  const key = targetLanguage
    ? [word, sentence, targetLanguage, sourceLanguage, effectiveRoute].join('\u0000')
    : null;

  const [answer, setAnswer] = useState<{ key: string; data: AIWordAnalysis } | null>(null);
  const [failure, setFailure] = useState<{ key: string; attempt: number; code: string } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  // When the request on the user's own AI started: elapsed time + Cancel while it runs.
  const [waitStart, setWaitStart] = useState<{ token: string; at: number } | null>(null);
  // One request per key: a tab switch or StrictMode re-run joins the one in flight instead of spending another analysis.
  const inflight = useRef(new Map<string, Promise<AIWordAnalysis>>());

  const data = key ? (answer?.key === key ? answer.data : (cache.get(key) ?? null)) : null;
  const errorCode =
    key && failure?.key === key && failure.attempt === attempt ? failure.code : null;

  useEffect(() => {
    if (!isActive || needsSetup || !key || !targetLanguage || cache.has(key)) return;
    const token = `${key}\u0000${attempt}`;
    let request = inflight.current.get(token);
    if (!request) {
      setWaitStart({ token, at: Date.now() });
      request = analyzeWord({
        word,
        sentence,
        source: sourceLanguage,
        target: targetLanguage,
        route: effectiveRoute,
      });
      inflight.current.set(token, request);
      const done = () => inflight.current.delete(token);
      request.then(done, done);
    }
    let live = true;
    request
      .then((result) => {
        cache.set(key, result);
        if (live) setAnswer({ key, data: result });
      })
      .catch((err) => {
        if (live)
          setFailure({ key, attempt, code: err instanceof AIError ? err.code : 'UNKNOWN_ERROR' });
      });
    return () => {
      live = false;
    };
  }, [
    isActive,
    needsSetup,
    key,
    attempt,
    word,
    sentence,
    sourceLanguage,
    targetLanguage,
    effectiveRoute,
    cache,
  ]);

  const deckData = useMemo<DeckCardData | null>(
    () =>
      data
        ? {
            word: data.word,
            back: data.contextualTranslation,
            notes: notesFor(data),
            examples: (data.examples ?? []).map((ex) => ({
              source: ex.source || ex.en || '',
              target: ex.target || ex.tr || '',
            })),
            source: 'ai',
          }
        : null,
    [data],
  );
  useEffect(() => {
    onDeckDataChange?.(deckData);
  }, [deckData, onDeckDataChange]);

  const dir = targetLanguage ? directionOf(targetLanguage) : 'ltr';

  if (needsSetup || (errorCode && isAiSetupError(errorCode))) {
    return <AiSetupCard compact onReady={() => setAttempt((n) => n + 1)} />;
  }

  const stop = errorCode ? aiStopKind(errorCode) : null;
  if (stop) return <AiStoppedNotice kind={stop} onRetry={() => setAttempt((n) => n + 1)} />;

  if (errorCode) {
    const message = t(`errors.${errorCode}`, { defaultValue: t('errors.UNKNOWN_ERROR') });
    return (
      <ErrorBox message={message}>
        <ActionButton variant="quiet" onClick={() => setAttempt((n) => n + 1)}>
          <RotateCw className="h-4 w-4" />
          {t('retry')}
        </ActionButton>
        {effectiveRoute === 'cloud' && (
          <ActionButton variant="quiet" onClick={() => setForceLocal(true)}>
            <Cpu className="h-4 w-4" />
            {t('aiUseOnDevice')}
          </ActionButton>
        )}
      </ErrorBox>
    );
  }

  if (!data) {
    if (!isActive) return null;
    const token = key ? `${key}\u0000${attempt}` : null;
    return (
      <div className="space-y-3">
        <LoadingBlock label={t('aiAnalyzing')} tone="accent" />
        {effectiveRoute === 'local' && (
          <AiWorkingStatus
            startedAt={waitStart && waitStart.token === token ? waitStart.at : null}
            onCancel={() => void cancelAiRequests()}
          />
        )}
      </div>
    );
  }

  // The header already shows the word and its IPA; repeat them only when the analysis
  // is about a different form, and never for a phrase.
  const repeatsTitle =
    /\s/.test(word.trim()) || data.word.trim().toLowerCase() === word.trim().toLowerCase();

  return (
    <div className="space-y-6">
      {!repeatsTitle && (
        <div className="flex items-baseline gap-3">
          <span className="text-[18px] font-bold text-foreground">{data.word}</span>
          {data.ipa && <span className="font-serif text-sm text-muted-foreground">{data.ipa}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="m-0 flex items-center gap-1.5 text-sm font-semibold text-accent">
          <Bot className="h-4 w-4" />
          {t('aiAnalysis')}
        </p>
        <span
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          title={tAi(`originHint.${origin === 'own_key' ? 'ownKey' : origin}`)}
        >
          {origin === 'device' ? (
            <Cpu className="h-3 w-3" />
          ) : origin === 'own_key' ? (
            <KeyRound className="h-3 w-3" />
          ) : (
            <Cloud className="h-3 w-3" />
          )}
          {tAi(`origin.${origin === 'own_key' ? 'ownKey' : origin}`)}
        </span>
      </div>

      <AnswerCard
        tone="accent"
        label={t('contextualTranslation')}
        text={data.contextualTranslation}
        dir={dir}
        lang={targetLanguage}
      />

      {data.definition && (
        <Card dir={dir}>
          <LookupSentence text={data.definition} lang={targetLanguage} />
        </Card>
      )}

      {(data.partOfSpeech || data.difficulty || data.register) && (
        <div className="flex flex-wrap items-center gap-2">
          {data.partOfSpeech && <Chip>{data.partOfSpeech}</Chip>}
          {data.difficulty && <CefrChip level={data.difficulty} />}
          {data.register && <Chip>{data.register}</Chip>}
        </div>
      )}

      {/* The senses this word carries elsewhere: reference, not the answer. */}
      {!!data.otherMeanings?.length && (
        <Section label={t('otherMeanings')}>
          <ul className="m-0 list-none divide-y divide-border rounded-[12px] border border-border bg-card p-0">
            {data.otherMeanings.map((sense, index) => (
              <li key={index} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  {sense.label && (
                    <span className="text-[13px] font-semibold text-primary">{sense.label}</span>
                  )}
                  {sense.translation && (
                    <span dir={dir} className="text-[15px] font-semibold text-foreground">
                      <LookupSentence text={sense.translation} lang={targetLanguage} />
                    </span>
                  )}
                </div>
                {sense.definition && (
                  <p dir={dir} className="m-0 mt-1 text-[13px] leading-snug text-muted-foreground">
                    <LookupSentence text={sense.definition} lang={targetLanguage} />
                  </p>
                )}
                {!sense.definition && sense.definitionEn && (
                  <p dir="ltr" className="m-0 mt-1 text-[13px] leading-snug text-muted-foreground">
                    <LookupSentence text={sense.definitionEn} lang="en" />
                  </p>
                )}
                {sense.example?.source && (
                  <p dir="ltr" className="m-0 mt-2 text-[13px] italic leading-snug text-foreground">
                    <LookupSentence text={sense.example.source} lang={sourceLanguage} />
                  </p>
                )}
                {sense.example?.target && (
                  <p
                    dir={dir}
                    className="m-0 mt-0.5 text-[13px] leading-snug text-muted-foreground"
                  >
                    <LookupSentence text={sense.example.target} lang={targetLanguage} />
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!!data.examples?.length && (
        <Section label={t('examples')} icon={FileText} tone="success">
          <ExampleList
            examples={data.examples.map((e) => ({
              source: e.source || e.en || '',
              target: e.target || e.tr,
            }))}
            sourceLanguage={sourceLanguage}
            targetLanguage={targetLanguage}
            targetDir={dir}
          />
        </Section>
      )}

      {!!data.collocations?.length && (
        <Section label={t('collocations')}>
          <div className="flex flex-wrap gap-2">
            {data.collocations.map((c, i) => (
              <LookupChip key={i} text={c} lang={sourceLanguage} />
            ))}
          </div>
        </Section>
      )}

      {data.tip && (
        <Section label={t('tip')} icon={Info} tone="warning">
          <Card dir={dir} tone="warning">
            <LookupSentence text={data.tip} lang={targetLanguage} />
          </Card>
        </Section>
      )}

      {!!data.synonyms?.length && (
        <Section label={t('synonyms')}>
          <div className="flex flex-wrap gap-2">
            {data.synonyms.map((s, i) => (
              <LookupChip key={i} text={s} lang={sourceLanguage} />
            ))}
          </div>
        </Section>
      )}

      {!!data.antonyms?.length && (
        <Section label={t('antonyms')}>
          <div className="flex flex-wrap gap-2">
            {data.antonyms.map((a, i) => (
              <LookupChip key={i} text={a} lang={sourceLanguage} />
            ))}
          </div>
        </Section>
      )}

      {!!data.wordFamily?.length && (
        <Section label={t('wordFamily')}>
          <ul className="m-0 list-none divide-y divide-border rounded-[12px] border border-border bg-card p-0">
            {data.wordFamily.map((entry, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-2 px-4 py-2.5">
                {trail?.canLookUp(sourceLanguage) ? (
                  <button
                    type="button"
                    dir="ltr"
                    onClick={() => trail.lookUp(entry.form, undefined, sourceLanguage)}
                    className="cursor-pointer text-[13px] font-semibold text-foreground transition-colors hover:text-accent hover:underline"
                  >
                    {entry.form}
                  </button>
                ) : (
                  <span dir="ltr" className="text-[13px] font-semibold text-foreground">
                    {entry.form}
                  </span>
                )}
                {entry.pos && (
                  <span className="text-[11px] text-muted-foreground">{entry.pos}</span>
                )}
                {entry.gloss && (
                  <span dir={dir} className="text-[13px] text-muted-foreground">
                    <LookupSentence text={entry.gloss} lang={targetLanguage} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
