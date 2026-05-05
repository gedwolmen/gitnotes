import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../contexts/ThemeContext';
import { useRepos } from '../contexts/RepoContext';
import { useRenderStyleStore } from '../stores/renderStyleStore';
import { RenderStyleService, DiscoveredBinding } from '../services/RenderStyleService';
import { RENDER_FORMATS, formatLabel } from '../types/RenderStyle';
import { GitHubService } from '../services/GitHubService';
import { Chip } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'RenderStyleSettings'>;

export default function RenderStyleSettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { repositories } = useRepos();
  const binding = useRenderStyleStore((s) => s.binding);
  const settings = useRenderStyleStore((s) => s.settings);
  const isLoading = useRenderStyleStore((s) => s.isLoading);
  const setBinding = useRenderStyleStore((s) => s.setBinding);
  const error = useRenderStyleStore((s) => s.error);

  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredBinding[]>([]);

  useEffect(() => {
    if (!showRepoPicker || !GitHubService.isAuthenticated()) return;
    setDiscovering(true);
    void RenderStyleService.discoverExisting()
      .then(setDiscovered)
      .finally(() => setDiscovering(false));
  }, [showRepoPicker]);

  const handlePickRepo = useCallback(
    async (owner: string, name: string, branch: string) => {
      await setBinding({ owner, name, branch });
      setShowRepoPicker(false);
    },
    [setBinding],
  );

  const handleClearBinding = useCallback(() => {
    Alert.alert(
      'Disconnect render styles repo?',
      'Render styles will reset to theme defaults until you re-bind a repo. The settings/render.json file in the repo is left untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => void setBinding(null) },
      ],
    );
  }, [setBinding]);

  const overrideCount = useMemo(
    () => Object.values(settings.formats).filter(Boolean).length,
    [settings],
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Note rendering</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Storage</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          {binding ? (
            <>
              <View style={styles.row}>
                <Ionicons name="cloud-outline" size={18} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>{binding.owner}/{binding.name}</Text>
                  <Text style={[styles.rowSubLabel, { color: colors.textSecondary }]}>
                    settings/render.json on {binding.branch}
                  </Text>
                </View>
                {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
              </View>
              <TouchableOpacity style={styles.row} onPress={() => setShowRepoPicker(true)}>
                <Ionicons name="repeat" size={18} color={colors.primary} />
                <Text style={[styles.rowLabel, { color: colors.primary }]}>Change repo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.row} onPress={handleClearBinding}>
                <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                <Text style={[styles.rowLabel, { color: colors.error }]}>Disconnect</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.row} onPress={() => setShowRepoPicker(true)}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.rowLabel, { color: colors.primary }]}>Pick a repo for render styles</Text>
            </TouchableOpacity>
          )}
          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            Styles persist to {binding ? `${binding.owner}/${binding.name}/settings/render.json` : 'a repo of your choice'} so they sync across devices. Active overrides: {overrideCount}.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Formats</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          {RENDER_FORMATS.map((fmt) => {
            const hasOverrides = !!settings.formats[fmt] && Object.keys(settings.formats[fmt] ?? {}).length > 0;
            const isBeta = fmt === 'neorg';
            return (
              <TouchableOpacity
                key={fmt}
                style={[styles.formatRow, { borderBottomColor: colors.border }]}
                onPress={() => navigation.navigate('RenderStyleEditor', { format: fmt })}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>{formatLabel(fmt)}</Text>
                    {isBeta ? <Chip label="BETA" /> : null}
                  </View>
                  <Text style={[styles.rowSubLabel, { color: colors.textSecondary }]}>
                    {hasOverrides ? 'Custom overrides applied' : 'Theme defaults'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.helperText, { color: colors.textSecondary, paddingHorizontal: 16 }]}>
          Tip: pick the same repo where you store notes so render styles travel with the content.
        </Text>
      </ScrollView>

      {showRepoPicker ? (
        <RepoPickerSheet
          repositories={repositories.map((r) => ({ owner: r.path.split('/')[0] ?? '', name: r.path.split('/')[1] ?? r.name, label: r.path }))}
          discovered={discovered}
          discovering={discovering}
          onClose={() => setShowRepoPicker(false)}
          onSelect={(owner, name, branch) => handlePickRepo(owner, name, branch)}
        />
      ) : null}
    </SafeAreaView>
  );
}

interface RepoChoice {
  owner: string;
  name: string;
  label: string;
}

interface RepoPickerProps {
  repositories: RepoChoice[];
  discovered: DiscoveredBinding[];
  discovering: boolean;
  onClose: () => void;
  onSelect: (owner: string, name: string, branch: string) => void;
}

function RepoPickerSheet(props: RepoPickerProps) {
  const { repositories, discovered, discovering, onClose, onSelect } = props;
  const { colors } = useTheme();

  return (
    <View style={[styles.sheetOverlay, { backgroundColor: colors.background + 'cc' }]}>
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Pick a repo</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {discovering ? (
            <View style={styles.discoveringRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.rowSubLabel, { color: colors.textSecondary }]}>Scanning for existing settings/render.json…</Text>
            </View>
          ) : null}

          {discovered.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 12 }]}>
                {discovered.length === 1 ? 'Existing render styles repo found' : `${discovered.length} repos already host render styles`}
              </Text>
              {discovered.map((d) => (
                <TouchableOpacity
                  key={`${d.owner}/${d.name}`}
                  style={[styles.formatRow, { borderBottomColor: colors.border }]}
                  onPress={() => onSelect(d.owner, d.name, d.branch)}
                >
                  <Ionicons name="cloud-done-outline" size={18} color={colors.primary} />
                  <Text style={[styles.rowLabel, { color: colors.text, flex: 1, marginLeft: 8 }]}>{d.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </>
          ) : null}

          <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 16 }]}>Your repos</Text>
          {repositories.length === 0 ? (
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              Add a repo from Settings → Repositories first.
            </Text>
          ) : (
            repositories.map((r) => (
              <TouchableOpacity
                key={`${r.owner}/${r.name}`}
                style={[styles.formatRow, { borderBottomColor: colors.border }]}
                onPress={() => onSelect(r.owner, r.name, 'main')}
              >
                <Ionicons name="git-branch-outline" size={18} color={colors.text} />
                <Text style={[styles.rowLabel, { color: colors.text, flex: 1, marginLeft: 8 }]}>{r.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scrollContent: { paddingBottom: 32 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  section: { borderRadius: 12, marginHorizontal: 12, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  formatRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSubLabel: { fontSize: 12, marginTop: 2 },
  helperText: { fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  error: { fontSize: 12, paddingHorizontal: 16, paddingTop: 4 },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, maxHeight: '80%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 16, fontWeight: '600' },
  discoveringRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
});
