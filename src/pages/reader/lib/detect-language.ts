/**
 * Which language a text is written in, decided on this computer from the text alone.
 *
 * Why it exists: a document used to take the learner's learning language as its own, so a
 * French textbook added by someone learning English was stored as English and every tapped
 * word was explained, spoken and levelled as English. This reads the text instead.
 *
 * Small on purpose (no dependency, no model): scripts that identify a language by
 * themselves (Han, Kana, Devanagari, Cyrillic, Arabic) are counted by letters; Latin-script
 * languages by how much of the text is each language's most common function words. A text
 * that is too short, or where two languages score alike, is NOT answered — wrong is worse
 * than unknown, because the answer becomes the document's language.
 */

export type DetectedLanguage = { code: string; confident: boolean };

/** Fewer words (or letters, for Han) than this is too little to judge. */
export const MIN_WORDS = 40;
export const MIN_HAN_LETTERS = 20;
/** The winner's share of function words must reach this, and beat the runner-up by this factor. */
const MIN_SHARE = 0.1;
const MIN_MARGIN = 1.6;

/** The most common function words of each Latin- or Cyrillic-script language. */
const STOPWORDS: Record<string, string> = {
  en: 'the of and to in is that it was for on are as with his they at be this from have or by not but what all were when we there can an your which their if do will each about how up out them then she so these would into has more her like him could no than been its who now my did only may very after just where most get through much before our me any also because does such here why again off still should while might both those without once being since during however',
  fr: 'le la les de des du un une et est en que qui dans pour pas sur au aux avec ce cette ces se sont il elle ils elles nous vous je tu ne plus par mais ou où son sa ses leur leurs on été être avoir fait comme tout tous très aussi sans sous entre chez donc alors si bien elles cela ceci y ont avait était depuis encore quand même jeux voici voilà',
  es: 'el la los las de del un una unos unas y es en que por con para no se su sus al lo como más pero sin sobre este esta estos estas son fue ha han ser está están muy también todo todos entre cuando hay donde le les mi tu nos ya porque así desde hasta otro otra',
  de: 'der die das den dem des ein eine einen einem einer und ist sind war nicht mit von zu auf für im in am an als auch es sich dem wird werden haben hat aber oder wenn wie nur noch nach bei aus über so dass kann sein ihr ich du wir sie er man diese dieser dieses sehr schon wurde zum zur',
  it: 'il lo la i gli le di del della dei delle un una uno e è in che per con non si su al alla ai come più ma sono questo questa questi queste anche se ha hanno essere stato molto tutto tra fra del nel nella suo sua loro io tu noi voi lui lei quando dove perché già ancora',
  pt: 'o a os as de do da dos das um uma uns umas e é em que por com para não se seu sua seus suas ao aos como mais mas sem sobre este esta estes estas são foi ter tem muito também todo todos entre quando onde eu você nós eles elas já porque assim até outro outra',
  tr: 'bir ve bu da de için ile ben sen o biz siz onlar ne çok daha en gibi ama ya veya mi mı mu mü var yok olarak olan oldu olur ise kadar sonra önce her şey çünkü ancak bunu şu kendi değil gün',
  ru: 'и в не на я что он с как это она они мы вы по но из у за от же так для то все его ее их был была были было бы только уже или если когда ещё очень можно',
};

const SETS = Object.fromEntries(
  Object.entries(STOPWORDS).map(([code, words]) => [code, new Set(words.split(' '))]),
) as Record<string, Set<string>>;

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/** Words of a text in lowercase, letters only. */
const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{M}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);

/**
 * The language of `text`, or `{ code: '', confident: false }` when it cannot be told.
 * Codes are the two-letter codes the reader stores (`fa`, `zh`, ...).
 */
export function detectLanguage(text: string): DetectedLanguage {
  const unknown = { code: '', confident: false };
  const sample = text.slice(0, 20000);

  const han = count(sample, /\p{Script=Han}/gu);
  const kana = count(sample, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const arabic = count(sample, /\p{Script=Arabic}/gu);
  const devanagari = count(sample, /\p{Script=Devanagari}/gu);
  const cyrillic = count(sample, /\p{Script=Cyrillic}/gu);
  const latin = count(sample, /\p{Script=Latin}/gu);
  const letters = han + kana + arabic + devanagari + cyrillic + latin;
  if (letters < MIN_HAN_LETTERS) return unknown;

  // A script that carries a text wins when it is most of the letters.
  const dominant = (n: number) => n / letters >= 0.6;
  if (dominant(kana + han) && kana + han >= MIN_HAN_LETTERS) {
    // Japanese mixes kana through its sentences; Chinese has none.
    return { code: kana / (kana + han) > 0.05 ? 'ja' : 'zh', confident: true };
  }
  if (dominant(devanagari) && devanagari >= MIN_HAN_LETTERS) return { code: 'hi', confident: true };
  if (dominant(arabic) && arabic >= MIN_HAN_LETTERS) {
    // Persian writes four letters Arabic does not, and ends words with Persian yeh/kaf.
    const persian = count(sample, /[پچژگکی]/gu);
    return { code: persian / arabic > 0.03 ? 'fa' : 'ar', confident: true };
  }

  const tokens = wordsOf(sample);
  if (dominant(cyrillic)) {
    if (tokens.length < MIN_WORDS) return unknown;
    return { code: 'ru', confident: true };
  }
  if (!dominant(latin) || tokens.length < MIN_WORDS) return unknown;

  const scores = Object.entries(SETS)
    .map(([code, set]) => [code, tokens.filter((t) => set.has(t)).length / tokens.length] as const)
    .sort((a, b) => b[1] - a[1]);
  const [best, runnerUp] = scores;
  const confident = best[1] >= MIN_SHARE && best[1] >= MIN_MARGIN * Math.max(runnerUp[1], 0.0001);
  return confident ? { code: best[0], confident: true } : unknown;
}

/**
 * The one-time correction of a stored language.
 *
 * Applies only when the stored language is the one the add dialog would have defaulted to
 * (the learning language, or English) — a language the reader picked on purpose is theirs —
 * the detection is confident and different, and this document has not been checked before.
 * Returns the language to switch to, or null.
 */
export function languageCorrection(args: {
  stored: string;
  defaultLanguage: string;
  detected: DetectedLanguage;
  alreadyChecked: boolean;
}): string | null {
  const { stored, defaultLanguage, detected, alreadyChecked } = args;
  if (alreadyChecked || !detected.confident || !detected.code) return null;
  if (detected.code === stored) return null;
  if (stored !== defaultLanguage && stored !== 'en') return null;
  return detected.code;
}

/** The marker that says a document was already checked, so a changed mind is never overruled. */
export const languageCheckedKey = (documentId: string) => `reader_lang_checked_${documentId}`;
