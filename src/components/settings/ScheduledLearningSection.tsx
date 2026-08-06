import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Group, GroupRow, Toggle } from '../ui';
import { HintIcon } from '../ui/HintIcon';
import { useScheduledLearningStore } from '../../stores/scheduledLearningStore';
import { formatDaysOfWeek, WORD_COUNT_OPTIONS } from '../../models/ScheduledLearning';
import { ScheduledLearningService } from '../../services/ScheduledLearningService';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

interface ScheduledLearningSectionProps {
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

export function ScheduledLearningSection({ colors }: ScheduledLearningSectionProps) {
  const navigation = useNavigation<Navigation>();
  const items = useScheduledLearningStore((s) => s.items);
  const deleteItem = useScheduledLearningStore((s) => s.deleteItem);
  const toggleItem = useScheduledLearningStore((s) => s.toggleItem);

  const handleDelete = useCallback(
    (id: string) => {
      void Promise.all([
        deleteItem(id),
        ScheduledLearningService.cancelNotification(id),
      ]);
    },
    [deleteItem]
  );

  const formatWordCount = (count: number) => {
    return WORD_COUNT_OPTIONS.find((w) => w.value === count)?.label ?? `${count} words`;
  };

  return (
    <Group title="Scheduled Learning" badge="BETA">
      {items.length === 0 ? (
        <GroupRow
          leading={
            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textSecondary }}>
              No scheduled learning set up
            </Text>
          }
          trailing={
            <HintIcon hintKey="hints.settings.scheduledLearning" testID="hint.scheduled-learning" />
          }
        >
          <View />
        </GroupRow>
      ) : (
        items.map((item) => (
          <GroupRow
            key={item.id}
            leading={<Ionicons name={item.type === 'questioner' ? 'help-circle-outline' : 'school-outline'} size={18} color={colors.primary} />}
            trailing={
              <View className="flex-row items-center gap-1">
                <Toggle
                  testID={`scheduled-learning.toggle-${item.id}`}
                  value={item.isEnabled}
                  onValueChange={() => void toggleItem(item.id)}
                />
                <TouchableOpacity
                  testID={`scheduled-learning.delete-${item.id}`}
                  onPress={() => handleDelete(item.id)}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            }
          >
            <Text className="text-base" style={{ color: colors.text }} numberOfLines={1}>
              {item.tags.join(', ')}
            </Text>
            <Text className="text-[15px]" style={{ color: colors.textSecondary }}>
              {formatDaysOfWeek(item.daysOfWeek, item.repeat)} at {item.time} · {item.type === 'questioner' ? 'Questions' : 'Learn'} · {formatWordCount(item.wordCount)}
            </Text>
          </GroupRow>
        ))
      )}

      <GroupRow
        testID="scheduled-learning.button.add"
        onPress={() => navigation.navigate('AddScheduledLearning')}
        leading={<Ionicons name="add" size={20} color={colors.primary} />}
      >
        <Text className="text-base font-semibold" style={{ color: colors.primary }}>
          Add Schedule
        </Text>
      </GroupRow>
    </Group>
  );
}