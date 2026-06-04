import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { Group, GroupRow, Modal, ScreenHeader, useScreenHeaderHeight } from '../ui';
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
import { ModelSelector } from '../ai/ModelSelector';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function AddScheduledLearningScreen() {
  const navigation = useNavigation<Navigation>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const headerHeight = useScreenHeaderHeight();

  const createItem = useScheduledLearningStore((s) => s.createItem);
  const selectedModelId = useAIStore((s) => s.selectedModelId);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showWordCountPicker, setShowWordCountPicker] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
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

  const getRepoDisplayText = () => {
    if (!selectedRepoPath) return t('settings.none', 'None');
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
      Alert.alert(t('settings.tagsRequired', 'Tags required'), t('settings.addTagPrompt', 'Please add at least one tag for the learning topic.'));
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert(t('settings.dayRequired', 'Day required'), t('settings.selectDayPrompt', 'Please select at least one day.'));
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

    navigation.goBack();
  }, [tags, description, selectedDays, selectedTime, selectedModel, selectedFolderPath, selectedRepoPath, selectedBranch, selectedWordCount, repeat, createItem, navigation, t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScreenHeader
        title={t('scheduledLearning.addNew', 'New Learning Schedule')}
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 16, gap: 20, paddingTop: 20 }}>
          <Group title={t('scheduledLearning.tags', 'Tags').toUpperCase()}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
              <View style={styles.tagInputRow}>
                <TextInput
                  style={[styles.textInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder={t('scheduledLearning.addTag', 'Add tag...')}
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
                  style={[styles.addTagButton, { backgroundColor: colors.primary }]}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
              {tags.length > 0 && (
                <View style={styles.tagsRow}>
                  {tags.map((tag) => (
                    <TouchableOpacity
                      key={tag}
                      onPress={() => setTags(tags.filter((t) => t !== tag))}
                      style={[styles.tagChip, { backgroundColor: colors.primary + '20' }]}
                    >
                      <Text style={[styles.tagChipText, { color: colors.primary }]}>{tag}</Text>
                      <Ionicons name="close-circle" size={14} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </Group>

          <Group title={t('scheduledLearning.description', 'Description').toUpperCase()}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <TextInput
                style={[styles.textArea, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('scheduledLearning.addContext', 'Add more context for the AI...')}
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
              />
            </View>
          </Group>

          <Group title={t('scheduledLearning.schedule', 'Schedule').toUpperCase()}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 16 }}>
              <View>
                <Text style={[styles.labelText, { color: colors.textSecondary }]}>{t('scheduledLearning.days', 'Days')}</Text>
                <View style={styles.daysRow}>
                  {DAY_OF_WEEK_OPTIONS.map((opt) => {
                    const isSelected = selectedDays.includes(opt.value);
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => toggleDay(opt.value)}
                        style={[
                          styles.dayChip,
                          { backgroundColor: isSelected ? colors.primary : colors.surface, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.dayChipText, { color: isSelected ? '#fff' : colors.text }]}>
                          {opt.short}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.labelText, { color: colors.textSecondary }]}>{t('scheduledLearning.time', 'Time')}</Text>
                  <TouchableOpacity
                    onPress={() => setShowTimePicker(true)}
                    style={[styles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={[styles.pickerButtonText, { color: colors.text }]}>{formatTime(selectedTime)}</Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.labelText, { color: colors.textSecondary }]}>{t('scheduledLearning.repeat', 'Repeat')}</Text>
                  <View style={styles.repeatRow}>
                    <TouchableOpacity
                      onPress={() => setRepeat('weekly')}
                      style={[styles.repeatChip, { backgroundColor: repeat === 'weekly' ? colors.primary : colors.surface, borderColor: colors.border }]}
                    >
                      <Text style={{ color: repeat === 'weekly' ? '#fff' : colors.text, fontSize: 13, fontWeight: '500' }}>
                        {t('scheduledLearning.weekly', 'Weekly')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setRepeat('one-time')}
                      style={[styles.repeatChip, { backgroundColor: repeat === 'one-time' ? colors.primary : colors.surface, borderColor: colors.border }]}
                    >
                      <Text style={{ color: repeat === 'one-time' ? '#fff' : colors.text, fontSize: 13, fontWeight: '500' }}>
                        {t('scheduledLearning.oneTime', 'One-time')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View>
                <Text style={[styles.labelText, { color: colors.textSecondary }]}>{t('scheduledLearning.wordCount', 'Word Count')}</Text>
                <TouchableOpacity
                  onPress={() => setShowWordCountPicker(true)}
                  style={[styles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={[styles.pickerButtonText, { color: colors.text }]}>{formatWordCount(selectedWordCount)}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          </Group>

          <Group title={t('scheduledLearning.aiModel', 'AI Model').toUpperCase()}>
            <GroupRow
              onPress={() => setShowModelSelector(true)}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={[styles.settingValue, { color: colors.textSecondary }]}>Select model</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </View>
              }
            >
              <Text style={[styles.settingLabel, { color: colors.text }]}>AI Model</Text>
            </GroupRow>
          </Group>

          <Group title={t('scheduledLearning.gitContext', 'Git Context').toUpperCase()}>
            <GroupRow
              onPress={() => setShowRepoFolderPicker(true)}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={[styles.settingValue, { color: selectedRepoPath ? colors.textSecondary : colors.textSecondary }]} numberOfLines={1}>
                    {getRepoDisplayText()}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </View>
              }
            >
              <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>{getRepoDisplayText()}</Text>
            </GroupRow>
          </Group>

          <TouchableOpacity
            onPress={handleAdd}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.primaryButtonText, { color: '#fff' }]}>{t('scheduledLearning.addSchedule', 'Add Schedule')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showTimePicker}
        onRequestClose={() => setShowTimePicker(false)}
        bottomSheet
        contentStyle={{ padding: 16, paddingBottom: 34 }}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{t('scheduledLearning.selectTime', 'Select Time')}</Text>
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
          themeVariant={colors.background === '#000000' ? 'dark' : 'light'}
        />
      </Modal>

      <Modal
        visible={showWordCountPicker}
        onRequestClose={() => setShowWordCountPicker(false)}
        bottomSheet
        contentStyle={{ padding: 16, paddingBottom: 34 }}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{t('scheduledLearning.selectWordCount', 'Select Word Count')}</Text>
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

      <ModelSelector
        visible={showModelSelector}
        onClose={() => setShowModelSelector(false)}
      />

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