// ── Phrasal Verb / Collocation Detection ─────────────────
// Detects common English phrasal verbs in word sequences.
// Useful for language learners to recognize multi-word expressions.

const PHRASAL_VERBS: Record<string, string[]> = {
  look: ['up', 'at', 'for', 'into', 'out', 'after', 'over', 'through', 'around'],
  give: ['up', 'in', 'away', 'back', 'out', 'off'],
  take: ['off', 'on', 'up', 'over', 'out', 'in', 'back', 'down', 'apart', 'away'],
  turn: ['on', 'off', 'up', 'down', 'out', 'over', 'around', 'into', 'back'],
  pick: ['up', 'out', 'on', 'off', 'over'],
  put: ['on', 'off', 'up', 'down', 'out', 'away', 'back', 'together', 'forward'],
  get: [
    'up',
    'out',
    'over',
    'along',
    'away',
    'back',
    'by',
    'in',
    'into',
    'off',
    'on',
    'through',
    'together',
  ],
  come: [
    'up',
    'back',
    'out',
    'in',
    'across',
    'along',
    'around',
    'down',
    'off',
    'on',
    'over',
    'through',
  ],
  go: ['on', 'out', 'up', 'down', 'through', 'over', 'off', 'back', 'ahead', 'along', 'around'],
  make: ['up', 'out', 'off', 'over'],
  set: ['up', 'off', 'out', 'back', 'down', 'aside'],
  break: ['down', 'up', 'out', 'in', 'through', 'off', 'away', 'into'],
  bring: ['up', 'out', 'back', 'down', 'in', 'about', 'together', 'forward'],
  carry: ['on', 'out', 'over', 'off', 'through', 'away'],
  cut: ['off', 'down', 'out', 'back', 'in', 'up', 'through'],
  figure: ['out'],
  fill: ['in', 'out', 'up'],
  find: ['out'],
  hold: ['on', 'up', 'back', 'out', 'off', 'down'],
  keep: ['up', 'on', 'out', 'off', 'away', 'back', 'down'],
  pass: ['on', 'out', 'up', 'by', 'away', 'down', 'over', 'through'],
  point: ['out'],
  pull: ['up', 'out', 'off', 'over', 'down', 'back', 'together', 'apart', 'through', 'in'],
  run: ['out', 'into', 'over', 'off', 'up', 'down', 'through', 'away'],
  show: ['up', 'off', 'around'],
  shut: ['down', 'up', 'off', 'out', 'in'],
  sort: ['out'],
  stand: ['up', 'out', 'by', 'for', 'down', 'back'],
  think: ['over', 'about', 'through', 'up', 'back'],
  throw: ['away', 'out', 'up', 'off', 'in'],
  try: ['on', 'out'],
  work: ['out', 'on', 'up', 'off', 'through', 'over'],
  blow: ['up', 'out', 'off', 'over', 'away'],
  call: ['off', 'up', 'on', 'out', 'back', 'in', 'for'],
  check: ['in', 'out', 'up', 'on', 'off', 'over'],
  clean: ['up', 'out', 'off'],
  close: ['down', 'off', 'up', 'in', 'out'],
  count: ['on', 'in', 'out', 'down', 'up'],
  drop: ['off', 'out', 'in', 'by', 'behind'],
  end: ['up'],
  fall: ['down', 'off', 'out', 'behind', 'apart', 'through', 'back', 'in', 'over', 'for'],
  hang: ['up', 'out', 'on', 'around', 'over', 'back'],
  kick: ['off', 'out', 'in', 'back', 'around'],
  lay: ['off', 'out', 'down'],
  leave: ['out', 'behind', 'off'],
  let: ['down', 'in', 'out', 'off', 'up'],
  line: ['up'],
  live: ['up', 'on', 'with', 'through'],
  move: ['on', 'in', 'out', 'up', 'over', 'along', 'away'],
  pay: ['off', 'back', 'up', 'out'],
  play: ['down', 'up', 'around', 'along', 'out'],
  push: ['back', 'on', 'through', 'ahead', 'around'],
  rule: ['out'],
  send: ['back', 'off', 'out', 'over'],
  sign: ['up', 'in', 'out', 'off', 'on', 'over'],
  slow: ['down', 'up'],
  speed: ['up'],
  split: ['up'],
  step: ['up', 'down', 'in', 'out', 'back'],
  stick: ['up', 'out', 'around', 'with', 'to'],
  switch: ['on', 'off', 'over'],
  tear: ['down', 'up', 'apart', 'off', 'out'],
  warm: ['up'],
  wash: ['up', 'out', 'away', 'off'],
  wear: ['out', 'off', 'down'],
  wind: ['up', 'down'],
  wrap: ['up'],
  write: ['down', 'off', 'up', 'out'],
};

// Pre-build a Set lookup for faster particle checks
const PHRASAL_SETS: Record<string, Set<string>> = {};
for (const [verb, particles] of Object.entries(PHRASAL_VERBS)) {
  PHRASAL_SETS[verb] = new Set(particles);
}

const PRONOUN_OBJECTS = new Set([
  'it',
  'them',
  'him',
  'her',
  'us',
  'me',
  'this',
  'that',
  'something',
  'everything',
  'nothing',
  'anything',
]);

