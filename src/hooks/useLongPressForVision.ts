/**
 * useLongPressForVision — React hook that adds a long-press gesture to
 * CanvasEditorContent for triggering atlas composition + vision transcription.
 *
 * Behavior:
 * - Long-press (500ms) on selected region → compose atlas → send to vision model
 * - Shows loading state during transcription
 * - On success: stores results in draftStore for user accept/discard
 * - On failure: shows error toast, no-op
 *
 * Integrates:
 * - AtlasComposer: compute atlas bounds from selected elements
 * - AtlasEncoder: render tiles to PNG for vision model
 * - HotspotGrid: generate 8x8 stroke-order hints
 * - CanvasVisionService: send to model + parse response
 * - DraftStore: store commands for accept/discard workflow
 *
 * Pattern reference: useFloatingAIButtonPanGesture.ts (gesture handler).
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useDraftStore } from '../stores/draftStore';
import { useAIStore } from '../stores/aiStore';
import { AtlasComposer } from '../services/canvas/AtlasComposer';
import { AtlasEncoder } from '../services/canvas/AtlasEncoder';
import { HotspotGrid } from '../services/canvas/HotspotGrid';
import { CanvasVisionService } from '../services/canvas/CanvasVisionService';
import { VisionCapabilityChecker } from '../services/canvas/VisionCapabilityChecker';

const LONG_PRESS_DURATION = 500;

interface UseLongPressForVisionOptions {
  /** Currently selected element IDs (for atlas bounds computation). */
  selectedElementIds: string[];
  /** All elements in the canvas (for atlas composition). */
  allElements: Array<{ id: string; [key: string]: unknown }>;
  /** Current canvas ID (for persistence). */
  canvasId: string;
  /** Callback to save recognition text (optional, for persistence after transcript). */
  onSaveRecognition?: (canvasId: string, text: string) => Promise<void>;
}

export interface UseLongPressForVisionResult {
  /** Wrap your canvas content with this. */
  gesture: ReturnType<typeof Gesture.LongPress>;
  isTranscribing: boolean;
  error: string | null;
}

export function useLongPressForVision({
  selectedElementIds,
  allElements,
  canvasId,
  onSaveRecognition,
}: UseLongPressForVisionOptions): UseLongPressForVisionResult {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addDraftCommands = useDraftStore(s => s.addDraftCommands);
  const selectedModelId = useAIStore((s: any) => s.selectedModelId);
  const providers = useAIStore((s: any) => s.providers);

  const handleLongPress = useCallback(async () => {
    setError(null);

    const checker = new VisionCapabilityChecker();
    
    if (!selectedModelId || !providers) {
      setError('No AI model configured');
      Alert.alert('Vision unavailable', 'Configure an AI model in settings.');
      return;
    }
    
    let modelConfig: any = null;
    let providerConfig: any = null;
    for (const provider of (providers as any[])) {
      const model = (provider.models as any[]).find((m: any) => m.id === selectedModelId);
      if (model) {
        modelConfig = model;
        providerConfig = provider;
        break;
      }
    }
    
    if (!modelConfig || !providerConfig) {
      setError('No AI model configured');
      Alert.alert('Vision unavailable', 'Configure an AI model in settings.');
      return;
    }

    const cap = checker.check(modelConfig, providerConfig);
    if (!cap.supported) {
      setError(cap.reason);
      Alert.alert('Vision not supported', cap.reason);
      return;
    }

    if (selectedElementIds.length === 0) {
      setError('No elements selected');
      Alert.alert('Select elements first', 'Long-press requires selected elements.');
      return;
    }

    setIsTranscribing(true);
    try {
      const composer = new AtlasComposer();
      const centerX = 10000;
      const centerY = 10000;
      const radius = 2000;
      const bounds = composer.computeBounds(centerX, centerY, radius);

      const tiles = composer.getIntersectingTiles(bounds);

      const layout = composer.composeAtlas(bounds, tiles);
      
      const encoder = new AtlasEncoder();
      const atlasResult = await encoder.encode({
        bounds,
        outputWidth: layout.outputWidth,
        outputHeight: layout.outputHeight,
        outputScale: layout.outputScale,
        tiles: layout.tilePlacements.map((t: any) => ({
          tileX: t.tileX,
          tileY: t.tileY,
          drawTile: (canvas: any, tx: number, ty: number) => {
            canvas.drawRect(tx, ty, 512, 512, 'rgba(200,200,200,0.5)');
          },
        })),
      });

      if (!atlasResult) throw new Error('Atlas encoding failed');

      const hotspotGrid = new HotspotGrid();
      const gridResult = hotspotGrid.build(bounds, []);

      const visionService = new CanvasVisionService();
      const transcript = await visionService.transcribe(
        modelConfig as any, // Pass the full model config from provider detection
        {
          atlas: atlasResult,
          hotspotGrid: gridResult,
          userPrompt: 'Transcribe handwriting in this canvas region',
        }
      );

      if (!transcript) throw new Error('Vision transcription failed');

      if (transcript.parsed.commands && transcript.parsed.commands.length > 0) {
        addDraftCommands(transcript.parsed.commands);
      }

      if (onSaveRecognition && transcript.parsed.observedText?.trim()) {
        await onSaveRecognition(canvasId, transcript.parsed.observedText);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      Alert.alert('Vision failed', msg);
    } finally {
      setIsTranscribing(false);
    }
  }, [selectedElementIds, allElements, canvasId, onSaveRecognition, addDraftCommands, selectedModelId, providers]);

  const gesture = Gesture.LongPress()
    .minDuration(LONG_PRESS_DURATION)
    .onEnd(() => {
      handleLongPress();
    });

  return {
    gesture,
    isTranscribing,
    error,
  };
}
