import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Modal } from './ui/Modal';
import { useTheme } from '../contexts/ThemeContext';
import { GIT_HOST_LABELS, type GitHostProvider } from '../services/git/GitHost';

const PROVIDERS: GitHostProvider[] = ['github', 'gitlab', 'gitea', 'forgejo'];

const PROVIDER_ICONS: Record<GitHostProvider, string> = {
  github: 'logo-github',
  gitlab: 'logo-gitlab',
  gitea: 'git-branch-outline',
  forgejo: 'git-branch-outline',
};

interface ProviderSelectorProps {
  value: GitHostProvider;
  onChange: (provider: GitHostProvider) => void;
}

export function ProviderSelector({ value, onChange }: ProviderSelectorProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback((provider: GitHostProvider) => {
    onChange(provider);
    setIsOpen(false);
  }, [onChange]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      <TouchableOpacity
        testID="onboarding.provider.dropdown"
        style={[
          styles.trigger,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        <Ionicons
          name={PROVIDER_ICONS[value] as keyof typeof Ionicons.glyphMap}
          size={18}
          color={colors.accent}
        />
        <Text style={[styles.triggerText, { color: colors.text }]}>
          {GIT_HOST_LABELS[value]}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        onRequestClose={handleClose}
        bottomSheet
        accessibilityLabel="Select provider"
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Select Provider
          </Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.optionsList}>
          {PROVIDERS.map((provider) => {
            const isSelected = provider === value;
            return (
              <TouchableOpacity
                key={provider}
                testID={`onboarding.provider.${provider}`}
                style={[
                  styles.option,
                  { borderBottomColor: colors.border },
                  isSelected && { backgroundColor: `${colors.accent}15` },
                ]}
                onPress={() => handleSelect(provider)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={PROVIDER_ICONS[provider] as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color={isSelected ? colors.accent : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.optionText,
                    { color: isSelected ? colors.accent : colors.text },
                    isSelected && { fontWeight: '600' },
                  ]}
                >
                  {GIT_HOST_LABELS[provider]}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={18} color={colors.accent} style={styles.checkIcon} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  triggerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  optionsList: {
    paddingBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
  },
  checkIcon: {
    marginLeft: 8,
  },
});