function stemVerb(word: string): string {
  if (word.length <= 3) return word;
  // Handle doubled consonant + ing (e.g., "running" -> "run")
  if (word.endsWith('ning') && word.length > 6 && word[word.length - 5] === word[word.length - 4]) {
    return word.slice(0, -4);
  }
  if (word.endsWith('ting') && word.length > 6 && word[word.length - 5] === word[word.length - 4]) {
    return word.slice(0, -4);
  }
  if (word.endsWith('king') && word.length > 6 && word[word.length - 5] === word[word.length - 4]) {
    return word.slice(0, -4);
  }
  if (word.endsWith('ying')) return word.slice(0, -4) + 'y';
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ied') && word.length > 5) return word.slice(0, -3) + 'y';
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

// Irregular verb forms -> base form
const IRREGULAR: Record<string, string> = {
  took: 'take',
  taken: 'take',
  taking: 'take',
  gave: 'give',
  given: 'give',
  giving: 'give',
  went: 'go',
  going: 'go',
  gone: 'go',
  came: 'come',
  coming: 'come',
  got: 'get',
  gotten: 'get',
  getting: 'get',
  made: 'make',
  making: 'make',
  broke: 'break',
  broken: 'break',
  breaking: 'break',
  brought: 'bring',
  bringing: 'bring',
  found: 'find',
  finding: 'find',
  held: 'hold',
  holding: 'hold',
  kept: 'keep',
  keeping: 'keep',
  left: 'leave',
  leaving: 'leave',
  ran: 'run',
  running: 'run',
  threw: 'throw',
  thrown: 'throw',
  throwing: 'throw',
  wore: 'wear',
  worn: 'wear',
  wearing: 'wear',
  wrote: 'write',
  written: 'write',
  writing: 'write',
  blew: 'blow',
  blown: 'blow',
  blowing: 'blow',
  fell: 'fall',
  fallen: 'fall',
  falling: 'fall',
  hung: 'hang',
  hanging: 'hang',
  wound: 'wind',
  winding: 'wind',
  tore: 'tear',
  torn: 'tear',
  tearing: 'tear',
  shut: 'shut',
  shutting: 'shut',
  split: 'split',
  splitting: 'split',
  stuck: 'stick',
  sticking: 'stick',
  stood: 'stand',
  standing: 'stand',
  paid: 'pay',
  paying: 'pay',
  laid: 'lay',
  laying: 'lay',
  pulled: 'pull',
  pulling: 'pull',
  pushed: 'push',
  pushing: 'push',
  showed: 'show',
  shown: 'show',
  showing: 'show',
  sent: 'send',
  sending: 'send',
  signed: 'sign',
  signing: 'sign',
  passed: 'pass',
  passing: 'pass',
  pointed: 'point',
  pointing: 'point',
};

function getBaseVerb(word: string): string {
  if (IRREGULAR[word]) return IRREGULAR[word];
  const stemmed = stemVerb(word);
  if (PHRASAL_SETS[stemmed]) return stemmed;
  if (PHRASAL_SETS[word]) return word;
  return stemmed;
}

export interface CollocationMatch {
  startIdx: number;
  endIdx: number; // inclusive
  phrase: string;
}

export function detectCollocations(wordTexts: string[]): CollocationMatch[] {
  const matches: CollocationMatch[] = [];
  const cleaned = wordTexts.map((w) => w.toLowerCase().replace(/[^a-z']/g, ''));
  const used = new Set<number>();

  for (let i = 0; i < cleaned.length - 1; i++) {
    if (used.has(i)) continue;

    const base = getBaseVerb(cleaned[i]);
    const particles = PHRASAL_SETS[base];
    if (!particles) continue;

    // Pattern 1: verb + particle (adjacent)
    if (particles.has(cleaned[i + 1])) {
      matches.push({
        startIdx: i,
        endIdx: i + 1,
        phrase: `${wordTexts[i]} ${wordTexts[i + 1]}`,
      });
      used.add(i);
      used.add(i + 1);
      continue;
    }

    // Pattern 2: verb + pronoun/object + particle (e.g., "pick it up")
    if (
      i + 2 < cleaned.length &&
      PRONOUN_OBJECTS.has(cleaned[i + 1]) &&
      particles.has(cleaned[i + 2])
    ) {
      matches.push({
        startIdx: i,
        endIdx: i + 2,
        phrase: `${wordTexts[i]} ${wordTexts[i + 1]} ${wordTexts[i + 2]}`,
      });
      used.add(i);
      used.add(i + 1);
      used.add(i + 2);
      continue;
    }
  }

  return matches;
}

// Build a Set of word indices that belong to any collocation for quick lookup
export function buildCollocationSet(matches: CollocationMatch[]): Set<number> {
  const set = new Set<number>();
  for (const m of matches) {
    for (let i = m.startIdx; i <= m.endIdx; i++) {
      set.add(i);
    }
  }
  return set;
}

// Get the collocation match that contains a given word index
export function getCollocationAt(
  idx: number,
  matches: CollocationMatch[],
): CollocationMatch | undefined {
  return matches.find((m) => idx >= m.startIdx && idx <= m.endIdx);
}
