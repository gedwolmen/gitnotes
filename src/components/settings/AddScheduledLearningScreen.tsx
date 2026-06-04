import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { Group, GroupRow, Modal } from '../ui';
import { useScheduledLearningStore } from '../../stores/scheduledLearningStore';
import { useAIStore } from '../../stores/aiStore';
import { settingsStyles as styles } from './settingsStyles';
import {
  type DayOfWeek,
  DAY_OF_WEEK_OPTIONS,
  WORD_COUNT_OPTIONS,
} from '../../models/ScheduledLearning';
import { ScheduledLearningService } from '../../services/ScheduledLearningService';
import RepoFolderPickerModal from '../RepoFolderPickerModal';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function AddScheduledLearningScreen() {
  const navigation = useNavigation<Navigation>();
  const { colors, isDark } = useTheme();
  const createItem = useScheduledLearningStore((s) => s.createItem);
  const providers = useAIStore((s) => s.providers);
  const selectedModelId = useAIStore((s) => s.selectedModelId);

  const availableModels = useMemo(
    () => providers.filter((provider) => provider.isEnabled).flatMap((provider) => provider.models),
    [providers],
  );

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showWordCountPicker, setShowWordCountPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showRepoFolderPicker, setShowRepoFolderPicker] = useState(false);

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(['monday']);
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [selectedModel, setSelectedModel] = useState<string | null>(selectedModelId);
  const [selectedWordCount, setSelectedWordCount] = useState(500);
  const [repeat, setRepeat] = useState<'weekly' | 'one-time'>('weekly');

  const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setTags([]);
    setTagInput('');
    setDescription('');
    setSelectedDays(['monday']);
    setSelectedTime(new Date());
    setSelectedModel(selectedModelId);
    setSelectedWordCount(500);
    setRepeat('weekly');
    setSelectedRepoPath(null);
    setSelectedBranch(null);
    setSelectedFolderPath(null);
  }, [selectedModelId]);

  const toggleDay = useCallback((day: DayOfWeek) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatWordCount = (count: number) => {
    return WORD_COUNT_OPTIONS.find((w) => w.value === count)?.label ?? `${count} words`;
  };

  const getModelName = (modelId: string | null) => {
    if (!modelId) return 'Default';
    return availableModels.find((m) => m.id === modelId)?.name ?? 'Unknown';
  };

  const getRepoDisplayText = () => {
    if (!selectedRepoPath) return 'None';
    const repoName = selectedRepoPath.split('/').pop() || selectedRepoPath;
    if (selectedBranch) return `${repoName} · ${selectedBranch}`;
    if (selectedFolderPath) return `${repoName} · ${selectedFolderPath}`;
    return repoName;
  };

  const handleRepoFolderSelect = useCallback((repoPath: string | null, branch: string | null, folderPath: string | null) => {
    setSelectedRepoPath(repoPath);
    setSelectedBranch(branch);
    setSelectedFolderPath(folderPath);
  }, []);

  const handleAdd = useCallback(async () => {
    if (tags.length === 0) {
      Alert.alert('Tags required', 'Please add at least one tag for the learning topic.');
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert('Day required', 'Please select at least one day.');
      return;
    }

    const timeStr = selectedTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const newItem = await createItem({
      tags,
      description,
      daysOfWeek: selectedDays,
      time: timeStr,
      modelId: selectedModel,
      folderPath: selectedFolderPath,
      repoPath: selectedRepoPath,
      branch: selectedBranch,
      wordCount: selectedWordCount,
      repeat,
    });

    if (newItem) {
      void ScheduledLearningService.scheduleNotification(newItem);
    }

    resetForm();
    navigation.goBack();
  }, [tags, description, selectedDays, selectedTime, selectedModel, selectedFolderPath, selectedRepoPath, selectedBranch, selectedWordCount, repeat, createItem, resetForm, navigation]);

  const localStyles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    headerTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
    closeButton: { padding: 8 },
    inputLabel: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 8 },
    tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tagTextInput: { flex: 1, fontSize: 14, padding: 10, borderWidth: 1, borderRadius: 8 },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    tagChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, gap: 4 },
    tagChipText: { fontSize: 13, fontWeight: '500', color: colors.primary },
    addTagButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    descriptionInput: { fontSize: 14, padding: 10, borderWidth: 1, borderRadius: 8, minHeight: 80, textAlignVertical: 'top' },
    pickerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderRadius: 8 },
    pickerButtonText: { fontSize: 15 },
    daysRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
    dayChip: { flex: 1, aspectRatio: 1, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    dayChipText: { fontSize: 13, fontWeight: '600' },
    repeatRow: { flexDirection: 'row', gap: 8 },
    repeatChip: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
    saveButton: { padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={localStyles.header}>
        <Text style={localStyles.headerTitle}>New Learning Schedule</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={localStyles.closeButton}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Text style={localStyles.inputLabel}>Tags</Text>
        <View style={localStyles.tagInputRow}>
          <TextInput
            style={[localStyles.tagTextInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            value={tagInput}
            onChangeText={setTagInput}
            placeholder="Add tag..."
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            onPress={() => {
              const trimmed = tagInput.trim().toLowerCase();
              if (trimmed && !tags.includes(trimmed)) {
                setTags([...tags, trimmed]);
              }
              setTagInput('');
            }}
            style={localStyles.addTagButton}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        {tags.length > 0 && (
          <View style={localStyles.tagsRow}>
            {tags.map((tag) => (
              <TouchableOpacity
                key={tag}
                onPress={() => setTags(tags.filter((t) => t !== tag))}
                style={localStyles.tagChip}
              >
                <Text style={localStyles.tagChipText}>{tag}</Text>
                <Ionicons name="close-circle" size={14} color={colors.primary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={localStyles.inputLabel}>Description (optional context)</Text>
        <TextInput
          style={[localStyles.descriptionInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Add more context for the AI..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={3}
        />

        <Text style={localStyles.inputLabel}>Days</Text>
        <View style={localStyles.daysRow}>
          {DAY_OF_WEEK_OPTIONS.map((opt) => {
            const isSelected = selectedDays.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => toggleDay(opt.value)}
                style={[
                  localStyles.dayChip,
                  { backgroundColor: isSelected ? colors.primary : colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[localStyles.dayChipText, { color: isSelected ? '#fff' : colors.text }]}>
                  {opt.short}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={localStyles.inputLabel}>Repeat</Text>
        <View style={localStyles.repeatRow}>
          <TouchableOpacity
            onPress={() => setRepeat('weekly')}
            style={[localStyles.repeatChip, { backgroundColor: repeat === 'weekly' ? colors.primary : colors.surface, borderColor: colors.border }]}
          >
            <Text style={{ color: repeat === 'weekly' ? '#fff' : colors.text, fontSize: 14, fontWeight: '500' }}>Weekly</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setRepeat('one-time')}
            style={[localStyles.repeatChip, { backgroundColor: repeat === 'one-time' ? colors.primary : colors.surface, borderColor: colors.border }]}
          >
            <Text style={{ color: repeat === 'one-time' ? '#fff' : colors.text, fontSize: 14, fontWeight: '500' }}>One-time</Text>
          </TouchableOpacity>
        </View>

        <Text style={localStyles.inputLabel}>Time</Text>
        <TouchableOpacity
          onPress={() => setShowTimePicker(true)}
          style={[localStyles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={localStyles.pickerButtonText}>{formatTime(selectedTime)}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={localStyles.inputLabel}>Word Count</Text>
        <TouchableOpacity
          onPress={() => setShowWordCountPicker(true)}
          style={[localStyles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={localStyles.pickerButtonText}>{formatWordCount(selectedWordCount)}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={localStyles.inputLabel}>AI Model</Text>
        <TouchableOpacity
          onPress={() => setShowModelPicker(true)}
          style={[localStyles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={localStyles.pickerButtonText}>{getModelName(selectedModel)}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={localStyles.inputLabel}>Git Context</Text>
        <TouchableOpacity
          onPress={() => setShowRepoFolderPicker(true)}
          style={[localStyles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={localStyles.pickerButtonText}>{getRepoDisplayText()}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleAdd} style={[localStyles.saveButton, { backgroundColor: colors.primary }]}>
          <Text style={localStyles.saveButtonText}>Add Schedule</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showTimePicker}
        onRequestClose={() => setShowTimePicker(false)}
        bottomSheet
        contentStyle={{ padding: 16, paddingBottom: 34 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>Select Time</Text>
          <TouchableOpacity onPress={() => setShowTimePicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display="spinner"
          onChange={(_, date) => {
            if (date) {
              setSelectedTime(date);
              setShowTimePicker(false);
            }
          }}
          accentColor={colors.primary}
          themeVariant={isDark ? 'dark' : 'light'}
        />
      </Modal>

      <Modal
        visible={showWordCountPicker}
        onRequestClose={() => setShowWordCountPicker(false)}
        bottomSheet
        contentStyle={{ padding: 16, paddingBottom: 34 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>Select Word Count</Text>
          <TouchableOpacity onPress={() => setShowWordCountPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Group>
          {WORD_COUNT_OPTIONS.map((opt) => (
            <GroupRow
              key={opt.value}
              onPress={() => {
                setSelectedWordCount(opt.value);
                setShowWordCountPicker(false);
              }}
              trailing={selectedWordCount === opt.value ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            >
              <Text style={{ color: selectedWordCount === opt.value ? colors.primary : colors.text, fontSize: 16 }}>
                {opt.label}
              </Text>
            </GroupRow>
          ))}
        </Group>
      </Modal>

      <Modal
        visible={showModelPicker}
        onRequestClose={() => setShowModelPicker(false)}
        bottomSheet
        contentStyle={{ padding: 16, paddingBottom: 34 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>Select AI Model</Text>
          <TouchableOpacity onPress={() => setShowModelPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Group>
          {availableModels.map((model) => (
            <GroupRow
              key={model.id}
              onPress={() => {
                setSelectedModel(model.id);
                setShowModelPicker(false);
              }}
              trailing={selectedModel === model.id ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            >
              <Text style={{ color: selectedModel === model.id ? colors.primary : colors.text, fontSize: 16 }}>
                {model.name}
              </Text>
            </GroupRow>
          ))}
        </Group>
      </Modal>

      <RepoFolderPickerModal
        visible={showRepoFolderPicker}
        repoPath={selectedRepoPath}
        branch={selectedBranch}
        folderPath={selectedFolderPath}
        onSelect={handleRepoFolderSelect}
        onClose={() => setShowRepoFolderPicker(false)}
      />
    </SafeAreaView>
  );
}