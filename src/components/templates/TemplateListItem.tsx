import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { NoteTemplate } from '../../services/TemplateService';
import { styles } from './templateManagerStyles';

interface TemplateListItemProps {
  template: NoteTemplate;
  pinned: boolean;
  onTogglePin: (template: NoteTemplate) => void | Promise<void>;
  onEdit: (template: NoteTemplate) => void;
  onDelete: (template: NoteTemplate) => void;
}

export function TemplateListItem({ template, pinned, onTogglePin, onEdit, onDelete }: TemplateListItemProps) {
  const { colors } = useTheme();

  return (
    <View
      testID={`template-list-item.button.press-${template.id}`}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.primary + '20' }]}>
        <Ionicons name={template.icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.rowMeta}>
        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
          {template.name}
        </Text>
        <Text style={[styles.rowDesc, { color: colors.textSecondary }]} numberOfLines={1}>
          {template.isCustom ? 'Custom' : 'Built-in'}
          {template.description ? ` · ${template.description}` : ''}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <TouchableOpacity
          testID={`template-list-item.icon-button.pin-${template.id}`}
          onPress={() => onTogglePin(template)}
          style={styles.actionBtn}
          accessibilityLabel={pinned ? 'Unpin template' : 'Pin template'}
        >
          <Ionicons
            name={pinned ? 'star' : 'star-outline'}
            size={20}
            color={pinned ? colors.accent : colors.textSecondary}
          />
        </TouchableOpacity>
        {template.isCustom ? (
          <>
            <TouchableOpacity
              testID={`template-list-item.icon-button.edit-${template.id}`}
              onPress={() => onEdit(template)}
              style={styles.actionBtn}
              accessibilityLabel="Edit template"
            >
              <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID={`template-list-item.icon-button.delete-${template.id}`}
              onPress={() => onDelete(template)}
              style={styles.actionBtn}
              accessibilityLabel="Delete template"
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}
