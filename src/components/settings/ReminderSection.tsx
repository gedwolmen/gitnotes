import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Group, GroupRow, Toggle } from '../ui';
import { HintIcon } from '../ui/HintIcon';
import { useReminderStore } from '../../stores/reminderStore';
import {
  formatReminderSchedule,
  type ReminderEntityType,
  type ReminderItem,
} from '../../models/Reminder';
import { ReminderService } from '../../services/ReminderService';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const ENTITY_ICONS: Record<ReminderEntityType, keyof typeof Ionicons.glyphMap> = {
  note: 'document-outline',
  folder: 'folder-outline',
  repo: 'git-branch-outline',
  tag: 'pricetag-outline',
};

interface ReminderSectionProps {
  colors: {
    text: string;
    textSecondary: string;
    primary: string;
    surface: string;
    border: string;
    error: string;
    background: string;
    accent?: string;
  };
}

export function ReminderSection({ colors }: ReminderSectionProps) {
  const navigation = useNavigation<Navigation>();
  const items = useReminderStore((s) => s.items);
  const deleteItem = useReminderStore((s) => s.deleteItem);
  const toggleItem = useReminderStore((s) => s.toggleItem);

  const handleDelete = useCallback(
    (item: ReminderItem) => {
      void Promise.all([
        deleteItem(item.id),
        ReminderService.cancelNotification(item),
      ]);
    },
    [deleteItem],
  );

  return (
    <Group title="Reminders" badge="BETA">
      {items.length === 0 ? (
        <GroupRow
          leading={
            <Text
              style={{
                fontSize: 15,
                fontWeight: '500',
                color: colors.textSecondary,
              }}
            >
              No reminders set up
            </Text>
          }
          trailing={
            <HintIcon
              hintKey="hints.settings.reminders"
              testID="hint.reminders"
            />
          }
        >
          <View />
        </GroupRow>
      ) : (
        items.map((item) => (
          <GroupRow
            key={item.id}
            leading={
              <Ionicons
                name={ENTITY_ICONS[item.entityType]}
                size={18}
                color={colors.primary}
              />
            }
            trailing={
              <View className="flex-row items-center gap-1">
                <Toggle
                  testID={`reminder.toggle-${item.id}`}
                  value={item.isEnabled}
                  onValueChange={() => void toggleItem(item.id)}
                />
                <TouchableOpacity
                  testID={`reminder.delete-${item.id}`}
                  onPress={() => handleDelete(item)}
                  style={{ padding: 4 }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={colors.error}
                  />
                </TouchableOpacity>
              </View>
            }
          >
            <Text
              className="text-base"
              style={{ color: colors.text }}
              numberOfLines={1}
            >
              {item.entityLabel}
            </Text>
            <Text
              className="text-[15px]"
              style={{ color: colors.textSecondary }}
            >
              {formatReminderSchedule(item)}
            </Text>
          </GroupRow>
        ))
      )}

      <GroupRow
        testID="reminders.button.add"
        onPress={() => navigation.navigate('AddReminder' as never)}
        leading={<Ionicons name="add" size={20} color={colors.primary} />}
      >
        <Text
          className="text-base font-semibold"
          style={{ color: colors.primary }}
        >
          Add Reminder
        </Text>
      </GroupRow>
    </Group>
  );
}
