import React from 'react';

import { EmptyState } from '../ui';

export function TemplatesEmptyState() {
  return (
    <EmptyState
      icon="document-text-outline"
      title="No templates yet"
      subtitle="Create your first custom template to get started."
    />
  );
}
