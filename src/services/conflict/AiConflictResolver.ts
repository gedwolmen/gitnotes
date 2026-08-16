import { generateText } from 'ai';
import type { AIModelConfig, AIProviderConfig } from '../../models/AIProvider';
import { initializeModel } from '../AIService';
import type { FileConflict } from './types';

export interface AiMergeProposal {
  mergedContent: string | null;
  confidence: 'high' | 'low';
  note?: string;
}

const CONTENT_CAP = 6000;

function truncateForPrompt(content: string): string {
  if (content.length <= CONTENT_CAP) {
    return content;
  }
  return `${content.slice(0, CONTENT_CAP)}\n…(content truncated)`;
}

function buildSystemPrompt(format: 'text' | 'json'): string {
  const formatInstruction =
    format === 'json'
      ? 'The file is JSON. Produce the merged JSON document, preserving every key and value that exists in either side; output must be valid JSON.'
      : 'The file is plain text (typically Markdown). Produce the merged file content, preserving everything meaningful from both sides.';
  return [
    'You are a precise 3-way merge assistant. You are given the base version and the local and remote versions of a conflicting file.',
    formatInstruction,
    'Output ONLY the merged file content. Do not include commentary, explanations, code fences, or merge markers.',
  ].join('\n');
}

function buildPrompt(fileConflict: FileConflict): string {
  const sections = [
    '<<<<<<< LOCAL',
    truncateForPrompt(fileConflict.localContent as string),
    '=======',
    truncateForPrompt(fileConflict.remoteContent as string),
    '>>>>>>> REMOTE',
    '',
    'BASE CONTENT:',
    truncateForPrompt(fileConflict.baseContent as string),
  ];
  return sections.join('\n');
}

/**
 * Proposes a merged file via the configured AI model using the 3-way inputs.
 * Pure propose service — never writes files and never throws.
 */
export async function proposeMerge(
  fileConflict: FileConflict,
  modelConfig?: AIModelConfig,
  providerConfig?: AIProviderConfig
): Promise<AiMergeProposal> {
  if (
    fileConflict.format === 'binary' ||
    fileConflict.baseContent === null ||
    fileConflict.localContent === null ||
    fileConflict.remoteContent === null
  ) {
    return {
      mergedContent: null,
      confidence: 'low',
      note: 'Not enough context for AI merge (binary or missing 3-way content)',
    };
  }

  if (!modelConfig) {
    return { mergedContent: null, confidence: 'low', note: 'No AI model configured' };
  }

  try {
    const model = await initializeModel(modelConfig, providerConfig);
    const { text } = await generateText({
      model,
      system: buildSystemPrompt(fileConflict.format),
      prompt: buildPrompt(fileConflict),
    });

    const mergedContent = text.trim();
    if (
      mergedContent.length === 0 ||
      mergedContent === fileConflict.localContent ||
      mergedContent === fileConflict.remoteContent
    ) {
      return { mergedContent: null, confidence: 'low', note: 'AI returned no usable merge' };
    }

    return { mergedContent, confidence: 'high' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown AI merge error';
    return { mergedContent: null, confidence: 'low', note: message };
  }
}
