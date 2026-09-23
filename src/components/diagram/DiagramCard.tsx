/**
 * Diagram card component — mirrors CanvasCard pattern.
 *
 * Displays a diagram with its title, ASCII thumbnail preview,
 * object count, and metadata.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import type { Diagram } from '../../models/Diagram';
import { useTheme } from '../../contexts/ThemeContext';
import { TagChips } from '../TagChips';
import DiagramThumbnail from './DiagramThumbnail';

interface DiagramCardProps {
  diagram: Diagram;
  onPress: (diagram: Diagram) => void;
  onLongPress?: (diagram: Diagram) => void;
  onTagPress?: (tag: string) => void;
  compact?: boolean;
}

function DiagramCardImpl({
  diagram,
  onPress,
  onLongPress,
  onTagPress,
  compact = false,
}: DiagramCardProps) {
  const { colors, isDark } = useTheme();
  const objectCount = diagram.document?.objects?.length ?? 0;
  const title = diagram.title || 'Untitled Diagram';
  const formattedDate = format(new Date(diagram.updatedAt), compact ? 'MMM d' : 'MMM d, yyyy');

  return (
    <TouchableOpacity
      testID={`diagram-card-${diagram.id}`}
      accessibilityLabel={`${title}, ${objectCount} objects, ${formattedDate}`}
      accessibilityRole="button"
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          shadowColor: colors.shadow,
          shadowOpacity: isDark ? 0 : 0.1,
        },
        compact && styles.cardCompact,
      ]}
      onPress={() => onPress(diagram)}
      onLongPress={() => onLongPress?.(diagram)}
      activeOpacity={0.7}
    >
      <View style={styles.contentRow}>
        {/* Thumbnail */}
        <View style={[styles.thumbnailContainer, compact && styles.thumbnailCompact]}>
          <DiagramThumbnail
            diagram={diagram}
            width={compact ? 80 : 120}
            height={compact ? 80 : 120}
          />
        </View>

        {/* Main content */}
        <View style={styles.mainContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="grid-outline" size={18} color={colors.accent} />
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={compact ? 1 : 2}
              >
                {title}
              </Text>
            </View>

            {/* Object count badge */}
            <View style={[styles.objectCountBadge, { backgroundColor: colors.accent + '18' }]}>
              <Text style={[styles.objectCountText, { color: colors.accent }]}>
                {objectCount} obj{objectCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          {/* Tags */}
          {!compact && diagram.tags.length > 0 && (
            <View style={styles.tagsRow}>
              <TagChips tags={[...diagram.tags]} onTagPress={onTagPress} />
            </View>
          )}

          {/* Repo/Branch info */}
          {!compact && (diagram.repo || diagram.folderPath) && (
            <View style={[styles.repoContainer, { borderTopColor: colors.border }]}>
              {diagram.folderPath && diagram.folderPath !== '/' && (
                <View style={styles.repoItem}>
                  <Ionicons name="folder" size={14} color={colors.textSecondary} />
                  <Text style={[styles.repoText, { color: colors.textSecondary }]}>
                    {diagram.folderPath.split('/').pop()}
                  </Text>
                </View>
              )}
              {diagram.repo && (
                <View style={styles.repoItem}>
                  <Ionicons name="cube-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.repoText, { color: colors.textSecondary }]}>
                    {diagram.repo}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Footer with date */}
      <View style={styles.footer}>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {formattedDate}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const DiagramCard = React.memo(DiagramCardImpl);
export default DiagramCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  cardCompact: {
    padding: 12,
    marginVertical: 4,
    marginHorizontal: 0,
  },
  contentRow: {
    flexDirection: 'row',
    gap: 12,
  },
  thumbnailContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbnailCompact: {
    borderRadius: 6,
  },
  mainContent: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    minWidth: 0,
  },
  objectCountBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  objectCountText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tagsRow: {
    marginTop: 4,
  },
  repoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
  },
  repoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 2,
    gap: 4,
  },
  repoText: {
    fontSize: 12,
  },
  footer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  date: {
    fontSize: 12,
  },
});
