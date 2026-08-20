# Daily Quote Settings

## Overview

The Daily Quote feature displays philosophical quotes on the home screen. The dataset has been expanded from 113 to 454 verified quotes with full source citations, and two new settings have been added for greater control.

## Settings

### AI Personalization

**Setting:** `dailyQuotePersonalizationEnabled`  
**Default:** `true` (ON)  
**Location:** Settings → AI → "AI Personalization"

When enabled, the feature uses AI to read your journal notes and generate personalized descriptions that connect quotes to your reflections. The AI is only active when:
- Main AI toggle is ON
- Daily Quote is enabled
- AI Personalization is ON
- A model is selected
- Journal entries exist

When disabled, quotes display with a neutral fallback description: "A quote from our curated collection."

### Show Sources

**Setting:** `dailyQuoteSourceVisible`  
**Default:** `true` (ON)  
**Location:** Settings → AI → "Show Sources"

When enabled, the Daily Quote card displays the original book or work the quote was taken from, shown next to the author name. For example:

> "Waste no more time arguing what a good man should be. Be one."  
> — Marcus Aurelius, Meditations, Book X

When disabled, only the author name is shown:

> "Waste no more time arguing what a good man should be. Be one."  
> — Marcus Aurelius

## Dataset

### Expansion

The dataset was expanded from 113 to 454 quotes across five expansion batches:

- **expansion-A (80 quotes):** Classical/Stoic/Eastern
- **expansion-B (76 quotes):** Essayists (Montaigne, Bacon, La Rochefoucauld, Vauvenargues, Emerson, Thoreau, Chesterton)
- **expansion-C (77 quotes):** Continental/Existentialist (Nietzsche, Schopenhauer, Camus, Sartre, Kierkegaard, de Beauvoir, Arendt, Weil, Goethe)
- **expansion-D (39 quotes):** Scientists (Darwin, Curie, Feynman, Einstein, Bohr, Galileo, Mendel, Newton, Schrödinger, Turing, Planck, Heisenberg, Franklin)
- **expansion-E (101 quotes):** Writers/Novelists (Austen, Dostoevsky, Wilde, Woolf, Dickinson, Kafka, Hugo, Melville, Conrad, Chekhov, Frost, Kipling, Proust, Borges, Orwell)

### Content Policy

All 454 quotes comply with the AGENTS.md Quote Content Policy:

1. **Accurately attributed:** Every quote verified against the author's known works
2. **Verifiable sources:** Each quote includes a `source` field naming the specific book, essay, letter, or work
3. **Secular content:** No religious or sectarian content. 14 entries use religious vocabulary metaphorically and were retained with documented deliberation
4. **Curated pool:** Philosophers, essayists, scientists, and writers (classical and modern)

### Verification

The dataset was rigorously audited:
- **43 quotes removed:** Unverifiable attribution, misattribution, or without canonical sources
- **7 quotes corrected:** Misattributed quotes corrected with proper attribution
- **454 final quotes:** 100% source coverage, zero invalid entries

See issue #933 for the full audit report.

## Implementation Details

### Type System

```typescript
interface DailyQuote {
  quoteId: string;
  text: string;
  author: string;
  tags: string[];
  source: string;  // NEW: book/work citation
  description: string;
  generatedAt: number;
}

interface AISettings {
  // ... existing fields
  dailyQuotePersonalizationEnabled: boolean;  // NEW
  dailyQuoteSourceVisible: boolean;  // NEW
}
```

### Service Logic

The `DailyQuoteService.getDailyQuote()` method follows this order:

1. Check if Daily Quote is enabled → return `null` if disabled
2. Read cache (if `dailyQuotePersonalizationEnabled` is ON)
3. Check `dailyQuotePersonalizationEnabled` → use neutral fallback if OFF
4. Check global `aiPersonalizationEnabled` → use fallback if OFF
5. Check for selected model → use fallback if no model
6. Check for journal entries → use fallback if no journals
7. Generate AI quote with personalization
8. Cache and return result

### i18n

New i18n keys added to all 6 locales (en, es, fr, de, ja, ko):

- `settings.dailyQuoteSource.label` / `settings.dailyQuoteSource.description`
- `settings.dailyQuotePersonalization.label` / `settings.dailyQuotePersonalization.description`
- `hints.settings.dailyQuotePersonalization`
- `hints.settings.dailyQuoteShowSources`

## Related

- [Quote Content Policy & Regression Gate](./quote-content-policy.md) - the CI test that enforces the dataset policy
- [Issue #933](https://github.com/gedwolmen/gitnotes/issues/933) - Audit + expand quote dataset
- [Issue #934](https://github.com/gedwolmen/gitnotes/issues/934) - Add personalization/source settings
- [PR #949](https://github.com/gedwolmen/gitnotes/pull/949) - Implementation
