import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Canvas } from '../models/Canvas';
import { useTheme } from '../contexts/ThemeContext';
import { TagChips } from './TagChips';
import CanvasThumbnail from './CanvasThumbnail';

interface CanvasCardProps {
  canvas: Canvas;
  onPress: (canvas: Canvas) => void;
  onLongPress?: (canvas: Canvas) => void;
  onTagPress?: (tag: string) => void;
  compact?: boolean;
}

function CanvasCardImpl({
  canvas,
  onPress,
  onLongPress,
  onTagPress,
  compact = false,
}: CanvasCardProps) {
  const { colors, isDark } = useTheme();
  const elementCount = canvas.scene?.elements?.length ?? 0;
  const sceneWidth = canvas.scene?.width ?? 800;
  const sceneHeight = canvas.scene?.height ?? 600;
  const title = canvas.title || 'Untitled Canvas';
  const formattedDate = format(new Date(canvas.updatedAt), compact ? 'MMM d' : 'MMM d, yyyy');

  return (
    <TouchableOpacity
      testID={`canvas-card-${canvas.id}`}
      accessibilityLabel={`${title}, ${sceneWidth} by ${sceneHeight}, ${elementCount} elements, ${formattedDate}`}
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
      onPress={() => onPress(canvas)}
      onLongPress={() => onLongPress?.(canvas)}
      activeOpacity={0.7}
    >
      <View style={styles.contentRow}>
        {/* Thumbnail */}
        <View style={[styles.thumbnailContainer, compact && styles.thumbnailCompact]}>
          <CanvasThumbnail
            scene={canvas.scene}
            width={compact ? 80 : 120}
            height={compact ? 80 : 120}
          />
        </View>

        {/* Main content */}
        <View style={styles.mainContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="easel-outline" size={18} color={colors.primary} />
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={compact ? 1 : 2}
              >
                {title}
              </Text>
            </View>

            {/* Dimensions badge */}
            <View style={[styles.dimensionsBadge, { backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.dimensionsText, { color: colors.primary }]}>
                {sceneWidth} × {sceneHeight}
              </Text>
            </View>
          </View>

          {/* Element count */}
          <View style={styles.elementCountRow}>
            <Ionicons name="layers-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.elementCountText, { color: colors.textSecondary }]}>
              {elementCount} element{elementCount !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Tags */}
          {!compact && canvas.tags.length > 0 && (
            <View style={styles.tagsRow}>
              <TagChips tags={canvas.tags} onTagPress={onTagPress} />
            </View>
          )}

          {/* Repo/Branch info */}
          {!compact && (canvas.repo || canvas.folderPath) && (
            <View style={[styles.repoContainer, { borderTopColor: colors.border }]}>
              {canvas.folderPath && canvas.folderPath !== '/' && (
                <View style={styles.repoItem}>
                  <Ionicons name="folder" size={14} color={colors.textSecondary} />
                  <Text style={[styles.repoText, { color: colors.textSecondary }]}>
                    {canvas.folderPath.split('/').pop()}
                  </Text>
                </View>
              )}
              {canvas.repo && (
                <View style={styles.repoItem}>
                  <Ionicons name="cube-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.repoText, { color: colors.textSecondary }]}>
                    {canvas.repo}
                  </Text>
                </View>
              )}
              {canvas.branch && (
                <View style={styles.repoItem}>
                  <Ionicons name="git-branch-outline" size={14} color={colors.primary} />
                  <Text style={[styles.branchText, { color: colors.primary }]}>
                    {canvas.branch}
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

const CanvasCard = React.memo(CanvasCardImpl);
export default CanvasCard;

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
  dimensionsBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dimensionsText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  elementCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  elementCountText: {
    fontSize: 12,
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
  branchText: {
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
