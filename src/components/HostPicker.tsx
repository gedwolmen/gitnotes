import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { Surface } from './ui/Surface';
import { Input } from './ui/Input';
import { useTokens } from '../contexts/ThemeContext';
import { getAdapter } from '../services/git/hostAdapters';
import { TYPE } from '../theme/tokens';
import type { GitHostKind } from '../services/git/hostAdapters';

export interface HostPickerValue {
  hostKind: GitHostKind;
  /**
   * `undefined` for github.com (the canonical default). Required
   * for self-hosted Gitea / GitLab and for GitHub Enterprise —
   * the component shows a validation hint when the host requires
   * a baseUrl and the field is empty.
   */
  baseUrl: string | undefined;
}

export interface HostPickerProps {
  value: HostPickerValue;
  onChange: (next: HostPickerValue) => void;
  /**
   * Whether to include the GitHub.com option. Defaults to true.
   * Set false in flows that only support self-hosted (e.g. a
   * "connect enterprise" wizard) — saves a tap.
   */
  showGitHub?: boolean;
  testID?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

const HOST_KINDS: { kind: GitHostKind; label: string; needsBaseUrl: boolean }[] = [
  { kind: 'github', label: 'GitHub', needsBaseUrl: false },
  { kind: 'gitea', label: 'Gitea', needsBaseUrl: true },
  { kind: 'gitlab', label: 'GitLab', needsBaseUrl: true },
];

/**
 * Reusable control for picking a Git host kind and (for
 * self-hosted) a base URL. Used by the repo-add flow
 * (Phase D2.2) and the per-repo settings screen
 * (Phase D2.3) so the two surfaces stay in lock-step.
 *
 * The control is intentionally minimal: a segmented row of
 * host kinds (with the project's existing `Surface` for
 * segmented-control styling) and a conditional `Input` for
 * the baseUrl. Haptics fire on each host-kind tap so the
 * user gets tactile feedback when the baseUrl field appears
 * or disappears.
 *
 * The host kind buttons read their `displayName()` from the
 * adapter factory so the labels stay in sync with the
 * adapter (e.g. if we add a "Forgejo" alias later, this
 * picker picks it up automatically).
 */
export function HostPicker(props: HostPickerProps) {
  const { value, onChange, showGitHub = true, testID, containerStyle } = props;
  const { colors, spacing } = useTokens();

  const visibleKinds = useMemo(
    () => (showGitHub ? HOST_KINDS : HOST_KINDS.filter((k) => k.kind !== 'github')),
    [showGitHub],
  );

  const selected = useMemo(
    () => HOST_KINDS.find((k) => k.kind === value.hostKind) ?? HOST_KINDS[0],
    [value.hostKind],
  );
  const needsBaseUrl = selected.needsBaseUrl;
  const baseUrlEmpty = !value.baseUrl || value.baseUrl.trim().length === 0;

  const onSelectKind = useCallback(
    (kind: GitHostKind) => {
      const next = HOST_KINDS.find((k) => k.kind === kind)!;
      // When the user toggles to a host that needs a baseUrl
      // and the previous baseUrl was empty, leave it empty so
      // the field's placeholder shows. When the previous
      // baseUrl was non-empty, keep it (the user might be
      // switching from Gitea to GitLab on the same host).
      onChange({ hostKind: kind, baseUrl: next.needsBaseUrl ? value.baseUrl : undefined });
    },
    [onChange, value.baseUrl],
  );

  const onChangeBaseUrl = useCallback(
    (text: string) => {
      onChange({ hostKind: value.hostKind, baseUrl: text.trim() || undefined });
    },
    [onChange, value.hostKind],
  );

  return (
    <View style={containerStyle}>
      <View
        style={{
          flexDirection: 'row',
          gap: spacing[2],
          marginBottom: spacing[3],
        }}
        testID={testID ? `${testID}.kinds` : undefined}
      >
        {visibleKinds.map(({ kind, label }) => {
          const isSelected = value.hostKind === kind;
          return (
            <Pressable
              key={kind}
              onPress={() => onSelectKind(kind)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Host: ${label}`}
              testID={testID ? `${testID}.kind.${kind}` : undefined}
              style={{ flex: 1 }}
            >
              <Surface
                elevation="subtle"
                radius="md"
                inset={isSelected}
                style={{
                  paddingVertical: spacing[3],
                  alignItems: 'center',
                  borderWidth: isSelected ? 1.5 : 0,
                  borderColor: isSelected ? colors.primary : 'transparent',
                }}
              >
                <Text
                  style={{
                    color: isSelected ? colors.primary : colors.text,
                    fontSize: TYPE.md,
                    fontWeight: isSelected ? '600' : '400',
                  }}
                >
                  {label}
                </Text>
              </Surface>
            </Pressable>
          );
        })}
      </View>

      {needsBaseUrl && (
        <View>
          <Input
            value={value.baseUrl ?? ''}
            onChangeText={onChangeBaseUrl}
            placeholder={
              value.hostKind === 'github'
                ? 'https://github.acme.corp'
                : value.hostKind === 'gitea'
                  ? 'https://gitea.example.com'
                  : 'https://gitlab.example.com/group'
            }
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            surfaceTestID={testID ? `${testID}.baseUrl.surface` : undefined}
            {...(testID ? { testID: `${testID}.baseUrl` } : {})}
            containerStyle={{ marginBottom: spacing[2] }}
          />
          {baseUrlEmpty && (
            <Text
              testID={testID ? `${testID}.baseUrl.hint` : undefined}
              style={{
                color: colors.textSecondary,
                fontSize: TYPE.xs,
                marginTop: spacing[1],
                marginBottom: spacing[2],
              }}
            >
              Required — the URL of your {getAdapter(value.hostKind).displayName()} instance
              {value.hostKind === 'gitlab' ? ' (group/subgroup/project path supported)' : ''}.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
