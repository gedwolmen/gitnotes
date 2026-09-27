/**
 * Marketing Composition Package - Main Page
 *
 * Wires together the story composition:
 * TitleCard → AppScreenshot → FeatureCallout → EndCard
 *
 * Provides deterministic timeline controls and diagnostics.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TitleCard, AppScreenshot, FeatureCallout, EndCard } from './compositions';
import { useReducedMotion } from './hooks/useReducedMotion';
import { preloadSlideImages } from './preload';
import { runDiagnostics, renderDiagnosticsOverlay } from './diagnostics';
import { createStoryTimeline } from './timeline';
import type {
  SocialSlide,
  StorySlideConfig,
  CheckpointResult,
  Diagnostics,
} from './types';
import { THEME_CLEAN_LIGHT } from './types';

// ------------------------------------------------------------------------------------------------
// Props
// ------------------------------------------------------------------------------------------------

export interface MarketingPageProps {
  /** Story configuration */
  config: StorySlideConfig;
  /** Callback when all images are preloaded */
  onPreloadComplete?: () => void;
  /** Callback when rendering checkpoint */
  onCheckpoint?: (result: CheckpointResult) => void;
  /** Callback when diagnostics change */
  onDiagnosticsChange?: (diagnostics: Diagnostics) => void;
  /** Whether to show diagnostics overlay */
  showDiagnostics?: boolean;
  /** Auto-play on mount */
  autoPlay?: boolean;
}

// ------------------------------------------------------------------------------------------------
// Story Slides Mapping
// ------------------------------------------------------------------------------------------------

function mapSlides(config: StorySlideConfig): SocialSlide[] {
  return config.slides;
}

// ------------------------------------------------------------------------------------------------
// Component
// ------------------------------------------------------------------------------------------------

