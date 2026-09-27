/**
 * Marketing Composition Package - App Screenshot
 *
 * Mid-story slide showing the app interface.
 * Displays a screenshot image with optional overlay text.
 */

import { motion } from 'motion/react';
import type { StoreTheme, DeviceProfile } from '../types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { DEVICE_DIMENSIONS } from '../types';

// ------------------------------------------------------------------------------------------------
// Props
// ------------------------------------------------------------------------------------------------

export interface AppScreenshotProps {
  /** Screenshot image URL or data URI */
  imageUrl: string;
  /** Device profile for frame styling */
  device: DeviceProfile;
  /** Orientation of the screenshot */
  orientation: 'portrait' | 'landscape';
  /** Theme for styling */
  theme: StoreTheme;
  /** Optional caption text */
  caption?: string;
  /** Whether animation should play */
  animate?: boolean;
}

// ------------------------------------------------------------------------------------------------
// Device Frame Styles
// ------------------------------------------------------------------------------------------------

const DEVICE_FRAMES: Record<DeviceProfile, { borderRadius: number; padding: number }> = {
  'iphone-6.9-inch': { borderRadius: 40, padding: 12 },
  'ipad-13-inch': { borderRadius: 20, padding: 16 },
  'android-phone': { borderRadius: 24, padding: 10 },
  'android-7-inch-tablet': { borderRadius: 16, padding: 14 },
  'android-10-inch-tablet': { borderRadius: 16, padding: 14 },
};

// ------------------------------------------------------------------------------------------------
// Component
// ------------------------------------------------------------------------------------------------

export function AppScreenshot({
  imageUrl,
  device,
  orientation,
  theme,
  caption,
  animate = true,
}: AppScreenshotProps): JSX.Element {
  const { shouldReduceMotion } = useReducedMotion();
  const frameStyle = DEVICE_FRAMES[device];
  const dims = DEVICE_DIMENSIONS[device][orientation];

  // Calculate the display dimensions maintaining aspect ratio
  const aspectRatio = dims.width / dims.height;
  const maxWidth = 400;
  const maxHeight = 600;
  let displayWidth: number;
  let displayHeight: number;

  if (aspectRatio > maxWidth / maxHeight) {
    displayWidth = maxWidth;
    displayHeight = maxWidth / aspectRatio;
  } else {
    displayHeight = maxHeight;
    displayWidth = maxHeight * aspectRatio;
  }

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: shouldReduceMotion ? 0.3 : 0.6, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const captionVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: shouldReduceMotion ? 0.2 : 0.4, delay: shouldReduceMotion ? 0.1 : 0.3 },
    },
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: theme.background,
        padding: '8%',
        boxSizing: 'border-box',
      }}
    >
      {/* Device Frame with Screenshot */}
      <motion.div
        style={{
          width: displayWidth,
          height: displayHeight,
          background: theme.foreground,
          borderRadius: frameStyle.borderRadius,
          padding: frameStyle.padding,
          boxShadow: `0 25px 50px -12px ${theme.foreground}40`,
        }}
        initial="hidden"
        animate={animate ? 'visible' : 'visible'}
        variants={containerVariants}
      >
        {/* Screen */}
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: frameStyle.borderRadius - 8,
            overflow: 'hidden',
            background: theme.muted,
            position: 'relative',
          }}
        >
          {/* Screenshot Image */}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="App screenshot"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: `linear-gradient(135deg, ${theme.accent}40, ${theme.muted}40)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: theme.muted, fontSize: '0.75rem' }}>No screenshot</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Caption */}
      {caption && (
        <motion.p
          style={{
            fontSize: 'clamp(0.75rem, 2vw, 1rem)',
            color: theme.muted,
            marginTop: '1.5rem',
            textAlign: 'center',
            maxWidth: '80%',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          initial="hidden"
          animate={animate ? 'visible' : 'visible'}
          variants={captionVariants}
        >
          {caption}
        </motion.p>
      )}
    </div>
  );
}
