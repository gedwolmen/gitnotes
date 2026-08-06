import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { NoteTemplate } from '../../services/TemplateService';

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
      className="flex-row items-center p-3 rounded-sm border gap-3"
      style={{ backgroundColor: colors.surface, borderColor: colors.border }}
    >
      <View className="w-9 h-9 rounded-[10px] items-center justify-center" style={{ backgroundColor: colors.primary + '20' }}>
        <Ionicons name={template.icon} size={20} color={colors.primary} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[15px] font-semibold" style={{ color: colors.text }} numberOfLines={1}>
          {template.name}
        </Text>
        <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={1}>
          {template.isCustom ? 'Custom' : 'Built-in'}
          {template.description ? ` · ${template.description}` : ''}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <TouchableOpacity
          testID={`template-list-item.icon-button.pin-${template.id}`}
          onPress={() => onTogglePin(template)}
          className="p-2"
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
              className="p-2"
              accessibilityLabel="Edit template"
            >
              <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID={`template-list-item.icon-button.delete-${template.id}`}
              onPress={() => onDelete(template)}
              className="p-2"
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
