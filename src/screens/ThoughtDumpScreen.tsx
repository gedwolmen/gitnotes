import { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { useTokens } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { ThoughtDumpService } from '../services/ThoughtDumpService';
import { ThoughtDump } from '../models/ThoughtDump';
import { ScreenHeader, Button, Input, EmptyState, Modal } from '../components/ui';
import { useScreenHeaderHeight } from '../components/ui';
import { indexDump, removeDump } from '../services/ai/thoughtDumpIndexing';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  onDumpChange?: (dump: ThoughtDump) => void;
}

export default function ThoughtDumpScreen({ onDumpChange }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { colors, spacing } = useTokens();
  const headerHeight = useScreenHeaderHeight();

  const [text, setText] = useState('');
  const [dumps, setDumps] = useState<ThoughtDump[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ThoughtDump | null>(null);

  const loadDumps = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await ThoughtDumpService.list();
      setDumps(result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch {
      // silently handled
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDumps();
  }, [loadDumps]);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setIsSaving(true);
    try {
      const dump = await ThoughtDumpService.create(trimmed);
      if (dump) {
        setText('');
        setDumps((prev) => [dump, ...prev]);
        indexDump(dump);
        onDumpChange?.(dump);
      } else {
        Alert.alert(t('common.error'), t('thoughtDump.error'));
      }
    } catch {
      Alert.alert(t('common.error'), t('thoughtDump.error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);

    try {
      const success = await ThoughtDumpService.delete(target.id, {
        repoPath: '',
        filePath: target.filePath,
      });
      if (success) {
        setDumps((prev) => prev.filter((d) => d.id !== target.id));
        removeDump(target.filePath);
        onDumpChange?.(target);
      } else {
        Alert.alert(t('common.error'), t('thoughtDump.error'));
      }
    } catch {
      Alert.alert(t('common.error'), t('thoughtDump.error'));
    }
  };

  const formatRelativeDate = (isoDate: string): string => {
    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return t('thoughtDump.justNow');
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHr < 24) return `${diffHr}h`;
    return `${diffDay}d`;
  };

  const renderItem = useCallback(
    ({ item }: { item: ThoughtDump }) => (
      <View style={[styles.dumpItem, { padding: spacing[3], marginBottom: spacing[2], backgroundColor: colors.surface }]}>
        <Text style={[styles.dumpText, { color: colors.text }]} numberOfLines={6}>
          {item.text}
        </Text>
        <View style={[styles.dumpFooter, { marginTop: spacing[2] }]}>
          <Text style={[styles.dumpDate, { color: colors.textSecondary }]}>
            {formatRelativeDate(item.createdAt)}
          </Text>
          <Button
            testID={`thought-dump-delete-${item.id}`}
            label={t('thoughtDump.delete')}
            variant="ghost"
            onPress={() => setDeleteTarget(item)}
          />
        </View>
      </View>
    ),
    [colors, spacing, t],
  );

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon="bulb"
        title={t('thoughtDump.empty')}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <View style={{ flex: 1, paddingTop: headerHeight }}>
        <View style={[styles.composer, { padding: spacing[4] }]}>
          <Input
            testID="thought-dump-input"
            multiline
            value={text}
            onChangeText={setText}
            placeholder={t('thoughtDump.placeholder')}
            placeholderTextColor={colors.textSecondary}
            multilineMinHeight={100}
          />
          <View style={{ marginTop: spacing[2] }}>
            <Button
              testID="thought-dump-save"
              label={t('thoughtDump.save')}
              variant="primary"
              onPress={handleSave}
              disabled={isSaving || text.trim().length === 0}
              fullWidth
            />
          </View>
        </View>

        <FlatList
          data={dumps}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing[3], paddingBottom: spacing[6] }}
          ListEmptyComponent={renderEmpty}
        />
      </View>

      <Modal
        visible={deleteTarget !== null}
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View style={{ padding: spacing[4] }}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {t('thoughtDump.confirmDelete')}
          </Text>
          <View style={[styles.modalActions, { marginTop: spacing[4] }]}>
            <Button
              testID="thought-dump-cancel-delete"
              label={t('common.cancel')}
              variant="secondary"
              onPress={() => setDeleteTarget(null)}
            />
            <View style={{ marginLeft: spacing[2] }}>
              <Button
                testID="thought-dump-confirm-delete"
                label={t('common.delete')}
                variant="primary"
                onPress={handleDeleteConfirm}
              />
            </View>
          </View>
        </View>
      </Modal>

      <ScreenHeader
        title={t('thoughtDump.title')}
        onBack={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  composer: {},
  dumpItem: {
    borderRadius: 8,
  },
  dumpText: {
    fontSize: 15,
    lineHeight: 22,
  },
  dumpFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dumpDate: {
    fontSize: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
