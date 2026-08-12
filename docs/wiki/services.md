# Services

> Service layer design and responsibilities.

## Overview

Services encapsulate business logic. They're React-independent, testable with Jest mocks, and called from hooks/components.

## Service Categories

### Data Services

| Service | Responsibility | Persistence |
|---------|---------------|-------------|
| `NoteService.ts` | CRUD operations on notes | AsyncStorage |
| `JournalService.ts` | Journal entry management | AsyncStorage |
| `TodoService.ts` | Todo item management | AsyncStorage |
| `TemplateService.ts` | Note template handling | AsyncStorage |
| `StorageService.ts` | Low-level storage abstraction | AsyncStorage |

### AI Services

| Service | Responsibility | Key Dependencies |
|---------|---------------|------------------|
| `AIService.ts` | Vercel AI SDK integration | `ai` SDK, `@ai-sdk/anthropic` |
| `DailyQuoteService.ts` | Philosopher quote generation | `AIService`, AsyncStorage |
| `AIMemoryService.ts` | AI context memory (thought dumps) | AsyncStorage |
| `modelLimits.ts` | Token budget per provider | Provider metadata |
| `anthropicDefaults.ts` | Anthropic constants | `@ai-sdk/anthropic` |

### Git Services

| Service | Responsibility | Key Dependencies |
|---------|---------------|------------------|
| `GitService.ts` | Clone, commit, push, pull | `isomorphic-git` |
| `NoteGitHubSyncService.ts` | Note sync to GitHub API | Axios, Git |
| `RepoPullService.ts` | Pull repo from remote | `isomorphic-git` |
| `SyncEngineService.ts` | Sync queue management | AsyncStorage |
| `ConflictResolverService.ts` | 3-way merge | `isomorphic-git` |

### Utility Services

| Service | Responsibility | Dependencies |
|---------|---------------|--------------|
| `NetworkService.ts` | Online/offline detection | `NetInfo` |
| `SecureStorageService.ts` | Encrypted storage | `expo-secure-store` |
| `ExportService.ts` | Export notes (MD, PDF) | `expo-sharing` |
| `ImportService.ts` | Import from files | `expo-document-picker` |

## Service Patterns

### Singleton Pattern

Most services are singletons:

```typescript
class DailyQuoteService {
  async fetchQuote(): Promise<DailyQuote | null> {
    // ...
  }
}

export const dailyQuoteService = new DailyQuoteService();
```

### Error Handling

Services catch errors and return `null` or throw typed errors:

```typescript
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  console.error('DailyQuoteService error:', error);
  return null;
}
```

### Dependency Injection

Services use `useStore.getState()` for store access (avoids React dependency):

```typescript
class DailyQuoteService {
  async fetchQuote() {
    const aiStore = useAIStore.getState();
    // ...
  }
}
```

## Service Testing

```typescript
// __tests__/services/DailyQuoteService.test.ts

jest.mock('ai', () => ({
  streamText: jest.fn(() => ({
    textStream: (async function* () { yield 'response'; })(),
  })),
}));

jest.mock('../src/stores/aiStore', () => ({
  useAIStore: jest.fn(() => ({
    getState: jest.fn(() => ({
      aiPersonalizationEnabled: true,
    })),
  })),
}));

describe('DailyQuoteService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-13T12:00:00Z'));
    jest.clearAllMocks();
  });

  it('returns cached quote', async () => {
    // ...
  });
});
```
