/**
 * Marketing Composition Package - Entry Point
 *
 * Renders the marketing story page with full diagnostics.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MarketingPage, createDefaultStory } from './page';
import { THEME_CLEAN_LIGHT } from './types';
import './styles.css';

// ------------------------------------------------------------------------------------------------
// Mount
// ------------------------------------------------------------------------------------------------

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);

// ------------------------------------------------------------------------------------------------
// Story Configuration
// ------------------------------------------------------------------------------------------------

const storyConfig = createDefaultStory({
  theme: THEME_CLEAN_LIGHT,
  duration: 8000, // 8 seconds total
  width: 1080,
  height: 1920,
});

// ------------------------------------------------------------------------------------------------
// Render
// ------------------------------------------------------------------------------------------------

root.render(
  <StrictMode>
    <MarketingPage
      config={storyConfig}
      showDiagnostics={true}
      autoPlay={true}
      onDiagnosticsChange={(diag) => {
        if (typeof window !== 'undefined') {
          (window as Window & { __DIAGNOSTICS__?: typeof diag }).__DIAGNOSTICS__ = diag;
        }
      }}
    />
  </StrictMode>
);

// ------------------------------------------------------------------------------------------------
// Export for testing
// ------------------------------------------------------------------------------------------------

export { storyConfig };
