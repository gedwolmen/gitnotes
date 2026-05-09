# Model Selector Search — Design

## Problem

`ModelSelector` modal lists every model from every enabled provider, grouped by provider. With custom OpenAI-compatible providers (e.g. OpenRouter), a single provider can contribute hundreds of models discovered via `/v1/models`. Scrolling becomes the only way to find a model.

## Goal

Add a search bar to `ModelSelector` that filters the list by model name and provider name.

## Non-goals

- Sorting, favorites, recent-models, fuzzy matching.
- Search inside `ProviderConfigModal` (separate concern).
- Pagination or virtualization.

## UI

- Sticky `TextInput` placed below the modal header (`modalHeader`) and above the `ScrollView` (`modalBody`).
- Placeholder: `Search models or providers`.
- Trailing clear button (`×`) when query non-empty; tapping clears the query.
- No autofocus (keyboard should not pop on modal open).
- `autoCorrect={false}`, `autoCapitalize="none"`.
- Always rendered (no count threshold) for predictability.

## Filter logic

Pure function `filterProviders(providers, query) → providers`.

- Trim and lowercase `query`. Empty → return providers unchanged.
- For each provider:
  - If lowercased `provider.name` includes `q` → include the provider with all its models (typing "openrouter" reveals the whole group).
  - Else filter `provider.models` by `model.name.toLowerCase().includes(q)`. Include the provider only if at least one model survives.
- Provider order preserved. Model order preserved.

The unavailable-provider branch (current lines 132–144 — provider rendered with an availability message instead of models) is treated like any other provider: shown only if its name matches the query. Its model list is empty so name-match is the only path.

The platform filter (`supportedPlatforms`) and `isEnabled` filter run before search, unchanged.

## Empty state

When `query` is non-empty and the filtered list is empty, render a centered text inside the scroll area:

> `No models match "<query>"`

## Files

- `src/components/ai/modelSelectorFilter.ts` — new pure function + types.
- `src/components/ai/ModelSelector.tsx` — add `query` state, `TextInput`, call filter, render empty state.
- `__tests__/modelSelectorFilter.test.ts` — unit tests for the filter.

## Tests

Unit tests for `filterProviders`:

1. Empty query → returns input unchanged (same reference or deep equal).
2. Case-insensitive model-name match (`"GPT"` matches `"gpt-4o"`).
3. Provider-name match returns provider with all its models.
4. Partial model-name match within a provider returns only matching models.
5. No match → empty array.
6. Whitespace-only query treated as empty.
7. Provider with empty `models` array included only on provider-name match.

## TestIDs

- `model-selector.input.search` — the `TextInput`.
- `model-selector.button.clear-search` — the clear button.
- `model-selector.text.empty` — empty-state text.

## Out of scope / risks

- Performance: filtering a few hundred items per keystroke is fine in JS without debounce. If a provider ever exceeds ~5k models, revisit.
- Persistence: query is not persisted across modal opens.
