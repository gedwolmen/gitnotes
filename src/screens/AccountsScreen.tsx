import React, { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAccounts } from '../contexts/AccountsContext';
import type { GitHostProvider } from '../services/git/GitHost';
import { GIT_HOST_LABELS } from '../services/git/GitHost';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ConnectHostModal } from '../components/ConnectHostModal';
import { useTokens } from '../contexts/ThemeContext';

/**
 * Per-account detail screen. Lets users:
 *   - Add a new host connection to this account.
 *   - Disconnect an existing host (with confirmation).
 *   - Remove the whole account (and all its host connections).
 *   - Switch the active host.
 */
export function AccountsScreen({ route, navigation }: {
  route: { params: { accountId: string } };
  navigation: { goBack: () => void };
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { spacing } = useTokens();
  const {
    accountSummaries,
    switchToHost,
    disconnectHost,
    removeAccount,
  } = useAccounts();

  const summary = accountSummaries.find((s) => s.account.id === route.params.accountId);
  const [showConnect, setShowConnect] = useState(false);
  const [presetProvider, setPresetProvider] = useState<GitHostProvider | undefined>(undefined);

  const handleAddHost = useCallback((provider?: GitHostProvider) => {
    setPresetProvider(provider);
    setShowConnect(true);
  }, []);

  const handleDisconnect = useCallback(
    (hostId: string, label: string) => {
      Alert.alert(
        t('accounts.disconnectTitle'),
        t('accounts.disconnectBody', { label }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('accounts.disconnect'),
            style: 'destructive',
            onPress: () => {
              void disconnectHost(hostId);
            },
          },
        ],
      );
    },
    [disconnectHost, t],
  );

  const handleRemoveAccount = useCallback(() => {
    if (!summary) return;
    Alert.alert(
      t('accounts.removeTitle'),
      t('accounts.removeBody', { login: summary.account.login }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('accounts.removeAccount'),
          style: 'destructive',
          onPress: () => {
            void removeAccount(summary.account.id).then(() => navigation.goBack());
          },
        },
      ],
    );
  }, [navigation, removeAccount, summary, t]);

  if (!summary) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title={t('accounts.title')} />
        <View style={{ padding: spacing[4] }}>
          <Text style={{ color: colors.textSecondary }}>{t('accounts.notFound')}</Text>
        </View>
      </View>
    );
  }

  const hostLabel = (h: { provider: GitHostProvider; instanceBaseUrl: string | null; hostLogin: string }) =>
    h.instanceBaseUrl
      ? `${GIT_HOST_LABELS[h.provider]} · ${h.instanceBaseUrl} (${h.hostLogin})`
      : `${GIT_HOST_LABELS[h.provider]} · ${h.hostLogin}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={summary.account.login} />
      <ScrollView contentContainerStyle={{ padding: spacing[4] }}>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing[2] }}>
          {t('accounts.connectedHosts')}
        </Text>
        {summary.hosts.length === 0 ? (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing[4],
              marginBottom: spacing[3],
            }}
          >
            <Text style={{ color: colors.textSecondary, marginBottom: spacing[3] }}>
              {t('accounts.noHosts')}
            </Text>
            <TouchableOpacity
              onPress={() => handleAddHost()}
              testID="accounts.add-host"
              style={{
                paddingVertical: spacing[3],
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: colors.primary,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                {t('accounts.connectFirstHost')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          summary.hosts.map((host) => {
            const isActive = host.id === summary.activeHostId;
            return (
              <View
                key={host.id}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing[3],
                  marginBottom: spacing[2],
                  backgroundColor: isActive ? colors.primary + '12' : 'transparent',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {isActive ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={18} color={colors.textSecondary} />
                  )}
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: '600',
                      marginLeft: spacing[2],
                      flex: 1,
                    }}
                  >
                    {hostLabel(host)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', marginTop: spacing[3], gap: spacing[2] }}>
                  {!isActive ? (
                    <TouchableOpacity
                      onPress={() => void switchToHost(host.id)}
                      testID={`accounts.switch-${host.id}`}
                      style={{
                        flex: 1,
                        paddingVertical: spacing[2],
                        borderRadius: 12,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: colors.primary,
                      }}
                    >
                      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                        {t('accounts.switchTo')}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        paddingVertical: spacing[2],
                        borderRadius: 12,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                        {t('accounts.active')}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDisconnect(host.id, hostLabel(host))}
                    testID={`accounts.disconnect-${host.id}`}
                    style={{
                      flex: 1,
                      paddingVertical: spacing[2],
                      borderRadius: 12,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                      {t('accounts.disconnect')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {summary.hosts.length > 0 ? (
          <TouchableOpacity
            onPress={() => handleAddHost()}
            testID="accounts.add-another-host"
            style={{
              paddingVertical: spacing[3],
              borderRadius: 12,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: spacing[4],
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
              {t('accounts.addAnotherHost')}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            marginTop: spacing[2],
            paddingTop: spacing[4],
          }}
        >
          <TouchableOpacity
            onPress={handleRemoveAccount}
            testID="accounts.remove-account"
            style={{
              paddingVertical: spacing[3],
              borderRadius: 12,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.error,
            }}
          >
            <Text style={{ color: colors.error, fontSize: 14, fontWeight: '600' }}>
              {t('accounts.removeAccount')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ConnectHostModal
        visible={showConnect}
        onClose={() => setShowConnect(false)}
        presetProvider={presetProvider}
        accountId={summary.account.id}
        colors={colors}
      />
    </View>
  );
}
