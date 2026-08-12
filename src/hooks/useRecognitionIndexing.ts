/**
 * useRecognitionIndexing — React hook that wires RecognizedTextService
 * to the AIMemoryIndexService for chat recall.
 *
 * Provides:
 * - saveRecognition(canvasId, observedText) → saves + indexes
 * - listRecognitions(canvasId) → loads all for a canvas
 * - deleteRecognition(id, canvasId) → removes file + index
 *
 * Pattern reference: useThoughtDumpIndexing.ts (service wrapper with
 * React state for loading/error).
 */

import { useState, useCallback, useMemo } from 'react';
import { aiMemoryIndex } from '../services/ai/AIMemoryIndexService';
import {
  RecognizedTextService,
  type RecognitionRecord,
} from '../services/canvas/RecognizedTextService';

export interface UseRecognitionIndexingResult {
  saveRecognition: (canvasId: string, observedText: string) => Promise<RecognitionRecord>;
  listRecognitions: (canvasId: string) => Promise<RecognitionRecord[]>;
  deleteRecognition: (id: string, canvasId: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useRecognitionIndexing(): UseRecognitionIndexingResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = useMemo(
    () =>
      new RecognizedTextService({
        fileStorage: null as any, // TODO: wire actual FileStorageService
        indexingService: {
          upsert: (filePath: string, text: string) => aiMemoryIndex.upsert(filePath, text),
          remove: (filePath: string) => aiMemoryIndex.remove(filePath),
        },
        repoPath: '',
        branch: 'main',
      }),
    [],
  );

  const saveRecognition = useCallback(
    async (canvasId: string, observedText: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const record = await service.saveRecognition(canvasId, observedText);
        return record;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [service],
  );

  const listRecognitions = useCallback(
    async (canvasId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const records = await service.listRecognitions(canvasId);
        return records;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [service],
  );

  const deleteRecognition = useCallback(
    async (id: string, canvasId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        await service.deleteRecognition(id, canvasId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [service],
  );

  return {
    saveRecognition,
    listRecognitions,
    deleteRecognition,
    isLoading,
    error,
  };
}
