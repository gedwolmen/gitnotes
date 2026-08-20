# Quote Content Policy & Regression Gate

## Overview

The Daily Quote dataset (`src/data/philosopher_quotes.json`) is governed by the
**Quote Content Policy** in `AGENTS.md`. To make sure the dataset can never quietly drift
out of compliance, the policy is enforced by an executable regression gate:
`__tests__/data/philosopherQuotes.policy.test.ts`. It runs in CI on every change, so any
policy violation fails the build loudly instead of shipping silently.

## What the policy requires

Every quote in the dataset MUST:

1. **Be accurately attributed** to the correct author with the correct wording.
2. **Carry a non-empty `source`** field naming the book / essay / letter / work the quote
   was told or written in (e.g. `"source": "Meditations, 10.16"`). Quotes with an
   unidentifiable origin must be removed.
3. **Be free of religious / sectarian content** — no references to deities, scripture,
   prayer, afterlife dogma, or sectarian doctrine. The dataset stays secular. A quote by a
   religious-figure author (Buddha, Rumi, Lao Tzu, etc.) is allowed ONLY if the quote text
   itself is secular, and each such retention is a conscious, documented decision.
4. **Come from the curated pool**: philosophers, essayists, scientists, and writers
   (classical + modern). Target size ≈ 500 quotes; the gate enforces a floor of 450.

## What the test enforces

`philosopherQuotes.policy.test.ts` is a pure data test — no async, no network, no AI, no
React Native runtime. It asserts:

| Check | Assertion |
|-------|-----------|
| Dataset size | `quotes.length >= 450` |
| Schema | every quote has non-empty string `id`, `text`, `author`, a string-array `tags`, and a non-empty string `source` |
| Unique ids | no two quotes share an `id` |
| Unique text | no two quotes repeat the same (author, lowercased-trimmed-text) pair |
| Tag vocabulary | every tag is in the frozen curated vocabulary |
| Keyword scan | `text + author` is scanned case-insensitively for religious keywords; any match must be on the documented allowlist |
| Allowlist hygiene | every allowlisted id exists in the dataset and still triggers a keyword hit (stale entries fail loudly) |

### Keyword scan

Scanned case-insensitively with word boundaries, so a keyword embedded inside a longer word
is NOT flagged (e.g. `single`/`since` must not trip `sin`):

```
god, jesus, christ, allah, bible, quran, lord, pray, holy, divine,
sin, faith, soul, heaven, religio, spirit
```

`religio` is treated as a stem (leading word boundary only) so it catches
`religion`/`religious`/`religiosity`; a strict trailing boundary would only ever match the
standalone token `religio` and defeat the purpose.

### Allowlist

A flagged keyword is permitted only if the quote id is on the `KEYWORD_ALLOWLIST`, a set of
consciously-retained secular usages. Each entry documents why the usage is secular. As of
this writing the allowlist is:

- `confucius-11` — "divine" used as a verb (to discern/foretell), not the deity.
- `cicero-1` — "soul" metaphorical for the animating essence of a room/books.
- `curie-5` — "spirit" = intellectual vigor / the ethos of science.
- `epictetus-9` — "heaven" only in the secular exclamation "for heaven's sake".
- `pascal-2` — discusses religious conviction as a cause of evil; a cautionary, secular
  critique, not an endorsement of doctrine.
- `aurelius-18` — "soul" metaphorical for mind/moral character (Stoic).
- `dickinson-poem-1` — "soul" metaphorical in a secular poem about hope.

Keep this list minimal and in sync with the data. If a quote is edited so it no longer
matches a keyword, remove it from the allowlist — the staleness assertion will flag it.

### Tag vocabulary

Tags are restricted to the frozen curated vocabulary (action, courage, creativity,
discipline, focus, freedom, gratitude, growth, humility, learning, mindfulness, patience,
peace, perseverance, purpose, reflection, resilience, self, simplicity, strategy, wisdom).
New quotes must reuse one of these tags. If a genuinely new theme is needed, consciously
extend `ALLOWED_TAGS` in the test — that is the single place the decision is recorded.

## Adding or editing a quote

1. Add/edit the quote in `src/data/philosopher_quotes.json` with a correct `source`.
2. Run `yarn jest __tests__/data/philosopherQuotes.policy.test.ts`.
3. If the gate fails, FIX THE DATA (correct attribution/source, use a valid tag, or add the
   id to the allowlist with a documented secular rationale). Do NOT weaken or delete the
   assertions — they are the policy.

## Current dataset state

- **454 unique quotes**, 100% source coverage.
- The earlier 481-entry expansion contained 27 exact duplicates; the policy gate's
  (author, normalized-text) uniqueness check surfaced them and the redundant copies were
  removed so every surviving quote carries a verified source.

## Related

- [Daily Quote Settings](./daily-quote-settings.md) — personalization and source-visibility settings
- `AGENTS.md` — Quote Content Policy (source of truth)
