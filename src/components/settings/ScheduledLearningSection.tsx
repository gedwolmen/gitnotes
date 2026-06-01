import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native/datetimepicker';
import { useTheme } from '../../contexts/ThemeContext';
import { Group, GroupRow, Modal, Toggle } from '../ui';
import { useScheduledLearningStore } from '../../stores/scheduledLearningStore';
import { useAIStore } from '../../stores/aiStore';
import { useFolders } from '../../contexts/FolderContext';
import { settingsStyles as styles } from './settingsStyles';
import {
  type DayOfWeek,
  DAY_OF_WEEK_OPTIONS,
  WORD_COUNT_OPTIONS,
} from '../../models/ScheduledLearning';
import { ScheduledLearningService } from '../../services/ScheduledLearningService';

interface ScheduledLearningSectionProps {
  colors: {
    text: string;
    textSecondary: string;
    primary: string;
    surface: string;
    border: string;
    error: string;
    background: string;
  };
}

export function ScheduledLearningSection({ colors }: ScheduledLearningSectionProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { items, createItem, deleteItem, toggleItem } = useScheduledLearningStore();
  const availableModels = useAIStore((s) => s.providers.filter((p) => p.isEnabled).flatMap((p) => p.models));
  const selectedModelId = useAIStore((s) => s.selectedModelId);
  const { folders, createFolder } = useFolders();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showWordCountPicker, setShowWordCountPicker] = useState(false);

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('monday');
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [selectedModel, setSelectedModel] = useState<string | null>(selectedModelId);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedWordCount, setSelectedWordCount] = useState(500);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);

  const resetForm = useCallback(() => {
    setTags([]);
    setTagInput('');
    setSelectedDay('monday');
    setSelectedTime(new Date());
    setSelectedModel(selectedModelId);
    setSelectedFolderId(null);
    setSelectedWordCount(500);
    setShowNewFolderInput(false);
    setNewFolderName('');
  }, [selectedModelId]);

  const handleAdd = useCallback(async () => {
    if (tags.length === 0) {
      Alert.alert('Tags required', 'Please add at least one tag for the learning topic.');
      return;
    }

    let folderId = selectedFolderId;
    let folderName = selectedFolderId
      ? folders.find((f) => f.id === selectedFolderId)?.name ?? null
      : null;

    if (showNewFolderInput && newFolderName.trim()) {
      const newFolder = await createFolder({ name: newFolderName.trim(), parentId: null });
      if (newFolder) {
        folderId = newFolder.id;
        folderName = newFolder.name;
      }
    }

    const timeStr = selectedTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    await createItem({
      tags,
      dayOfWeek: selectedDay,
      time: timeStr,
      modelId: selectedModel,
      folderId,
      folderName,
      wordCount: selectedWordCount,
    });

    resetForm();
    setShowAddModal(false);
  }, [
    tags,
    selectedDay,
    selectedTime,
    selectedModel,
    selectedFolderId,
    selectedWordCount,
    newFolderName,
    showNewFolderInput,
    folders,
    createFolder,
    createItem,
    resetForm,
  ]);

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        'Delete scheduled learning?',
        'This will remove the schedule and any pending notifications.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await deleteItem(id);
              await ScheduledLearningService.cancelNotification(id);
            },
          },
        ]
      );
    },
    [deleteItem]
  );

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDay = (day: DayOfWeek) => {
    return DAY_OF_WEEK_OPTIONS.find((d) => d.value === day)?.label ?? day;
  };

  const formatWordCount = (count: number) => {
    return WORD_COUNT_OPTIONS.find((w) => w.value === count)?.label ?? `${count} words`;
  };

  const getModelName = (modelId: string | null) => {
    if (!modelId) return 'Default';
    return availableModels.find((m) => m.id === modelId)?.name ?? 'Unknown';
  };

  const getFolderName = (folderId: string | null) => {
    if (!folderId) return 'None';
    return folders.find((f) => f.id === folderId)?.name ?? 'Unknown';
  };

  const localStyles = StyleSheet.create({
    sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    inputLabel: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 8 },
    tagInputContainer: { borderWidth: 1, borderRadius: 8, padding: 12 },
    tagChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, marginRight: 6, gap: 4 },
    tagChipText: { fontSize: 13, fontWeight: '500' },
    tagInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    tagTextInput: { flex: 1, fontSize: 14, padding: 0 },
    addTagButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
    pickerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderRadius: 8 },
    pickerButtonText: { fontSize: 15 },
    newFolderRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingLeft: 12 },
    newFolderInput: { flex: 1, fontSize: 14, paddingVertical: 12, paddingRight: 8 },
    createFolderButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 1, borderRadius: 8, borderStyle: 'dashed', gap: 6, marginTop: 8 },
    createFolderButtonText: { fontSize: 14, fontWeight: '500' },
    saveButton: { padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: '600' },
  });

  return (
    <>
      <Group title="Scheduled Learning">
        {items.length === 0 ? (
          <GroupRow>
            <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
              <Ionicons name="school-outline" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyReposText, { color: colors.textSecondary }]}>
                No scheduled learning set up
              </Text>
            </View>
          </GroupRow>
        ) : (
          items.map((item) => (
            <GroupRow
              key={item.id}
              leading={<Ionicons name="school-outline" size={18} color={colors.primary} />}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
              <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>
                {item.tags.join(', ')}
              </Text>
              <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                {formatDay(item.dayOfWeek)} at {item.time} · {formatWordCount(item.wordCount)}
              </Text>
            </GroupRow>
          ))
        )}

        <GroupRow
          testID="scheduled-learning.button.add"
          onPress={() => setShowAddModal(true)}
          leading={<Ionicons name="add" size={20} color={colors.primary} />}
        >
          <Text style={[styles.settingLabel, { color: colors.primary, fontWeight: '600' }]}>
            Add Schedule
          </Text>
        </GroupRow>
      </Group>

      <Modal
        visible={showAddModal}
        onRequestClose={() => {
          resetForm();
          setShowAddModal(false);
        }}
        bottomSheet
        contentStyle={{ padding: 16, paddingBottom: 34, maxHeight: '85%' }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={localStyles.modalHeader}>
            <Text style={localStyles.modalTitle}>New Learning Schedule</Text>
            <TouchableOpacity
              onPress={() => {
                resetForm();
                setShowAddModal(false);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={localStyles.inputLabel}>Tags (topics to learn)</Text>
          <View style={localStyles.tagInputContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: tags.length > 0 ? 8 : 0 }}>
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
            </ScrollView>
            <View style={localStyles.tagInputRow}>
              <TextInput
                style={[localStyles.tagTextInput, { color: colors.text }]}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={() => {
                  if (tagInput.trim()) {
                    setTags([...tags, tagInput.trim().toLowerCase()]);
                    setTagInput('');
                  }
                }}
                placeholder="Add tag..."
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => {
                  if (tagInput.trim()) {
                    setTags([...tags, tagInput.trim().toLowerCase()]);
                    setTagInput('');
                  }
                }}
                style={localStyles.addTagButton}
              >
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[localStyles.inputLabel, { marginTop: 16 }]}>Day</Text>
          <TouchableOpacity
            onPress={() => setShowDayPicker(true)}
            style={[localStyles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={localStyles.pickerButtonText}>{formatDay(selectedDay)}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <Text style={[localStyles.inputLabel, { marginTop: 16 }]}>Time</Text>
          <TouchableOpacity
            onPress={() => setShowTimePicker(true)}
            style={[localStyles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={localStyles.pickerButtonText}>{formatTime(selectedTime)}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <Text style={[localStyles.inputLabel, { marginTop: 16 }]}>Word Count</Text>
          <TouchableOpacity
            onPress={() => setShowWordCountPicker(true)}
            style={[localStyles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={localStyles.pickerButtonText}>{formatWordCount(selectedWordCount)}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <Text style={[localStyles.inputLabel, { marginTop: 16 }]}>AI Model</Text>
          <TouchableOpacity
            onPress={() => setShowModelPicker(true)}
            style={[localStyles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={localStyles.pickerButtonText}>{getModelName(selectedModel)}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <Text style={[localStyles.inputLabel, { marginTop: 16 }]}>Folder</Text>
          {showNewFolderInput ? (
            <View style={[localStyles.newFolderRow, { borderColor: colors.border }]}>
              <TextInput
                style={[localStyles.newFolderInput, { color: colors.text }]}
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="New folder name..."
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
              <TouchableOpacity onPress={() => setShowNewFolderInput(false)} style={{ padding: 12 }}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <TouchableOpacity
                onPress={() => setShowFolderPicker(true)}
                style={[localStyles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={localStyles.pickerButtonText}>{getFolderName(selectedFolderId)}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowNewFolderInput(true)}
                style={localStyles.createFolderButton}
              >
                <Ionicons name="folder-open-outline" size={16} color={colors.primary} />
                <Text style={localStyles.createFolderButtonText}>Create new folder</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            onPress={handleAdd}
            style={[localStyles.saveButton, { backgroundColor: colors.primary }]}
          >
            <Text style={localStyles.saveButtonText}>Add Schedule</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      <Modal
        visible={showDayPicker}
        onRequestClose={() => setShowDayPicker(false)}
        bottomSheet
        contentStyle={{ padding: 16, paddingBottom: 34 }}
      >
        <View style={localStyles.modalHeader}>
          <Text style={localStyles.modalTitle}>Select Day</Text>
          <TouchableOpacity onPress={() => setShowDayPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Group>
          {DAY_OF_WEEK_OPTIONS.map((opt) => (
            <GroupRow
              key={opt.value}
              onPress={() => {
                setSelectedDay(opt.value);
                setShowDayPicker(false);
              }}
              trailing={selectedDay === opt.value ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            >
              <Text style={{ color: selectedDay === opt.value ? colors.primary : colors.text, fontSize: 16 }}>
                {opt.label}
              </Text>
            </GroupRow>
          ))}
        </Group>
      </Modal>

      <Modal
        visible={showTimePicker}
        onRequestClose={() => setShowTimePicker(false)}
        bottomSheet
        contentStyle={{ padding: 16, paddingBottom: 34 }}
      >
        <View style={localStyles.modalHeader}>
          <Text style={localStyles.modalTitle}>Select Time</Text>
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
        <View style={localStyles.modalHeader}>
          <Text style={localStyles.modalTitle}>Select Word Count</Text>
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
        <View style={localStyles.modalHeader}>
          <Text style={localStyles.modalTitle}>Select AI Model</Text>
          <TouchableOpacity onPress={() => setShowModelPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Group>
          <GroupRow
            onPress={() => {
              setSelectedModel(null);
              setShowModelPicker(false);
            }}
            trailing={selectedModel === null ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
          >
            <Text style={{ color: selectedModel === null ? colors.primary : colors.text, fontSize: 16 }}>
              Default
            </Text>
          </GroupRow>
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

      <Modal
        visible={showFolderPicker}
        onRequestClose={() => setShowFolderPicker(false)}
        bottomSheet
        contentStyle={{ padding: 16, paddingBottom: 34 }}
      >
        <View style={localStyles.modalHeader}>
          <Text style={localStyles.modalTitle}>Select Folder</Text>
          <TouchableOpacity onPress={() => setShowFolderPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Group>
          <GroupRow
            onPress={() => {
              setSelectedFolderId(null);
              setShowFolderPicker(false);
            }}
            trailing={selectedFolderId === null ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
          >
            <Text style={{ color: selectedFolderId === null ? colors.primary : colors.text, fontSize: 16 }}>
              None
            </Text>
          </GroupRow>
          {folders.map((folder) => (
            <GroupRow
              key={folder.id}
              onPress={() => {
                setSelectedFolderId(folder.id);
                setShowFolderPicker(false);
              }}
              trailing={selectedFolderId === folder.id ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            >
              <Text style={{ color: selectedFolderId === folder.id ? colors.primary : colors.text, fontSize: 16 }}>
                {folder.name}
              </Text>
            </GroupRow>
          ))}
        </Group>
      </Modal>
    </>
  );
}