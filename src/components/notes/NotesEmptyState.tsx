import React from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '../ui';

interface NotesEmptyStateProps {
  isFiltered: boolean;
}

export function NotesEmptyState({ isFiltered }: NotesEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon="document-text-outline"
      title={isFiltered ? t('notes.noMatchingNotes') : t('notes.noNotesYet')}
      subtitle={isFiltered ? t('notes.tryAdjusting') : t('notes.createFirst')}
    />
  );
}
