import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
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
import type { GitHostProvider } from '../../services/git/GitHost';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function AddScheduledLearningScreen() {
  const navigation = useNavigation<Navigation>();
  const { t } = useTranslation();
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
  const [showQuestionerFolderPicker, setShowQuestionerFolderPicker] = useState(false);
  // Tracks the Add Schedule button's submit lifecycle so we can show
  // "Generating..." while the AI note is being produced and "Schedule
  // Added" once the save + generation succeed, before navigating back.
  const [submitState, setSubmitState] = useState<'idle' | 'generating' | 'added'>('idle');

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
  const [questionerPrompts, setQuestionerPrompts] = useState<string[]>([]);
  const [questionerPromptDraft, setQuestionerPromptDraft] = useState('');
  const [questionerFolders, setQuestionerFolders] = useState<
    { repoPath: string; folderPath: string; provider?: GitHostProvider }[]
  >([]);
  const [questionerFolderRepo, setQuestionerFolderRepo] = useState<string | null>(null);
  const [questionerFolderBranch, setQuestionerFolderBranch] = useState<string | null>(null);
  // Setter is used to track the active questioner-folder host so the
  // picker can pre-load the right host service; the value is read
  // indirectly through the folders list.
  const [, setQuestionerFolderProvider] = useState<GitHostProvider | null>(null);

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
    setQuestionerPrompts([]);
    setQuestionerPromptDraft('');
    setQuestionerFolders([]);
    setQuestionerFolderRepo(null);
    setQuestionerFolderBranch(null);
    setQuestionerFolderProvider(null);
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

  const normalizedPromptDraft = questionerPromptDraft.trim();
  const canAddPrompt = normalizedPromptDraft.length > 0;

  const handleAddPrompt = useCallback(() => {
    if (!canAddPrompt) return;
    setQuestionerPrompts((prev) =>
      prev.includes(normalizedPromptDraft) ? prev : [...prev, normalizedPromptDraft],
    );
    setQuestionerPromptDraft('');
  }, [canAddPrompt, normalizedPromptDraft]);

  const handleRemovePrompt = useCallback((prompt: string) => {
    setQuestionerPrompts((prev) => prev.filter((p) => p !== prompt));
  }, []);

  const handleRemoveFolder = useCallback((index: number) => {
    setQuestionerFolders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleQuestionerFolderSelect = useCallback(
    (
      repoPath: string | null,
      branch: string | null,
      folderPath: string | null,
      provider?: GitHostProvider,
    ) => {
      if (repoPath && folderPath) {
        setQuestionerFolderRepo(repoPath);
        setQuestionerFolderBranch(branch ?? null);
        setQuestionerFolderProvider(provider ?? null);
        setQuestionerFolders((prev) => {
          const exists = prev.some(
            (f) => f.repoPath === repoPath && f.folderPath === folderPath,
          );
          if (exists) return prev;
          return [...prev, { repoPath, folderPath, provider: provider ?? undefined }];
        });
      }
    },
    [],
  );

  const openQuestionerFolderPicker = useCallback(() => {
    if (!questionerFolderRepo) {
      setShowQuestionerFolderPicker(true);
      return;
    }
    setShowQuestionerFolderPicker(true);
  }, [questionerFolderRepo]);

  // Once the schedule has been successfully created and the note generated,
  // sit on the "Schedule Added" confirmation briefly so the user can see it,
  // then pop back to the previous screen. We keep the previous-screen check
  // to avoid double-navigating if the user hits the system back button
  // during the beat.
  useEffect(() => {
    if (submitState !== 'added') return;
    const timer = setTimeout(() => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [submitState, navigation]);

  const handleAdd = useCallback(async () => {
    // Guard against double-submits while the AI generation + notification
    // scheduling are in flight. The button is also visually disabled in
    // those states so this is mostly belt-and-braces.
    if (submitState !== 'idle') {
      return;
    }
    if (tags.length === 0) {
      Alert.alert(t('scheduledLearning.questioner.tagsRequiredTitle'), t('scheduledLearning.questioner.tagsRequiredBody'));
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert(t('scheduledLearning.questioner.dayRequiredTitle'), t('scheduledLearning.questioner.dayRequiredBody'));
      return;
    }
    if (availableModels.length === 0) {
      Alert.alert(t('scheduledLearning.questioner.aiNotConfiguredTitle'), t('scheduledLearning.questioner.aiNotConfiguredBody'));
      return;
    }
    if (learningType === 'questioner') {
      if (questionerSource === 'prompt' && questionerPrompts.length === 0) {
        Alert.alert(
          t('scheduledLearning.questioner.promptRequiredTitle'),
          t('scheduledLearning.questioner.promptRequiredBody'),
        );
        return;
      }
      if (questionerSource === 'folder' && questionerFolders.length === 0) {
        Alert.alert(
          t('scheduledLearning.questioner.folderRequiredTitle'),
          t('scheduledLearning.questioner.folderRequiredBody'),
        );
        return;
      }
    }

    const timeStr = selectedTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Flip into the "Generating..." state up front so the button reflects
    // the in-flight work while createItem + generateNow + scheduleNotification
    // resolve. A subsequent success transition flips it to "Schedule Added"
    // for a brief beat before we navigate back.
    setSubmitState('generating');

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
      questionerPrompts: learningType === 'questioner' ? questionerPrompts : undefined,
      questionerFolders: learningType === 'questioner' ? questionerFolders : undefined,
    });

    if (newItem) {
      // Generate the note now so the user can read it immediately and the
      // scheduled notification acts as a reminder rather than a generator.
      const createdNote = await ScheduledLearningService.generateNow(newItem);
      if (createdNote) {
        await ScheduledLearningService.scheduleNotification(newItem, createdNote.id);
        // Show the "Schedule Added" confirmation on the button for a short
        // beat so the user gets visual feedback before the screen pops.
        // The useEffect below handles the actual navigation back once that
        // confirmation has been visible long enough to read.
        setSubmitState('added');
        resetForm();
        return;
      }

      // Generation failed (e.g. no AI model, model misconfigured, network).
      // Surface the error and let the user decide whether to keep the
      // schedule, retry, or remove it.
      Alert.alert(
        t('scheduledLearning.questioner.generateFailedTitle'),
        t('scheduledLearning.questioner.generateFailedBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              await useScheduledLearningStore.getState().deleteItem(newItem.id);
            },
          },
        ],
      );
      // The schedule record was created but the note couldn't be generated;
      // re-enable the button so the user can dismiss the alert and decide.
      setSubmitState('idle');
      return;
    }

    // createItem returned nothing — treat as a soft failure and let the
    // user retry rather than silently navigating back.
    setSubmitState('idle');
  }, [submitState, tags, description, selectedDays, selectedTime, selectedModel, selectedFolderPath, selectedRepoPath, selectedBranch, selectedWordCount, repeat, learningType, questionerSource, questionerPrompts, questionerFolders, createItem, resetForm, t]);

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
                testID="add-tag-button"
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
                <View style={{ gap: spacing[2] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }}>
                    <Input
                      containerStyle={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 18 }}
                      value={questionerPromptDraft}
                      onChangeText={setQuestionerPromptDraft}
                      placeholder={t('scheduledLearning.questioner.promptPlaceholder')}
                      multiline
                      multilineMinHeight={80}
                    />
                    <TouchableOpacity
                      onPress={handleAddPrompt}
                      disabled={!canAddPrompt}
                      testID="questioner-add-prompt"
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: canAddPrompt ? colors.primary : colors.surfaceSecondary,
                        borderWidth: 1,
                        borderColor: canAddPrompt ? colors.primary : colors.border,
                        opacity: canAddPrompt ? 1 : 0.7,
                      }}
                    >
                      <Ionicons name="add" size={22} color={canAddPrompt ? '#fff' : colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {questionerPrompts.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
                      {questionerPrompts.map((prompt, promptIdx) => (
                        <TouchableOpacity
                          key={`prompt-${promptIdx}-${prompt}`}
                          onPress={() => handleRemovePrompt(prompt)}
                          testID={`questioner-prompt-${promptIdx}`}
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
                            maxWidth: '100%',
                          }}
                        >
                          <Text
                            numberOfLines={2}
                            style={{ color: colors.primary, fontSize: type.sm, fontWeight: '600', flexShrink: 1 }}
                          >
                            {prompt}
                          </Text>
                          <Ionicons name="close-circle" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {questionerSource === 'folder' ? (
                <View style={{ gap: spacing[3] }}>
                  <TouchableOpacity
                    onPress={openQuestionerFolderPicker}
                    testID="questioner-pick-folder"
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
                    <Text style={[styles.settingLabel, { color: colors.text }]}>
                      {questionerFolderRepo ? t('scheduledLearning.questioner.addFolder') : t('scheduledLearning.questioner.pickRepoAndFolder')}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.settingValue, { color: colors.textSecondary }]} numberOfLines={1}>
                        {questionerFolderRepo
                          ? `${questionerFolderRepo.split('/').pop() ?? questionerFolderRepo}${questionerFolderBranch ? ` · ${questionerFolderBranch}` : ''}`
                          : t('common.select')}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>

                  {questionerFolders.length > 0 ? (
                    <View style={{ gap: spacing[2] }}>
                      {questionerFolders.map((folder, idx) => (
                        <TouchableOpacity
                          key={`${folder.repoPath}:${folder.folderPath}:${idx}`}
                          onPress={() => handleRemoveFolder(idx)}
                          testID={`questioner-folder-${idx}`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: spacing[2],
                            paddingHorizontal: spacing[3],
                            paddingVertical: spacing[2],
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.primary + '40',
                            backgroundColor: colors.primary + '10',
                          }}
                        >
                          <Ionicons name="folder-outline" size={18} color={colors.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontSize: type.sm, fontWeight: '600' }} numberOfLines={1}>
                              {folder.folderPath}
                            </Text>
                            <Text style={{ color: colors.textSecondary, fontSize: type.xs }} numberOfLines={1}>
                              {folder.repoPath}
                            </Text>
                          </View>
                          <Ionicons name="close-circle" size={18} color={colors.primary} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
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
          disabled={submitState !== 'idle'}
          fullWidth
          style={{
            backgroundColor: submitState === 'added' ? '#22c55e' : colors.primary,
            minHeight: 54,
            opacity: submitState === 'generating' ? 0.85 : 1,
          }}
          textStyle={{ color: '#fff', fontWeight: '700' }}
          leadingIcon={
            submitState === 'generating' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : submitState === 'added' ? (
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
            ) : null
          }
          testID="add-schedule-submit"
        >
          {submitState === 'generating'
            ? 'Generating…'
            : submitState === 'added'
              ? 'Schedule Added'
              : 'Add Schedule'}
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

      <RepoFolderPickerModal
        visible={showQuestionerFolderPicker}
        repoPath={questionerFolderRepo}
        branch={questionerFolderBranch}
        folderPath={null}
        onSelect={handleQuestionerFolderSelect}
        onClose={() => setShowQuestionerFolderPicker(false)}
      />
    </SafeAreaView>
  );
}
