import React from 'react';

import { EmptyState } from '../ui';
import { useTranslation } from 'react-i18next';

export function TemplatesEmptyState() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="document-text-outline"
      title={t('templates.emptyTitle')}
      subtitle={t('templates.emptySubtitle')}
    />
  );
}
