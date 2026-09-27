/**
 * Marketing Composition Package - Title Card
 *
 * Opening slide for social stories.
 * GitNotēs branding with tagline.
 */

import { motion } from 'motion/react';
import type { StoreTheme } from '../types';
import { useReducedMotion } from '../hooks/useReducedMotion';

const REDUCED_DURATION = 0.3;

// ------------------------------------------------------------------------------------------------
// Props
// ------------------------------------------------------------------------------------------------

export interface TitleCardProps {
  /** App name to display */
  appName: string;
  /** Tagline to display */
  tagline: string;
  /** Theme for styling */
  theme: StoreTheme;
  /** Whether to animate in */
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
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const titleVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const taglineVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

const reducedVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: REDUCED_DURATION } },
};

// ------------------------------------------------------------------------------------------------
// Component
// ------------------------------------------------------------------------------------------------

export function TitleCard({ appName, tagline, theme, animate = true }: TitleCardProps): JSX.Element {
  const { shouldReduceMotion } = useReducedMotion();

  const variants = shouldReduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: REDUCED_DURATION } } }
    : containerVariants;

  const titleVariant = shouldReduceMotion ? reducedVariants : titleVariants;
  const taglineVariant = shouldReduceMotion ? reducedVariants : taglineVariants;

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
          textAlign: 'center',
          maxWidth: '80%',
        }}
        initial="hidden"
        animate={animate ? 'visible' : 'visible'}
        variants={variants}
      >
        {/* App Name */}
        <motion.h1
          style={{
            fontSize: 'clamp(2rem, 8vw, 4rem)',
            fontWeight: 800,
            color: theme.foreground,
            margin: 0,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          variants={titleVariant}
        >
          {appName}
        </motion.h1>

        {/* Tagline */}
        <motion.p
          style={{
            fontSize: 'clamp(0.875rem, 3vw, 1.5rem)',
            fontWeight: 500,
            color: theme.muted,
            margin: '1rem 0 0',
            letterSpacing: '0.02em',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          variants={taglineVariant}
        >
          {tagline}
        </motion.p>

        {/* Accent Line */}
        <motion.div
          style={{
            width: '60px',
            height: '4px',
            background: theme.accent,
            borderRadius: '2px',
            margin: '2rem auto 0',
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={animate ? { scaleX: 1, opacity: 1 } : { scaleX: 1, opacity: 1 }}
          transition={
            shouldReduceMotion
              ? { duration: REDUCED_DURATION }
              : { duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] }
          }
        />
      </motion.div>
    </div>
  );
}
