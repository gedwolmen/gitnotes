import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { NoteTemplate, TemplateService } from '../services/TemplateService';
import { useTheme } from '../contexts/ThemeContext';
import { Modal } from './ui';
import type { RootStackParamList } from '../navigation/types';

interface TemplateSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (template: NoteTemplate) => void;
}

// Sub-component for a single template item to avoid per-item inline handlers
interface TemplateListItemProps {
  item: NoteTemplate;
  onSelect: (template: NoteTemplate) => void;
  colors: any;
}

const TemplateListItem = ({ item, onSelect, colors }: TemplateListItemProps) => {
  const onPressItem = useCallback(() => onSelect(item), [onSelect, item]);
  return (
    <TouchableOpacity testID="template-selector.picker.select" style={[styles.templateItem, { backgroundColor: colors.card, shadowColor: colors.shadow }]} onPress={onPressItem}>
      <View style={[styles.templateIcon, { backgroundColor: colors.primary + '20' }]}>
        <Ionicons name={item.icon} size={24} color={colors.primary} />
      </View>
      <View style={styles.templateInfo}>
        <Text style={[styles.templateName, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.templateDescription, { color: colors.textSecondary }]}>{item.description}</Text>
        <View style={styles.templateTags}>
          {item.tags.map((tag) => (
            <View key={tag} style={[styles.tagChip, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.tagChipText, { color: colors.textSecondary }]}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TemplateSelector({ visible, onClose, onSelect }: TemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();

  const handleCreateTemplate = useCallback(() => {
    onClose();
    navigation.navigate('TemplateManager');
  }, [onClose, navigation]);

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    const results = searchQuery
      ? await TemplateService.searchTemplates(searchQuery)
      : await TemplateService.getAllTemplates();
    setTemplates(results);
    setIsLoading(false);
  }, [searchQuery]);

  useEffect(() => {
    if (visible) {
      loadTemplates();
    }
  }, [visible, loadTemplates]);

  // (No extra handling required here; selection flows through TemplateListItem -> onSelect)

  const renderTemplate = useCallback(
    ({ item }: { item: NoteTemplate }) => (
      <TemplateListItem item={item} onSelect={onSelect} colors={colors} />
    ),
    [colors, onSelect]
  );

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      fullWidth
      contentStyle={styles.modalContent}
    >
      <View style={[styles.container, { backgroundColor: colors.elevated }]}>
        <View style={[styles.header, { backgroundColor: colors.elevated, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Choose a Template</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.searchContainer, { backgroundColor: colors.elevated }]}>
          <View style={[styles.searchInputContainer, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search templates..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <FlatList
          data={templates}
          renderItem={renderTemplate}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <TouchableOpacity
              accessibilityLabel="New custom template"
              style={[styles.templateItem, { backgroundColor: colors.card, shadowColor: colors.shadow }]}
              onPress={handleCreateTemplate}
            >
              <View style={[styles.templateIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.templateInfo}>
                <Text style={[styles.templateName, { color: colors.primary }]}>New custom template</Text>
                <Text style={[styles.templateDescription, { color: colors.textSecondary }]}>Create your own template</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          }
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No templates found</Text>
              </View>
            )
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    padding: 0,
    width: '100%',
    height: '85%',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  searchContainer: {
    padding: 16,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
  },
  listContent: {
    padding: 16,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  templateIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateInfo: {
    flex: 1,
    marginLeft: 12,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  templateDescription: {
    fontSize: 13,
    marginBottom: 6,
  },
  templateTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagChip: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
  },
  tagChipText: {
    fontSize: 11,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
});
