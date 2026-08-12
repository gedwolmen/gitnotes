import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { DailyQuote } from '../../services/DailyQuoteService';
import { useTranslation } from 'react-i18next';

interface DailyQuoteCardProps {
  quote: DailyQuote | null;
  isLoading: boolean;
  error?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function DailyQuoteCard({
  quote,
  isLoading,
  error,
  onRefresh,
  isRefreshing = false,
}: DailyQuoteCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (!quote && !isLoading && !error) return null;

  const showSkeleton = isLoading && !quote;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles" size={18} color={colors.primary} />
        <Text style={[styles.title, { color: colors.primary }]}>
          {t('home.dailyQuote', { defaultValue: 'Daily Wisdom' })}
        </Text>
        <View style={styles.spacer} />
        {onRefresh ? (
          <TouchableOpacity
            onPress={onRefresh}
            disabled={isRefreshing}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('common.refresh', { defaultValue: 'Refresh' })}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {showSkeleton ? (
        <View style={styles.skeletonWrap}>
          <View style={[styles.skeletonLineLong, { backgroundColor: colors.border }]} />
          <View style={[styles.skeletonLineShort, { backgroundColor: colors.border }]} />
          <View style={[styles.skeletonLineMedium, { backgroundColor: colors.border, marginTop: 12 }]} />
        </View>
      ) : error ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      ) : quote ? (
        <>
          <Text style={[styles.quoteText, { color: colors.text }]}>
            &ldquo;{quote.text}&rdquo;
          </Text>
          <Text style={[styles.author, { color: colors.primary }]}>— {quote.author}</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {quote.description}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginLeft: 6,
  },
  spacer: { flex: 1 },
  quoteText: {
    fontSize: 17,
    fontStyle: 'italic',
    lineHeight: 24,
    fontWeight: '500',
  },
  author: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  errorText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  skeletonWrap: {
    gap: 8,
  },
  skeletonLineLong: {
    height: 10,
    width: '95%',
    borderRadius: 4,
    opacity: 0.5,
  },
  skeletonLineShort: {
    height: 10,
    width: '55%',
    borderRadius: 4,
    opacity: 0.4,
  },
  skeletonLineMedium: {
    height: 10,
    width: '80%',
    borderRadius: 4,
    opacity: 0.3,
  },
});
