/**
 * Regression gate for the Daily Quote dataset (`src/data/philosopher_quotes.json`).
 *
 * This test encodes the AGENTS.md "Quote Content Policy" as executable assertions so the
 * dataset can never quietly drift out of compliance. It is intentionally strict: if it
 * fails, FIX THE DATA (add valid quotes / widen the documented allowlist) — do not weaken
 * or delete these assertions.
 *
 * Enforced policy:
 *   - Every quote has a non-empty string `id`, `text`, `author`, a string-array `tags`,
 *     and a non-empty string `source` naming the work the quote was told/written in.
 *   - `id` values are unique.
 *   - No two quotes repeat the same (author, normalized-text) pair.
 *   - Dataset size stays at or above the floor (target ≈ 500, floor 450).
 *   - Quote text + author is scanned for religious/sectarian keywords. Any match must be
 *     on the documented allowlist of consciously-retained secular usages.
 *   - Tags are restricted to the frozen vocabulary of the curated dataset.
 *
 * This is a pure data test: no async, no network, no AI, no React Native runtime.
 */
import quotesJson from '../../src/data/philosopher_quotes.json';

interface QuoteRow {
  id: string;
  text: string;
  author: string;
  tags: string[];
  source: string;
}

const quotes = quotesJson as QuoteRow[];

/**
 * Frozen tag vocabulary of the curated dataset.
 *
 * New quotes must reuse one of these tags. If a genuinely new theme is needed, consciously
 * extend this set (and this is the single place that decision is recorded), rather than
 * letting an ad-hoc tag sneak in through the data file.
 */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'action',
  'courage',
  'creativity',
  'discipline',
  'focus',
  'freedom',
  'gratitude',
  'growth',
  'humility',
  'learning',
  'mindfulness',
  'patience',
  'peace',
  'perseverance',
  'purpose',
  'reflection',
  'resilience',
  'self',
  'simplicity',
  'strategy',
  'wisdom',
]);

/**
 * Religious / sectarian keywords that must not appear unless consciously allowlisted.
 *
 * Scanned case-insensitively against `text + ' ' + author` with word boundaries so that
 * keywords embedded inside longer words are NOT flagged (e.g. "single"/"since" must not
 * trip "sin", "consideration" must not trip "sin", "prayer" is a distinct word from the
 * bare-stem set below).
 */
const RELIGIOUS_KEYWORDS = [
  'god',
  'jesus',
  'christ',
  'allah',
  'bible',
  'quran',
  'lord',
  'pray',
  'holy',
  'divine',
  'sin',
  'faith',
  'soul',
  'heaven',
  'religio',
  'spirit',
] as const;

/**
 * Build the matcher for a keyword.
 *
 * "religio" is a stem: it is meant to catch religion/religious/religiosity. With a strict
 * trailing word boundary ("religio\\b") it would only ever match the standalone token
 * "religio" and would never flag "religious", defeating the purpose. So "religio" uses a
 * leading boundary only (prefix match). Every other keyword uses full "\\bkeyword\\b".
 */
function keywordMatcher(keyword: string): RegExp {
  if (keyword === 'religio') {
    return new RegExp(`\\b${keyword}`, 'i');
  }
  return new RegExp(`\\b${keyword}\\b`, 'i');
}

/**
 * Quote ids whose flagged keyword is a CONSCIOUS, DOCUMENTED secular usage. Each entry is a
 * deliberate retention decision per AGENTS.md ("A quote by a religious-figure author is
 * allowed ONLY if the quote text itself is secular, and each such retention is a conscious,
 * documented decision.").
 *
 * Keep this list minimal and in sync with the dataset — the tests below assert that every
 * allowlisted id exists AND still triggers a keyword hit, so stale entries fail loudly.
 */
const KEYWORD_ALLOWLIST: ReadonlySet<string> = new Set([
  // "divine" used as a VERB meaning to discern/foretell, not the deity. Secular instruction.
  'confucius-11', // "Study the past, if you would divine the future."
  // "soul" used METAPHORICALLY for the animating essence of a room/books, not a religious soul.
  'cicero-1', // "A room without books is like a body without a soul."
  // "spirit" means intellectual vigor / the ethos of science, not a supernatural spirit.
  'curie-5', // "It is the very spirit of science that makes the work ... beautiful ..."
  // "heaven" appears only in the secular exclamation "for heaven's sake", no afterlife dogma.
  'epictetus-9', // "Practice yourself, for heaven's sake, in little things; ..."
  // Discusses religious conviction as a cause of evil — a cautionary, secular critique,
  // NOT an endorsement of religious doctrine.
  'pascal-2', // "Men never do evil so completely and cheerfully as when they do it from religious conviction."
  // "soul" METAPHORICAL for mind/moral character (Stoic), no afterlife or sectarian meaning.
  'aurelius-18', // "The soul becomes dyed with the color of its thoughts."
  // "soul" METAPHORICAL in a secular poem about hope (Dickinson); no deity, scripture, or dogma.
  'dickinson-poem-1', // "Hope is the thing with feathers that perches in the soul."
]);

