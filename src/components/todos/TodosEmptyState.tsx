import React from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '../ui';

interface TodosEmptyStateProps {
  isFiltered: boolean;
}

export function TodosEmptyState({ isFiltered }: TodosEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon="checkbox-outline"
      title={isFiltered ? t('todos.noMatchingTodos') : t('todos.noTodosYet')}
      subtitle={isFiltered ? t('notes.tryAdjusting') : t('todos.addFirst')}
    />
  );
}
