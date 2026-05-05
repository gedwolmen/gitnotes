import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, subDays, startOfDay } from 'date-fns';

import { useNotes } from '../contexts/NoteContext';
import { useTheme } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Note } from '../models/Note';
import { ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { JournalDateHeader } from '../components/journal/JournalDateHeader';
import { JournalEntryCard } from '../components/journal/JournalEntryCard';
import {
  isJournalEntry,
  getJournalEntries,
  findJournalEntry,
  buildJournalNoteInput,
  parseJournalDateFromTitle,
} from '../services/JournalService';
import { useResponsive } from '../hooks/useResponsive';
import { HapticService } from '../utils/haptics';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type JournalListItem =
  | { type: 'header'; date: Date; id: string }
  | { type: 'entry'; note: Note; id: string };

export default function JournalScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const { isTablet, maxContentWidth } = useResponsive();
  const { notes, createNote, isLoading, refreshNotes } = useNotes();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const listRef = useRef<FlashListRef<JournalListItem>>(null);

  const journalNotes = useMemo(
    () => notes.filter(isJournalEntry),
    [notes],
  );

  const thirtyDaysAgo = useMemo(() => subDays(startOfDay(new Date()), 30), []);

  const entriesInRange = useMemo(
    () => getJournalEntries(notes, thirtyDaysAgo, new Date()),
    [notes, thirtyDaysAgo],
  );

  const hasTodayEntry = useMemo(
    () => Boolean(findJournalEntry(notes, new Date())),
    [notes],
  );

  const listData = useMemo(() => {
    const items: JournalListItem[] = [];

    const todayHeader: JournalListItem = {
      type: 'header',
      date: new Date(),
      id: 'header-today',
    };
    items.push(todayHeader);

    const todayEntry = findJournalEntry(notes, new Date());
    if (todayEntry) {
      items.push({ type: 'entry', note: todayEntry, id: todayEntry.id });
    }

    const grouped = new Map<string, Note[]>();
    for (const entry of entriesInRange) {
      const entryDate = parseJournalDateFromTitle(entry.title);
      if (!entryDate || format(entryDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')) {
        continue;
      }
      const key = format(entryDate, 'yyyy-MM-dd');
      const existing = grouped.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(key, [entry]);
      }
    }

    const sortedKeys = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
    for (const key of sortedKeys) {
      const dateParts = key.split('-').map(Number);
      const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      items.push({ type: 'header', date, id: `header-${key}` });
      for (const note of grouped.get(key)!) {
        items.push({ type: 'entry', note, id: note.id });
      }
    }

    return items;
  }, [entriesInRange, notes]);

  const handleNotePress = useCallback(
    (note: Note) => {
      navigation.navigate('NoteEditor', { noteId: note.id });
    },
    [navigation],
  );

  const handleCreateToday = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const input = buildJournalNoteInput(new Date());
      const note = await createNote(input);
      if (note) {
        HapticService.light();
        navigation.navigate('NoteEditor', { noteId: note.id });
      }
    } finally {
      setIsCreating(false);
    }
  }, [createNote, navigation, isCreating]);

  const handlePickDate = useCallback(
    (_event: any, date?: Date) => {
      setShowDatePicker(false);
      if (!date) return;
      HapticService.light();
      const existing = findJournalEntry(notes, date);
      if (existing) {
        navigation.navigate('NoteEditor', { noteId: existing.id });
      }
    },
    [notes, navigation],
  );

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshNotes();
      HapticService.success();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refreshNotes]);

  const renderItem = useCallback(
    ({ item }: { item: JournalListItem }) => {
      if (item.type === 'header') {
        return <JournalDateHeader date={item.date} />;
      }
      return <JournalEntryCard note={item.note} onPress={handleNotePress} />;
    },
    [handleNotePress],
  );

  const keyExtractor = useCallback((item: JournalListItem) => item.id, []);

  const renderEmptyTodayPrompt = useCallback(() => {
    if (hasTodayEntry) return null;
    return (
      <TouchableOpacity
        style={[styles.todayPrompt, { backgroundColor: colors.surface }]}
        onPress={handleCreateToday}
        activeOpacity={0.7}
        disabled={isCreating}
      >
        <Ionicons name="create-outline" size={20} color={colors.primary} />
        <Text style={[styles.todayPromptText, { color: colors.primary }]}>
          Write today's entry
        </Text>
        {isCreating && (
          <ActivityIndicator size="small" color={colors.primary} style={styles.creatingSpinner} />
        )}
      </TouchableOpacity>
    );
  }, [hasTodayEntry, handleCreateToday, colors, isCreating]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isEmpty = listData.length <= 1;

  return (
    <SafeAreaView
      edges={[]}
      style={[
        styles.container,
        { backgroundColor: colors.background },
        isTablet && {
          maxWidth: maxContentWidth,
          alignSelf: 'center',
          width: '100%',
        },
      ]}
    >
      <View style={{ paddingTop: headerHeight }}>
        <ScreenHeader
          title="Journal"
          actions={
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.surface }]}
              onPress={() => {
                HapticService.light();
                setShowDatePicker(true);
              }}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          }
        />
      </View>

      {isEmpty && (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Start your journal
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Capture your thoughts, one day at a time
          </Text>
          <TouchableOpacity
            style={[styles.emptyCta, { backgroundColor: colors.primary }]}
            onPress={handleCreateToday}
            activeOpacity={0.7}
            disabled={isCreating}
          >
            <Text style={styles.emptyCtaText}>Write today's entry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isEmpty && (
        <FlashList
          ref={listRef}
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
          ListHeaderComponent={renderEmptyTodayPrompt}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}

      {!isEmpty && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={handleCreateToday}
          activeOpacity={0.7}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="add" size={28} color="#fff" />
          )}
        </TouchableOpacity>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display="default"
          onChange={handlePickDate}
          maximumDate={new Date()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  todayPromptText: {
    fontSize: 15,
    fontWeight: '500',
  },
  creatingSpinner: {
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyCta: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCtaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
