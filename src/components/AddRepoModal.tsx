import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Modal } from './ui';
import { useRepoStore } from '../stores/repoStore';
import type { GitHostProvider } from '../services/git/GitHost';
import { GIT_HOST_LABELS } from '../services/git/GitHost';
import { useAccounts } from '../contexts/AccountsContext';

type ThemeColors = {
  background: string;
  surface: string;
  primary: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
};

interface AddRepoModalProps {
  visible: boolean;
  onClose: () => void;
  onAdded?: (path: string, provider: GitHostProvider) => void;
  colors: ThemeColors;
}

const ALL_PROVIDERS: GitHostProvider[] = ['github', 'gitlab', 'gitea', 'forgejo'];

function pathExampleFor(provider: GitHostProvider): string {
  return provider === 'gitlab' ? 'namespace/project' : 'owner/repo';
}

/**
 * Minimal add-repository dialog that lets the user pick a host and enter
 * a `namespace/project` path. The host choice is purely about which REST
 * API we'll talk to in API mode; the underlying git protocol is host
 * agnostic, so a clone-mode workflow works for either.
 */
export function AddRepoModal({ visible, onClose, onAdded, colors }: AddRepoModalProps) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const { spacing, type } = tokens;
  const addRepository = useRepoStore((s) => s.addRepository);
  const { accountSummaries, activeHostId } = useAccounts();

  const availableProviders = useMemo<GitHostProvider[]>(() => {
    const providers = new Set<GitHostProvider>();
    for (const summary of accountSummaries) {
      for (const host of summary.hosts) providers.add(host.provider);
    }
    // Empty-state default: show every provider so the picker still serves as
    // an entry point to add a connection.
    if (providers.size === 0) return ALL_PROVIDERS;
    return Array.from(providers);
  }, [accountSummaries]);

  const initialProvider: GitHostProvider = useMemo(() => {
    const active = accountSummaries
      .flatMap((s) => s.hosts.map((h) => ({ host: h, account: s.account })))
      .find((entry) => entry.host.id === activeHostId);
    return active?.host.provider ?? availableProviders[0] ?? 'github';
  }, [accountSummaries, activeHostId, availableProviders]);

  const [provider, setProvider] = useState<GitHostProvider>(initialProvider);
  const [path, setPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync the picker with the active host when the modal re-opens or the
  // connection state changes underneath.
  React.useEffect(() => {
    if (visible) {
      setProvider(initialProvider);
      setPath('');
    }
     
  }, [visible, initialProvider]);

  const hasTokenForProvider = useMemo(() => {
    return accountSummaries.some((summary) =>
      summary.hosts.some((host) => host.provider === provider),
    );
  }, [accountSummaries, provider]);

  const isValid = useMemo(() => /^\S+\/\S+$/.test(path.trim()), [path]);

  const handleAdd = useCallback(async () => {
    const trimmed = path.trim();
    if (!isValid) {
      Alert.alert(
        t('addRepo.invalidTitle'),
        t('addRepo.invalidBody', { example: pathExampleFor(provider) }),
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const repo = await addRepository(trimmed, undefined, provider);
      onAdded?.(repo.path, provider);
      setPath('');
      onClose();
      if (!hasTokenForProvider) {
        // Soft warning: the repo is recorded but syncing will need a token
        // for the matching host before writes succeed.
        Alert.alert(
          t('addRepo.noHostTitle') ?? 'No host connected',
          (t('addRepo.noHostBody', { provider: GIT_HOST_LABELS[provider] }) ??
            `Connect a ${GIT_HOST_LABELS[provider]} account before syncing ${GIT_HOST_LABELS[provider]} repositories.`) as string,
        );
      }
    } catch (error) {
      Alert.alert(
        t('addRepo.failedTitle'),
        error instanceof Error ? error.message : t('addRepo.failedBody'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [addRepository, path, isValid, provider, onAdded, onClose, t, hasTokenForProvider]);

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      bottomSheet
      contentStyle={{ padding: 16, paddingBottom: 34, backgroundColor: colors.background }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: type.lg ?? 18, fontWeight: '600', color: colors.text }}>
          {t('addRepo.title')}
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={{ color: colors.textSecondary, fontSize: type.sm, marginBottom: spacing[2] }}>
        {t('addRepo.providerLabel')}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] }}>
        {availableProviders.map((p) => {
          const isSelected = provider === p;
          return (
            <TouchableOpacity
              key={p}
              onPress={() => setProvider(p)}
              testID={`add-repo-provider-${p}`}
              style={{
                flex: 1,
                paddingVertical: spacing[3],
                borderRadius: 12,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.primary + '12' : colors.surface,
              }}
            >
              <Text
                style={{
                  color: isSelected ? colors.primary : colors.text,
                  fontSize: type.sm,
                  fontWeight: '600',
                }}
              >
                {GIT_HOST_LABELS[p]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ color: colors.textSecondary, fontSize: type.sm, marginBottom: spacing[2] }}>
        {t('addRepo.pathLabel', { example: pathExampleFor(provider) })}
      </Text>
      <TextInput
        value={path}
        onChangeText={setPath}
        placeholder={pathExampleFor(provider)}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        testID="add-repo-path-input"
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[3],
          color: colors.text,
          backgroundColor: colors.surface,
          fontSize: type.sm,
        }}
      />

      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[4] }}>
        <TouchableOpacity
          onPress={onClose}
          style={{
            flex: 1,
            paddingVertical: spacing[3],
            borderRadius: 12,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, fontSize: type.sm, fontWeight: '600' }}>
            {t('common.cancel')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleAdd}
          disabled={!isValid || isSubmitting}
          testID="add-repo-submit"
          style={{
            flex: 1,
            paddingVertical: spacing[3],
            borderRadius: 12,
            alignItems: 'center',
            backgroundColor: isValid && !isSubmitting ? colors.primary : colors.surface,
            borderWidth: 1,
            borderColor: isValid && !isSubmitting ? colors.primary : colors.border,
            opacity: isValid && !isSubmitting ? 1 : 0.6,
          }}
        >
          <Text
            style={{
              color: isValid && !isSubmitting ? '#fff' : colors.textSecondary,
              fontSize: type.sm,
              fontWeight: '600',
            }}
          >
            {t('common.add')}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
