import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Modal } from './ui';
import { useRepoStore } from '../stores/repoStore';
import { GIT_HOST_LABELS } from '../services/git/GitHost';
import { useAccounts } from '../contexts/AccountsContext';
import { RepoAccessPreflightError } from '../services/git/repoAccessPreflight';

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
  onAdded?: (path: string, hostId: string) => void;
  colors: ThemeColors;
}

function pathExampleFor(provider: string): string {
  return provider === 'gitlab' ? 'namespace/project' : 'owner/repo';
}

export function AddRepoModal({ visible, onClose, onAdded, colors }: AddRepoModalProps) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const { spacing, type } = tokens;
  const addRepository = useRepoStore((s) => s.addRepository);
  const { accountSummaries } = useAccounts();

  const allHosts = useMemo(() => {
    return accountSummaries.flatMap((summary) =>
      summary.hosts.map((host) => ({
        ...host,
        accountLogin: summary.account.login,
      })),
    );
  }, [accountSummaries]);

  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [path, setPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (visible) {
      if (allHosts.length === 1) {
        setSelectedHostId(allHosts[0].id);
      } else {
        setSelectedHostId(null);
      }
      setPath('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const selectedHost = useMemo(
    () => allHosts.find((h) => h.id === selectedHostId) ?? null,
    [allHosts, selectedHostId],
  );

  const isValid = useMemo(() => /^\S+\/\S+$/.test(path.trim()), [path]);

  const canSubmit = useMemo(
    () => isValid && selectedHostId !== null && !isSubmitting,
    [isValid, selectedHostId, isSubmitting],
  );

  const handleAdd = useCallback(async () => {
    if (!selectedHost) {
      Alert.alert(t('settings.repositoryAccessTitle'), t('settings.selectHostManually'));
      return;
    }
    const trimmed = path.trim();
    if (!isValid) {
      Alert.alert(
        t('addRepo.invalidTitle'),
        t('addRepo.invalidBody', { example: pathExampleFor(selectedHost.provider) }),
      );
      return;
    }
    const attemptAdd = async (allowUnverifiedWrite: boolean): Promise<void> => {
      setIsSubmitting(true);
      try {
        const repo = allowUnverifiedWrite
          ? await addRepository(trimmed, undefined, selectedHost.provider, { allowUnverifiedWrite: true }, selectedHost.id)
          : await addRepository(trimmed, undefined, selectedHost.provider, undefined, selectedHost.id);
        onAdded?.(repo.path, selectedHost.id);
        setPath('');
        onClose();
      } catch (error) {
        if (error instanceof RepoAccessPreflightError && error.canRetry && !allowUnverifiedWrite) {
          Alert.alert(
            'Write access not verified',
            'Write access not verified. This repository may be read-only. Add anyway?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Add anyway', onPress: () => void attemptAdd(true) },
            ],
          );
          return;
        }
        Alert.alert(
          t('addRepo.failedTitle'),
          error instanceof Error ? error.message : t('addRepo.failedBody'),
        );
      } finally {
        setIsSubmitting(false);
      }
    };
    await attemptAdd(false);
  }, [addRepository, path, isValid, selectedHost, onAdded, onClose, t]);

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

      {allHosts.length === 0 ? (
        <View style={{ paddingVertical: spacing[4] }}>
          <Text style={{ color: colors.textSecondary, fontSize: type.sm, textAlign: 'center' }}>
            {t('addRepo.noHostsConnected', 'No hosts connected. Add an account first.')}
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ color: colors.textSecondary, fontSize: type.sm, marginBottom: spacing[2] }}>
            {t('addRepo.hostLabel', 'Host')}
          </Text>
          <View style={{ marginBottom: spacing[3], gap: spacing[1] }}>
            {allHosts.map((host) => {
              const isSelected = selectedHostId === host.id;
              const hostLabel = host.instanceBaseUrl
                ? `${GIT_HOST_LABELS[host.provider]} · ${new URL(host.instanceBaseUrl).hostname} (${host.hostLogin})`
                : `${GIT_HOST_LABELS[host.provider]} · ${host.hostLogin}`;
              return (
                <TouchableOpacity
                  key={host.id}
                  onPress={() => setSelectedHostId(isSelected ? null : host.id)}
                  testID={`add-repo-host-${host.id}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: spacing[2],
                    paddingHorizontal: spacing[3],
                    borderRadius: 12,
                    gap: spacing[2],
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary + '12' : colors.surface,
                  }}
                >
                  <Ionicons
                    name={host.provider === 'github' ? 'logo-github' : 'git-branch'}
                    size={16}
                    color={isSelected ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: type.sm,
                      fontWeight: '500',
                      color: isSelected ? colors.primary : colors.text,
                    }}
                    numberOfLines={1}
                  >
                    {hostLabel}
                  </Text>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <Text style={{ color: colors.textSecondary, fontSize: type.sm, marginBottom: spacing[2] }}>
        {t('addRepo.pathLabel', { example: selectedHost ? pathExampleFor(selectedHost.provider) : 'owner/repo' })}
      </Text>
      <TextInput
        value={path}
        onChangeText={setPath}
        placeholder={selectedHost ? pathExampleFor(selectedHost.provider) : 'owner/repo'}
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
          disabled={!canSubmit}
          testID="add-repo-submit"
          style={{
            flex: 1,
            paddingVertical: spacing[3],
            borderRadius: 12,
            alignItems: 'center',
            backgroundColor: canSubmit ? colors.primary : colors.surface,
            borderWidth: 1,
            borderColor: canSubmit ? colors.primary : colors.border,
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          <Text
            style={{
              color: canSubmit ? '#fff' : colors.textSecondary,
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