const MIN_QUOTE_COUNT = 450;

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

describe('philosopher_quotes.json — Quote Content Policy', () => {
  it('has at least the minimum number of quotes', () => {
    expect(quotes.length).toBeGreaterThanOrEqual(MIN_QUOTE_COUNT);
  });

  it('every quote has a non-empty string id, text, and author', () => {
    const offenders = quotes.filter(
      (q) =>
        typeof q.id !== 'string' ||
        q.id.trim() === '' ||
        typeof q.text !== 'string' ||
        q.text.trim() === '' ||
        typeof q.author !== 'string' ||
        q.author.trim() === '',
    );
    expect(offenders.map((q) => q.id)).toEqual([]);
  });

  it('every quote has a string-array tags field with non-empty string entries', () => {
    const offenders = quotes.filter(
      (q) => !Array.isArray(q.tags) || q.tags.some((t) => typeof t !== 'string' || t.trim() === ''),
    );
    expect(offenders.map((q) => q.id)).toEqual([]);
  });

  it('every quote has a non-empty string source field', () => {
    const offenders = quotes.filter((q) => typeof q.source !== 'string' || q.source.trim() === '');
    expect(offenders.map((q) => q.id)).toEqual([]);
  });

  it('quote ids are unique', () => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const q of quotes) {
      if (seen.has(q.id)) {
        duplicates.add(q.id);
      }
      seen.add(q.id);
    }
    expect([...duplicates].sort()).toEqual([]);
  });

  it('no duplicate (author, normalized-text) pairs', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const q of quotes) {
      const key = `${q.author.trim().toLowerCase()}::${normalizeText(q.text)}`;
      if (seen.has(key)) {
        duplicates.push(q.id);
      }
      seen.add(key);
    }
    expect(duplicates.sort()).toEqual([]);
  });

  it('only uses the frozen tag vocabulary', () => {
    const unknownTags = new Map<string, string[]>();
    for (const q of quotes) {
      for (const tag of q.tags) {
        if (!ALLOWED_TAGS.has(tag)) {
          const ids = unknownTags.get(tag) ?? [];
          ids.push(q.id);
          unknownTags.set(tag, ids);
        }
      }
    }
    const report = [...unknownTags.entries()].map(([tag, ids]) => `${tag} -> [${ids.join(', ')}]`);
    expect(report).toEqual([]);
  });

  it('every flagged religious-keyword match is on the documented allowlist', () => {
    const unallowlisted: string[] = [];
    for (const q of quotes) {
      const haystack = `${q.text} ${q.author}`;
      const hits = RELIGIOUS_KEYWORDS.filter((kw) => keywordMatcher(kw).test(haystack));
      if (hits.length > 0 && !KEYWORD_ALLOWLIST.has(q.id)) {
        unallowlisted.push(`${q.id} matched [${hits.join(', ')}]`);
      }
    }
    expect(unallowlisted.sort()).toEqual([]);
  });

  it('every allowlisted id exists in the dataset', () => {
    const ids = new Set(quotes.map((q) => q.id));
    const missing = [...KEYWORD_ALLOWLIST].filter((id) => !ids.has(id));
    expect(missing.sort()).toEqual([]);
  });

  it('every allowlisted id still triggers a keyword hit (allowlist is not stale)', () => {
    const byId = new Map(quotes.map((q) => [q.id, q]));
    const stale = [...KEYWORD_ALLOWLIST].filter((id) => {
      const quote = byId.get(id);
      if (!quote) {
        return false; // absence is covered by the "exists" test above
      }
      const haystack = `${quote.text} ${quote.author}`;
      return !RELIGIOUS_KEYWORDS.some((kw) => keywordMatcher(kw).test(haystack));
    });
    expect(stale.sort()).toEqual([]);
  });
});
