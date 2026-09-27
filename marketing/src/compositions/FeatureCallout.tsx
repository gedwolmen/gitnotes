/**
 * Marketing Composition Package - Feature Callout
 *
 * Feature highlight slide with icon/badge and description.
 * Used in the middle of stories to highlight key features.
 */

import { motion } from 'motion/react';
import type { StoreTheme } from '../types';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ------------------------------------------------------------------------------------------------
// Props
// ------------------------------------------------------------------------------------------------

export interface FeatureCalloutProps {
  /** Feature icon (emoji or icon identifier) */
  icon: string;
  /** Feature title */
  title: string;
  /** Feature description */
  description: string;
  /** Theme for styling */
  theme: StoreTheme;
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
      staggerChildren: 0.12,
      delayChildren: 0.1,
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
  visible: { opacity: 1, transition: { duration: 0.2 } },
};

// ------------------------------------------------------------------------------------------------
// Component
// ------------------------------------------------------------------------------------------------

export function FeatureCallout({
  icon,
  title,
  description,
  theme,
  animate = true,
}: FeatureCalloutProps): JSX.Element {
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
          maxWidth: '85%',
        }}
        initial="hidden"
        animate={animate ? 'visible' : 'visible'}
        variants={variants}
      >
        {/* Icon Badge */}
        <motion.div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: theme.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            marginBottom: '1.5rem',
            boxShadow: `0 10px 40px -10px ${theme.accent}80`,
          }}
          variants={itemTransition}
        >
          {icon}
        </motion.div>

        {/* Title */}
        <motion.h2
          style={{
            fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
            fontWeight: 700,
            color: theme.foreground,
            margin: 0,
            marginBottom: '0.75rem',
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          variants={itemTransition}
        >
          {title}
        </motion.h2>

        {/* Description */}
        <motion.p
          style={{
            fontSize: 'clamp(0.875rem, 2.5vw, 1.125rem)',
            fontWeight: 400,
            color: theme.muted,
            margin: 0,
            lineHeight: 1.5,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          variants={itemTransition}
        >
          {description}
        </motion.p>
      </motion.div>
    </div>
  );
}
