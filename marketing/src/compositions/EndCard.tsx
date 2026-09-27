/**
 * Marketing Composition Package - End Card
 *
 * Closing slide for social stories.
 * Includes app name, download call-to-action, and branding.
 */

import { motion } from 'motion/react';
import type { StoreTheme } from '../types';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ------------------------------------------------------------------------------------------------
// Props
// ------------------------------------------------------------------------------------------------

export interface EndCardProps {
  /** App name */
  appName: string;
  /** Tagline */
  tagline: string;
  /** Theme for styling */
  theme: StoreTheme;
  /** App Store URL */
  appStoreUrl?: string;
  /** Google Play URL */
  googlePlayUrl?: string;
  /** Whether animation should play */
  animate?: boolean;
}

// ------------------------------------------------------------------------------------------------
// Animation Variants
// ------------------------------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

const reducedVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

// ------------------------------------------------------------------------------------------------
// Component
// ------------------------------------------------------------------------------------------------

export function EndCard({
  appName,
  tagline,
  theme,
  appStoreUrl,
  googlePlayUrl,
  animate = true,
}: EndCardProps): JSX.Element {
  const { shouldReduceMotion } = useReducedMotion();

  const variants = shouldReduceMotion ? reducedVariants : containerVariants;
  const itemTransition = shouldReduceMotion ? reducedVariants : itemVariants;

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
        padding: '10%',
        boxSizing: 'border-box',
      }}
    >
      <motion.div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          maxWidth: '80%',
        }}
        initial="hidden"
        animate={animate ? 'visible' : 'visible'}
        variants={variants}
      >
        {/* App Name */}
        <motion.h2
          style={{
            fontSize: 'clamp(1.75rem, 6vw, 3rem)',
            fontWeight: 800,
            color: theme.foreground,
            margin: 0,
            marginBottom: '0.5rem',
            letterSpacing: '-0.02em',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          variants={itemTransition}
        >
          {appName}
        </motion.h2>

        {/* Tagline */}
        <motion.p
          style={{
            fontSize: 'clamp(0.875rem, 2.5vw, 1.125rem)',
            fontWeight: 400,
            color: theme.muted,
            margin: 0,
            marginBottom: '2rem',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          variants={itemTransition}
        >
          {tagline}
        </motion.p>

        {/* CTA Badges */}
        <motion.div
          style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
          variants={itemTransition}
        >
          {appStoreUrl && (
            <a
              href={appStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                background: theme.foreground,
                color: theme.background,
                borderRadius: '12px',
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                transition: 'transform 0.2s',
              }}
            >
              <span>Download on</span>
              <span>App Store</span>
            </a>
          )}

          {googlePlayUrl && (
            <a
              href={googlePlayUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                background: theme.foreground,
                color: theme.background,
                borderRadius: '12px',
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                transition: 'transform 0.2s',
              }}
            >
              <span>Get it on</span>
              <span>Google Play</span>
            </a>
          )}
        </motion.div>

        {/* Branding Line */}
        <motion.p
          style={{
            fontSize: '0.75rem',
            color: theme.muted,
            marginTop: '2.5rem',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          variants={itemTransition}
        >
          Free and open source · MPL-2.0
        </motion.p>
      </motion.div>
    </div>
  );
}
