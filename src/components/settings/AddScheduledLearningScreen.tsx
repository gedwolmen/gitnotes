import { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { Button, Group, GroupRow, Modal, Input, ScreenHeader, useScreenHeaderHeight } from '../ui';
import { useScheduledLearningStore } from '../../stores/scheduledLearningStore';
import { useAIStore } from '../../stores/aiStore';
import { settingsStyles as styles } from './settingsStyles';
import {
  type DayOfWeek,
  type ScheduledLearningType,
  type ScheduledLearningRepeat,
  type QuestionerSource,
  DAY_OF_WEEK_OPTIONS,
  WORD_COUNT_OPTIONS,
  SCHEDULED_LEARNING_TYPE_OPTIONS,
  QUESTIONER_SOURCE_OPTIONS,
} from '../../models/ScheduledLearning';
import { ScheduledLearningService } from '../../services/ScheduledLearningService';
import RepoFolderPickerModal from '../RepoFolderPickerModal';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function AddScheduledLearningScreen() {
  const navigation = useNavigation<Navigation>();
  const { colors, isDark, tokens } = useTheme();
  const { spacing, type } = tokens;
  const insets = useSafeAreaInsets();
  const headerHeight = useScreenHeaderHeight();
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
  const [repeat, setRepeat] = useState<ScheduledLearningRepeat>('weekly');
  const [learningType, setLearningType] = useState<ScheduledLearningType>('learn');
  const [questionerSource, setQuestionerSource] = useState<QuestionerSource>('tags');
  const [questionerPrompt, setQuestionerPrompt] = useState('');
  const [questionerNoteFolder, setQuestionerNoteFolder] = useState<string | null>(null);

  const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);

  const normalizedTagInput = tagInput.trim().toLowerCase();
  const canAddTag = normalizedTagInput.length > 0 && !tags.includes(normalizedTagInput);

  const resetForm = useCallback(() => {
    setTags([]);
    setTagInput('');
    setDescription('');
    setSelectedDays(['monday']);
    setSelectedTime(new Date());
    setSelectedModel(selectedModelId);
    setSelectedWordCount(500);
    setRepeat('weekly');
    setLearningType('learn');
    setQuestionerSource('tags');
    setQuestionerPrompt('');
    setQuestionerNoteFolder(null);
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

  const handleAddTag = useCallback(() => {
    if (!canAddTag) {
      setTagInput('');
      return;
    }

    setTags((prev) => [...prev, normalizedTagInput]);
    setTagInput('');
  }, [canAddTag, normalizedTagInput]);

  const handleAdd = useCallback(async () => {
    if (tags.length === 0) {
      Alert.alert('Tags required', 'Please add at least one tag for the learning topic.');
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert('Day required', 'Please select at least one day.');
      return;
    }
    if (availableModels.length === 0) {
      Alert.alert('AI Not Configured', 'Please set up an AI model in Settings before creating a scheduled learning note.');
      return;
    }

    const timeStr = selectedTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const newItem = await createItem({
      type: learningType,
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
      questionerSource: learningType === 'questioner' ? questionerSource : undefined,
      questionerPrompt: learningType === 'questioner' ? questionerPrompt : undefined,
      questionerNoteFolder: learningType === 'questioner' ? questionerNoteFolder : undefined,
    });

    if (newItem) {
      void ScheduledLearningService.scheduleNotification(newItem);
    }

    resetForm();
    navigation.goBack();
  }, [tags, description, selectedDays, selectedTime, selectedModel, selectedFolderPath, selectedRepoPath, selectedBranch, selectedWordCount, repeat, learningType, questionerSource, questionerPrompt, questionerNoteFolder, createItem, resetForm, navigation]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        style={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing[4],
          paddingTop: headerHeight + spacing[4],
          paddingBottom: insets.bottom + spacing[8],
          gap: spacing[4],
        }}
      >
        <Group title="Type">
          <View style={{ padding: spacing[4], gap: spacing[3] }}>
            {SCHEDULED_LEARNING_TYPE_OPTIONS.map((opt) => {
              const isSelected = learningType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setLearningType(opt.value)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing[3],
                    padding: spacing[4],
                    borderRadius: 16,
                    backgroundColor: isSelected ? colors.primary + '16' : colors.surfaceSecondary,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  <Ionicons name={opt.icon as any} size={24} color={isSelected ? colors.primary : colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: isSelected ? colors.primary : colors.text, fontSize: type.sm, fontWeight: '600' }}>{opt.label}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: type.xs, marginTop: 2 }}>{opt.description}</Text>
                  </View>
                  {isSelected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </Group>

        <Group title="Topic" footer={tags.length > 0 ? 'Tap a tag to remove it.' : undefined}>
          <View style={{ padding: spacing[4], gap: spacing[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Input
                containerStyle={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 18 }}
                value={tagInput}
                onChangeText={setTagInput}
                placeholder="Add a topic tag..."
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={handleAddTag}
                disabled={!canAddTag}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: canAddTag ? colors.primary : colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: canAddTag ? colors.primary : colors.border,
                  opacity: canAddTag ? 1 : 0.7,
                }}
              >
                <Ionicons name="add" size={22} color={canAddTag ? '#fff' : colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {tags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
                {tags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => setTags((prev) => prev.filter((t) => t !== tag))}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing[1],
                      backgroundColor: colors.primary + '16',
                      borderWidth: 1,
                      borderColor: colors.primary + '28',
                      paddingHorizontal: spacing[3],
                      paddingVertical: spacing[2],
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ color: colors.primary, fontSize: type.sm, fontWeight: '600' }}>{tag}</Text>
                    <Ionicons name="close-circle" size={16} color={colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </Group>

        <Group title="AI Prompt">
          <View style={{ padding: spacing[4] }}>
            <Input
              containerStyle={{ borderWidth: 1, borderColor: colors.border, borderRadius: 18 }}
              value={description}
              onChangeText={setDescription}
              placeholder="Add more context for the AI (optional)..."
              multiline
              multilineMinHeight={120}
            />
          </View>
        </Group>

        <Group title="Schedule">
          <View style={{ paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: spacing[3] }}>
            <View style={{ flexDirection: 'row', gap: spacing[1] }}>
              {DAY_OF_WEEK_OPTIONS.map((opt) => {
                const isSelected = selectedDays.includes(opt.value);
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => toggleDay(opt.value)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      paddingVertical: spacing[2],
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: type.xs, fontWeight: '700', color: isSelected ? '#fff' : colors.text }}
                    >
                      {opt.short}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <TouchableOpacity
                onPress={() => setRepeat('daily')}
                style={{
                  flex: 1,
                  paddingVertical: spacing[3],
                  borderRadius: 16,
                  alignItems: 'center',
                  backgroundColor: repeat === 'daily' ? colors.primary : colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: repeat === 'daily' ? colors.primary : colors.border,
                }}
              >
                <Text style={{ color: repeat === 'daily' ? '#fff' : colors.text, fontSize: type.sm, fontWeight: '600' }}>Daily</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRepeat('weekly')}
                style={{
                  flex: 1,
                  paddingVertical: spacing[3],
                  borderRadius: 16,
                  alignItems: 'center',
                  backgroundColor: repeat === 'weekly' ? colors.primary : colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: repeat === 'weekly' ? colors.primary : colors.border,
                }}
              >
                <Text style={{ color: repeat === 'weekly' ? '#fff' : colors.text, fontSize: type.sm, fontWeight: '600' }}>Weekly</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRepeat('one-time')}
                style={{
                  flex: 1,
                  paddingVertical: spacing[3],
                  borderRadius: 16,
                  alignItems: 'center',
                  backgroundColor: repeat === 'one-time' ? colors.primary : colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: repeat === 'one-time' ? colors.primary : colors.border,
                }}
              >
                <Text style={{ color: repeat === 'one-time' ? '#fff' : colors.text, fontSize: type.sm, fontWeight: '600' }}>One-time</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setShowTimePicker(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[3],
                minHeight: 48,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                backgroundColor: colors.surfaceSecondary,
              }}
            >
              <Text style={[styles.settingLabel, { color: colors.text }]}>Time</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{formatTime(selectedTime)}</Text>
                <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          </View>
        </Group>

        {learningType === 'questioner' ? (
          <Group title="Questioner Source">
            <View style={{ paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: spacing[3] }}>
              {QUESTIONER_SOURCE_OPTIONS.map((opt) => {
                const isSelected = questionerSource === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setQuestionerSource(opt.value)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing[3],
                      padding: spacing[3],
                      borderRadius: 14,
                      backgroundColor: isSelected ? colors.primary + '16' : colors.surfaceSecondary,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: isSelected ? colors.primary : colors.text, fontSize: type.sm, fontWeight: '600' }}>{opt.label}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: type.xs, marginTop: 2 }}>{opt.description}</Text>
                    </View>
                    {isSelected ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}

              {questionerSource === 'prompt' ? (
                <Input
                  containerStyle={{ borderWidth: 1, borderColor: colors.border, borderRadius: 18 }}
                  value={questionerPrompt}
                  onChangeText={setQuestionerPrompt}
                  placeholder="Describe what questions to generate..."
                  multiline
                  multilineMinHeight={80}
                />
              ) : null}

              {questionerSource === 'folder' ? (
                <Input
                  containerStyle={{ borderWidth: 1, borderColor: colors.border, borderRadius: 18 }}
                  value={questionerNoteFolder ?? ''}
                  onChangeText={(text) => setQuestionerNoteFolder(text || null)}
                  placeholder="Enter folder path (e.g. notes/physics)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              ) : null}
            </View>
          </Group>
        ) : null}

        <Group title="Generation">
          <View style={{ paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: spacing[3] }}>
            <TouchableOpacity
              onPress={() => setShowWordCountPicker(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[3],
                minHeight: 48,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                backgroundColor: colors.surfaceSecondary,
              }}
            >
              <Text style={[styles.settingLabel, { color: colors.text }]}>Target length</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{formatWordCount(selectedWordCount)}</Text>
                <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowModelPicker(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[3],
                minHeight: 48,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                backgroundColor: colors.surfaceSecondary,
              }}
            >
              <Text style={[styles.settingLabel, { color: colors.text }]}>AI Model</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.settingValue, { color: colors.textSecondary }]} numberOfLines={1}>{getModelName(selectedModel)}</Text>
                <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowRepoFolderPicker(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[3],
                minHeight: 48,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                backgroundColor: colors.surfaceSecondary,
              }}
            >
              <Text style={[styles.settingLabel, { color: colors.text }]}>Git Context</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' }}>
                <Text style={[styles.settingValue, { color: colors.textSecondary, flexShrink: 1 }]} numberOfLines={1}>{getRepoDisplayText()}</Text>
                <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          </View>
        </Group>

        <Button
          onPress={handleAdd}
          fullWidth
          style={{
            backgroundColor: colors.primary,
            minHeight: 54,
          }}
          textStyle={{ color: '#fff', fontWeight: '700' }}
        >
          Add Schedule
        </Button>
      </ScrollView>

      <ScreenHeader
        title="New Schedule"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

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
