# AI Integration

> Vercel AI SDK, providers, token budgeting.

## Overview

GitNotēs uses **Vercel AI SDK v6** for AI chat, text generation, and daily philosopher quotes. Supports OpenAI-compatible providers and Anthropic.

## Architecture

```
AIService
  ├─ Provider Selection (AIProviderType)
  ├─ Token Budget Check (modelLimits.ts)
  ├─ Stream Text / Generate Text
  └─ Error Handling
```

## Providers

See [AI Providers](./ai-providers.md) for detailed provider documentation.

### Provider Types

```typescript
type AIProviderType = 
  | 'openai-compatible'  // OpenAI, OpenRouter, Ollama, etc.
  | 'anthropic';         // Claude models
```

### Provider Configuration

```typescript
interface AIProviderConfig {
  id: string;
  type: AIProviderType;
  baseURL: string;
  apiKey: string;
  isEnabled: boolean;
}

// aiStore.ts
const aiStore = useAIStore.getState();
const providers = aiStore.providers.filter(p => p.isEnabled);
```

## Core Functions

### Chat (Streaming)

```typescript
import { streamText } from 'ai';

async function chat(messages: Message[], provider: AIProviderConfig) {
  const model = createModel(provider);
  
  const result = await streamText({
    model,
    messages,
    maxTokens: 1024,
    temperature: 0.7,
  });
  
  for await (const chunk of result.textStream) {
    // Handle streaming response
    onChunk(chunk);
  }
}
```

### Text Generation (Non-streaming)

```typescript
import { generateText } from 'ai';

async function generate(prompt: string, provider: AIProviderConfig) {
  const model = createModel(provider);
  
  const result = await generateText({
    model,
    prompt,
    maxTokens: 256,
  });
  
  return result.text;
}
```

### Model Creation

```typescript
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';

function createModel(provider: AIProviderConfig) {
  if (provider.type === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL || ANTHROPIC_API_BASE_URL,
    });
    return anthropic('claude-sonnet-4-20250514');
  }
  
  const openai = createOpenAICompatible({
    name: provider.id,
    baseURL: provider.baseURL,
    apiKey: provider.apiKey,
  });
  return openai('gpt-4o-mini');
}
```

## Token Budgeting

### Model Limits

```typescript
// src/services/ai/modelLimits.ts

export const MODEL_LIMITS: Record<string, number> = {
  'gpt-4o-mini': 128000,
  'gpt-4o': 128000,
  'gpt-3.5-turbo': 16385,
  'claude-sonnet-4-20250514': 200000,
  'claude-haiku-3-5-20241022': 200000,
};

export function getTokenLimit(modelId: string): number {
  return MODEL_LIMITS[modelId] ?? 4096; // Default
}
```

### Budget Check

```typescript
function checkBudget(messages: Message[], modelId: string): boolean {
  const tokenCount = estimateTokens(messages);
  const limit = getTokenLimit(modelId);
  const reserved = 1024; // Reserve for response
  
  if (tokenCount > limit - reserved) {
    alert('Message too long for model context');
    return false;
  }
  
  return true;
}

function estimateTokens(messages: Message[]): number {
  // ~4 chars per token (rough estimate)
  const charCount = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  return Math.ceil(charCount / 4);
}
```

## Daily Philosopher Quotes

See [Daily Quote Service](./services.md#dailyservice) for implementation details.

### Flow

```typescript
// DailyQuoteService.ts

export class DailyQuoteService {
  async fetchQuote(): Promise<DailyQuote | null> {
    const aiStore = useAIStore.getState();
    
    // Check personalization toggle
    if (!aiStore.aiPersonalizationEnabled) {
      return this.getGenericQuote();
    }
    
    // Check cache (24 hours)
    const cached = await this.getCachedQuote();
    if (cached && !this.isExpired(cached)) {
      return cached;
    }
    
    // Get journals for context
    const journals = await journalService.list();
    if (journals.length === 0) {
      return this.getGenericQuote();
    }
    
    // Generate with AI
    const quote = await this.generateWithAI(journals);
    await this.cacheQuote(quote);
    return quote;
  }

  private async generateWithAI(journals: Journal[]) {
    const recentJournals = journals.slice(0, 3);
    const context = recentJournals.map(j => j.content).join('\n\n');
    
    const prompt = `
      You are a wise philosopher. Based on these journal entries,
      select a relevant quote and write a brief description.
      
      Journals:
      ${context}
      
      Respond with JSON: { "quoteId": "...", "description": "..." }
    `;
    
    const response = await generateText(prompt, provider);
    return JSON.parse(response);
  }

  private getGenericQuote(): DailyQuote {
    const random = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    return {
      quoteId: random.id,
      quote: random.text,
      author: random.author,
      description: 'A timeless reflection from philosophy — personalization is off.',
      generatedAt: Date.now(),
    };
  }
}
```

### Privacy Toggle

```typescript
// aiStore.ts
interface AIState {
  aiPersonalizationEnabled: boolean;
  toggleAiPersonalization: () => Promise<void>;
}

// DailyQuoteService respects toggle
if (!aiStore.aiPersonalizationEnabled) {
  return this.getGenericQuote(); // No journal access
}
```

## Error Handling

### Network Errors

```typescript
try {
  const result = await streamText({ model, messages });
} catch (error) {
  if (error.message.includes('Network')) {
    alert('No internet connection');
  } else if (error.message.includes('429')) {
    alert('Rate limit exceeded. Try again later.');
  } else if (error.message.includes('401')) {
    alert('Invalid API key. Check settings.');
  }
}
```

### Token Limit Errors

```typescript
try {
  const result = await generateText({ model, prompt, maxTokens: 100000 });
} catch (error) {
  if (error.message.includes('maximum context length')) {
    alert('Message too long. Try a shorter prompt.');
  }
}
```

### Fallback Strategy

```typescript
async function safeChat(messages: Message[], provider: AIProviderConfig) {
  try {
    return await chat(messages, provider);
  } catch (error) {
    console.error('AI chat failed:', error);
    
    // Try fallback provider
    const fallback = getFallbackProvider();
    if (fallback && fallback.id !== provider.id) {
      return await chat(messages, fallback);
    }
    
    throw error;
  }
}
```

## Chat Empty State UI

The empty (new chat) screen in `ChatScreen.tsx` shows a start-conversation title, a body description, and a horizontally scrolling hint chip row (`ChatHintChips`).

Layout rules:

- **Title & description** (`ChatScreen.tsx`, `ListEmptyComponent`) use `marginHorizontal: spacing[4]` so text never touches the screen edges.
- **Hint chip row** (`ChatHintChips.tsx`) uses `paddingHorizontal: spacing[2]` on the `ScrollView` `contentContainerStyle`. On load the first chip is inset from the left edge; the row remains scrollable so the user can swipe chips to the screen edges.

Tests: `__tests__/ChatHintChips.test.tsx` asserts the scroller carries symmetric side padding while the outer container stays padding-free.

## Testing

```typescript
jest.mock('ai', () => ({
  streamText: jest.fn(() => ({
    textStream: (async function* () {
      yield 'Hello';
      yield ' world';
    })(),
  })),
  generateText: jest.fn(() =>
    Promise.resolve({
      text: JSON.stringify({ quoteId: 'test', description: 'test' }),
    })
  ),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => jest.fn(() => ({
    modelId: 'claude-sonnet-4-20250514',
  }))),
}));
```
