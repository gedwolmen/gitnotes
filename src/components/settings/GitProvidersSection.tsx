import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Group, GroupRow, Modal } from '../ui';
import {
  useHostAuth,
  useHostProvidersOrder,
  type HostAuthState,
} from '../../contexts/HostAuthContext';
import { GIT_HOST_API_BASES, GIT_HOST_LABELS, type GitHostProvider } from '../../services/git/GitHost';
import { settingsStyles as styles } from './settingsStyles';

type ThemeColors = {
  text: string;
  textSecondary: string;
  primary: string;
  surface: string;
  border: string;
  error: string;
  background: string;
};

interface GitProvidersSectionProps {
  colors: ThemeColors;
}

function providerIcon(provider: GitHostProvider): keyof typeof Ionicons.glyphMap {
  switch (provider) {
    case 'github':
      return 'logo-github';
    case 'gitlab':
      return 'git-branch-outline';
    case 'gitea':
      return 'server-outline';
    case 'forgejo':
      return 'git-network-outline';
  }
}

function allowsBaseUrl(provider: GitHostProvider): boolean {
  return provider !== 'github';
}

function defaultBaseUrl(provider: GitHostProvider): string {
  return GIT_HOST_API_BASES[provider];
}

export function GitProvidersSection({ colors }: GitProvidersSectionProps) {
  const { t } = useTranslation();
  const { hosts, status, setToken, clearToken } = useHostAuth();
  const order = useHostProvidersOrder();
  const [editing, setEditing] = useState<GitHostProvider | null>(null);

  const ready = status === 'ready';

  const onPressConnect = useCallback(
    (provider: GitHostProvider) => setEditing(provider),
    [],
  );

  const onPressDisconnect = useCallback(
    (provider: GitHostProvider, login: string | null) => {
      Alert.alert(
        t('gitProviders.disconnectTitle', { host: GIT_HOST_LABELS[provider] }),
        t('gitProviders.disconnectBody', { host: GIT_HOST_LABELS[provider], login: login ?? '' }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('gitProviders.disconnect'),
            style: 'destructive',
            onPress: () => void clearToken(provider),
          },
        ],
      );
    },
    [clearToken, t],
  );

  return (
    <>
      <Group title={t('gitProviders.title')} footer={t('gitProviders.footer')}>
        {order.map((provider) => (
          <ProviderRow
            key={provider}
            host={hosts[provider]}
            ready={ready}
            colors={colors}
            onConnect={onPressConnect}
            onDisconnect={onPressDisconnect}
          />
        ))}
      </Group>

      <ProviderEditModal
        visible={editing !== null}
        provider={editing}
        onClose={() => setEditing(null)}
        colors={colors}
        setToken={setToken}
      />
    </>
  );
}

interface ProviderRowProps {
  host: HostAuthState;
  ready: boolean;
  colors: ThemeColors;
  onConnect: (provider: GitHostProvider) => void;
  onDisconnect: (provider: GitHostProvider, login: string | null) => void;
}

function ProviderRow({
  host,
  ready,
  colors,
  onConnect,
  onDisconnect,
}: ProviderRowProps) {
  const trailing = useMemo(() => {
    if (!ready) {
      return (
        <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
          …
        </Text>
      );
    }
    if (host.isAuthenticated && host.user) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={[styles.settingValue, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {host.user.login}
          </Text>
          <TouchableOpacity
            testID={`git-providers.disconnect-${host.provider}`}
            onPress={() => onDisconnect(host.provider, host.user?.login ?? null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
          —
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </View>
    );
  }, [ready, host, colors, onDisconnect]);

  return (
    <GroupRow
      testID={`git-providers.row-${host.provider}`}
      onPress={() => onConnect(host.provider)}
      leading={
        <Ionicons
          name={providerIcon(host.provider)}
          size={20}
          color={colors.text}
        />
      }
      trailing={trailing}
    >
      <Text style={[styles.settingLabel, { color: colors.text }]}>
        {host.label}
      </Text>
      {host.baseUrl && host.provider !== 'github' ? (
        <Text
          style={[styles.settingValue, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {host.baseUrl}
        </Text>
      ) : null}
    </GroupRow>
  );
}

interface ProviderEditModalProps {
  visible: boolean;
  provider: GitHostProvider | null;
  onClose: () => void;
  colors: ThemeColors;
  setToken: (
    provider: GitHostProvider,
    token: string,
    baseUrl?: string,
  ) => Promise<{ login: string } | null>;
}

function ProviderEditModal({
  visible,
  provider,
  onClose,
  colors,
  setToken,
}: ProviderEditModalProps) {
  const { t } = useTranslation();
  const [token, setTokenInput] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (visible && provider) {
      setTokenInput('');
      setBaseUrl(allowsBaseUrl(provider) ? defaultBaseUrl(provider) : '');
    }
  }, [visible, provider]);

  const showBaseUrl = provider !== null && allowsBaseUrl(provider);
  const canSubmit = !!provider && token.trim().length > 0 && !isSubmitting;

  const handleSubmit = useCallback(async () => {
    if (!provider) return;
    setIsSubmitting(true);
    try {
      const user = await setToken(
        provider,
        token.trim(),
        showBaseUrl ? baseUrl.trim() || undefined : undefined,
      );
      if (!user) {
        Alert.alert(
          t('gitProviders.invalidTokenTitle'),
          t('gitProviders.invalidTokenBody'),
        );
        return;
      }
      onClose();
    } catch (error) {
      Alert.alert(
        t('gitProviders.failedTitle'),
        error instanceof Error ? error.message : t('gitProviders.failedBody'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [provider, setToken, token, baseUrl, showBaseUrl, onClose, t]);

  if (!provider) return null;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      bottomSheet
      contentStyle={{ padding: 16, paddingBottom: 34, backgroundColor: colors.background }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>
          {t('gitProviders.connectTitle', { host: GIT_HOST_LABELS[provider] })}
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>
        {t('gitProviders.tokenLabel')}
      </Text>
      <TextInput
        value={token}
        onChangeText={setTokenInput}
        placeholder={t('gitProviders.tokenPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        testID="git-providers.token-input"
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 12,
          color: colors.text,
          backgroundColor: colors.surface,
          fontSize: 14,
        }}
      />

      {showBaseUrl ? (
        <>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 13,
              marginBottom: 8,
              marginTop: 16,
            }}
          >
            {t('gitProviders.baseUrlLabel')}
          </Text>
          <TextInput
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder={defaultBaseUrl(provider)}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            testID="git-providers.base-url-input"
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: colors.text,
              backgroundColor: colors.surface,
              fontSize: 14,
            }}
          />
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12,
              marginTop: 6,
            }}
          >
            {t('gitProviders.baseUrlHelp', { host: GIT_HOST_LABELS[provider] })}
          </Text>
        </>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          marginTop: 24,
        }}
      >
        <TouchableOpacity
          onPress={onClose}
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
            {t('common.cancel')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          testID="git-providers.submit"
          style={{
            flex: 1,
            paddingVertical: 12,
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
              fontSize: 14,
              fontWeight: '600',
            }}
          >
            {t('gitProviders.connect')}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default GitProvidersSection;