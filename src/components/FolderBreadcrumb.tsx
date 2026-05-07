import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Folder } from '../models/Folder';
import { useTheme } from '../contexts/ThemeContext';

interface FolderBreadcrumbProps {
  folders: Folder[];
  currentFolder: Folder | null;
  onNavigateToFolder: (folder: Folder | null) => void;
}

export default function FolderBreadcrumb({
  folders,
  currentFolder,
  onNavigateToFolder,
}: FolderBreadcrumbProps) {
  const { colors } = useTheme();

  const getBreadcrumbPath = useCallback((): Folder[] => {
    if (!currentFolder) return [];
    
    const path: Folder[] = [currentFolder];
    let current = currentFolder;
    
    while (current.parentId) {
      const parent = folders.find((f) => f.id === current.parentId);
      if (!parent) break;
      path.unshift(parent);
      current = parent;
    }
    
    return path;
  }, [currentFolder, folders]);

  const breadcrumbPath = getBreadcrumbPath();

  if (!currentFolder && breadcrumbPath.length === 0) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.breadcrumbItem}
          onPress={() => onNavigateToFolder(null)}
        >
          <Ionicons name="home" size={16} color={colors.primary} />
          <Text style={[styles.breadcrumbText, { color: colors.primary }]}>
            All Notes
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <TouchableOpacity
        style={styles.breadcrumbItem}
        onPress={() => onNavigateToFolder(null)}
      >
        <Ionicons name="home" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {breadcrumbPath.map((folder, index) => (
        <View key={folder.id} style={styles.breadcrumbItemWrapper}>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={colors.textSecondary}
            style={styles.separator}
          />
          <TouchableOpacity
            testID="folder-breadcrumb.button.press"
            style={styles.breadcrumbItem}
            onPress={() => onNavigateToFolder(folder)}
          >
            <Text
              style={[
                styles.breadcrumbText,
                {
                  color:
                    index === breadcrumbPath.length - 1
                      ? colors.text
                      : colors.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {folder.name}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  contentContainer: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbItemWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbText: {
    fontSize: 14,
    marginLeft: 4,
  },
  separator: {
    marginHorizontal: 4,
  },
});