export function MarketingPage({
  config,
  onPreloadComplete,
  onCheckpoint: _onCheckpoint,
  onDiagnosticsChange,
  showDiagnostics = false,
  autoPlay = true,
}: MarketingPageProps): JSX.Element {
  const { shouldReduceMotion } = useReducedMotion();
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [, setIsLoaded] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [preloadErrors, setPreloadErrors] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const slides = mapSlides(config);
  const timeline = createStoryTimeline(slides, config.duration);

  // Run diagnostics on mount
  useEffect(() => {
    runDiagnostics(slides).then((diag) => {
      setDiagnostics(diag);
      onDiagnosticsChange?.(diag);

      // Exit with error code if unhealthy
      if (!diag.healthy) {
        console.error(renderDiagnosticsOverlay(diag));
      }
    });
  }, [slides, onDiagnosticsChange]);

  // Preload images
  useEffect(() => {
    preloadSlideImages(slides, 5000)
      .then((result) => {
        setIsLoaded(result.allLoaded);
        if (!result.allLoaded) {
          const errors = result.images
            .filter((i) => !i.loaded)
            .map((i) => `Failed to load: ${i.url} - ${i.error}`);
          setPreloadErrors(errors);
        }
        onPreloadComplete?.();
      })
      .catch((err) => {
        setPreloadErrors([`Preload error: ${err.message}`]);
        onPreloadComplete?.();
      });
  }, [slides, onPreloadComplete]);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying || slides.length === 0) return;

    const slideDuration = config.duration / slides.length;
    const intervalId = setInterval(() => {
      setCurrentSlideIndex((prev) => {
        const next = prev + 1;
        if (next >= slides.length) {
          setIsPlaying(false);
          return slides.length - 1;
        }
        return next;
      });
    }, slideDuration);

    return () => clearInterval(intervalId);
  }, [isPlaying, slides.length, config.duration]);

  // Playback controls
  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const restart = useCallback(() => {
    setCurrentSlideIndex(0);
    setIsPlaying(true);
  }, []);

  // Seek to specific time
  const seekTo = useCallback(
    (timeMs: number) => {
      const state = timeline.getStateAt(timeMs);
      setCurrentSlideIndex(state.slideIndex);
    },
    [timeline]
  );

  // Current slide
  const currentSlide = slides[currentSlideIndex];

  // Render slide content
  const renderSlide = () => {
    if (!currentSlide) return null;

    // Title Card (first slide or custom)
    if (currentSlideIndex === 0 || currentSlide.layout === 'hero') {
      return (
        <TitleCard
          appName={currentSlide.headline || 'GitNotēs'}
          tagline={currentSlide.subtitle || currentSlide.body || 'Notes, Todos & Git'}
          theme={config.theme}
          animate={isPlaying}
        />
      );
    }

    // Feature Callout (middle slides)
    if (currentSlide.layout === 'feature' || currentSlide.layout === 'contrast') {
      return (
        <FeatureCallout
          icon={currentSlide.headline.charAt(0)}
          title={currentSlide.headline}
          description={currentSlide.body || ''}
          theme={config.theme}
          animate={isPlaying}
        />
      );
    }

    // App Screenshot (screenshot slides)
    return (
      <AppScreenshot
        imageUrl={currentSlide.sourcePath}
        device={currentSlide.device}
        orientation={currentSlide.orientation}
        theme={config.theme}
        caption={currentSlide.body}
        animate={isPlaying}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: config.width,
        height: config.height,
        position: 'relative',
        overflow: 'hidden',
        background: config.theme.background,
      }}
    >
      {/* Slide Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlideIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.4 }}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {renderSlide()}
        </motion.div>
      </AnimatePresence>

      {/* End Card - shown when playback completes */}
      {currentSlideIndex === slides.length - 1 && !isPlaying && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          <EndCard
            appName="GitNotēs"
            tagline="Notes, Todos & Git"
            theme={config.theme}
            animate={true}
          />
        </motion.div>
      )}

      {/* Diagnostics Overlay */}
      {showDiagnostics && diagnostics && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            padding: '1rem',
            background: diagnostics.healthy ? '#22c55e20' : '#ef444420',
            borderBottom: `1px solid ${diagnostics.healthy ? '#22c55e' : '#ef4444'}`,
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: diagnostics.healthy ? '#22c55e' : '#ef4444',
            zIndex: 100,
            whiteSpace: 'pre-wrap',
          }}
        >
          {renderDiagnosticsOverlay(diagnostics)}
          {preloadErrors.length > 0 && (
            <div style={{ marginTop: '0.5rem', color: '#ef4444' }}>
              {preloadErrors.join('\n')}
            </div>
          )}
        </div>
      )}

      {/* Timeline Progress Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: config.theme.muted + '40',
        }}
      >
        <motion.div
          style={{
            height: '100%',
            background: config.theme.accent,
            scaleX: (currentSlideIndex + 1) / slides.length,
            transformOrigin: 'left',
          }}
          animate={{ scaleX: (currentSlideIndex + 1) / slides.length }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Controls */}
      <div
        style={{
          position: 'absolute',
          bottom: '1rem',
          right: '1rem',
          display: 'flex',
          gap: '0.5rem',
        }}
      >
        <button
          onClick={restart}
          style={{
            padding: '0.5rem 1rem',
            background: config.theme.foreground,
            color: config.theme.background,
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          Restart
        </button>
        <button
          onClick={isPlaying ? pause : play}
          style={{
            padding: '0.5rem 1rem',
            background: config.theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      </div>

      {/* Checkpoint markers */}
      {timeline.checkpoints.map((cp) => (
        <div
          key={cp.id}
          style={{
            position: 'absolute',
            bottom: '8px',
            left: `${(cp.time / config.duration) * 100}%`,
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: cp.id === 'start' ? '#22c55e' : cp.id === 'middle' ? '#f59e0b' : '#ef4444',
            transform: 'translateX(-50%)',
            cursor: 'pointer',
            zIndex: 10,
          }}
          onClick={() => seekTo(cp.time)}
          title={`${cp.id}: ${cp.time}ms`}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Default Story Configuration
// ------------------------------------------------------------------------------------------------

export function createDefaultStory(config?: Partial<StorySlideConfig>): StorySlideConfig {
  return {
    duration: config?.duration ?? 8000,
    theme: config?.theme ?? THEME_CLEAN_LIGHT,
    width: config?.width ?? 1080,
    height: config?.height ?? 1920,
    slides: config?.slides ?? [
      {
        id: 'title',
        layout: 'hero',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: '',
        headline: 'GitNotēs',
        subtitle: 'Notes, Todos & Git',
        body: 'Your data lives as plain Markdown — yours to read, edit, and version anywhere.',
        index: 1,
      },
      {
        id: 'screenshot',
        layout: 'feature',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: '',
        headline: 'Capture Every Idea',
        body: 'Notes, journals, and canvases — all backed by a Git repo.',
        index: 2,
      },
      {
        id: 'feature',
        layout: 'feature',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: '',
        headline: 'Works Offline',
        body: "Edits queue locally and sync when you're back online.",
        index: 3,
      },
      {
        id: 'end',
        layout: 'contrast',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: '',
        headline: 'GitNotēs',
        subtitle: 'iOS & Android',
        body: 'Free and open source. No lock-in.',
        index: 4,
      },
    ],
  };
}
