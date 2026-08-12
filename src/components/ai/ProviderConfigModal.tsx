import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';
import { useTokens } from '../../contexts/ThemeContext';
import { Group, GroupRow } from '../ui';
import { AIProviderConfig, AIModelConfig } from '../../models/AIProvider';
import { useAIStore } from '../../stores/aiStore';
import { checkOpenRouterKey, isOpenRouterBaseURL } from '../../services/ai/openrouterPreflight';
import { isAnthropicBaseURL } from '../../services/ai/anthropicDefaults';

interface ProviderConfigModalProps {
  visible: boolean;
  onClose: () => void;
  provider?: AIProviderConfig;
}

const MINIMAX_MODELS = [
  'MiniMax-M3',
  'MiniMax-M2.7',
  'MiniMax-M2.7-highspeed',
  'MiniMax-M2.5',
  'MiniMax-M2.5-highspeed',
  'MiniMax-M2.1',
  'MiniMax-M2',
] as const;

function isMiniMaxBaseURL(value: string): boolean {
  return /api\.minimax\.io/i.test(value);
}

function normalizeMiniMaxBaseURL(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!isMiniMaxBaseURL(trimmed)) return trimmed;
  return trimmed
    .replace(/\/anthropic(?:\/v1\/messages)?$/i, '')
    .replace(/\/v1\/text\/chatcompletion_v2$/i, '');
}

function isAnthropicBaseURL(value: string): boolean {
  if (!value) return false;
  return /api\.anthropic\.com/i.test(value);
}

export function ProviderConfigModal({ visible, onClose, provider }: ProviderConfigModalProps) {
  const { colors } = useTheme();
  const { spacing } = useTokens();
  
  const [name, setName] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testedModels, setTestedModels] = useState<AIModelConfig[]>([]);

  useEffect(() => {
    if (visible) {
      if (provider) {
        setName(provider.name || '');
        setBaseURL(provider.baseURL || '');
        setApiKey(provider.apiKey || '');
        setTestedModels(provider.models || []);
      } else {
        setName('');
        setBaseURL('');
        setApiKey('');
        setTestedModels([]);
      }
      setApiKeyVisible(false);
    }
  }, [visible, provider]);

  const handleTestConnection = async () => {
    if (!baseURL.trim()) {
      Alert.alert('Error', 'Please enter a base URL first.');
      return;
    }
    
    setIsTesting(true);
    try {
      const normalizedBaseURL = normalizeMiniMaxBaseURL(baseURL);
      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        if (isAnthropicBaseURL(normalizedBaseURL)) {
          headers['x-api-key'] = apiKey.trim();
          headers['anthropic-version'] = '2023-06-01';
        } else {
          headers['Authorization'] = `Bearer ${apiKey.trim()}`;
        }
      }

      if (isAnthropicBaseURL(normalizedBaseURL)) {
        const response = await axios.get('https://api.anthropic.com/v1/models', {
          headers,
          timeout: 10000,
        });
        const modelsData = response.data?.data || response.data;
        if (Array.isArray(modelsData)) {
          const providerId = provider?.id || `custom-${Date.now()}`;
          const discoveredModels: AIModelConfig[] = modelsData.map((m: any) => ({
            id: String(m.id),
            name: String(m.display_name || m.id),
            providerId,
            providerType: 'anthropic' as const,
            requiresDownload: false,
          }));
          setTestedModels(discoveredModels);
          Alert.alert('Success', `Connected to Anthropic and discovered ${discoveredModels.length} models.`);
        } else {
          throw new Error('Unexpected response format from Anthropic API.');
        }
      } else if (isMiniMaxBaseURL(normalizedBaseURL)) {
        const response = await axios.post(
          `${normalizedBaseURL}/v1/text/chatcompletion_v2`,
          {
            model: 'MiniMax-M3',
            messages: [
              { role: 'system', name: 'MiniMax AI' },
              { role: 'user', name: 'user', content: 'hello' },
            ],
            max_tokens: 16,
          },
          { headers, timeout: 10000 },
        );

        if (!response.data) {
          throw new Error('MiniMax returned an empty response.');
        }

        const providerId = provider?.id || `custom-${Date.now()}`;
        const discoveredModels: AIModelConfig[] = MINIMAX_MODELS.map((modelId) => ({
          id: modelId,
          name: modelId,
          providerId,
          providerType: 'openai-compatible',
          requiresDownload: false,
        }));
        setBaseURL(normalizedBaseURL);
        setTestedModels(discoveredModels);
        Alert.alert(
          'Success',
          `Connected to MiniMax. Using base URL ${normalizedBaseURL} and loaded ${discoveredModels.length} known models.`,
        );
      } else {
        const url = normalizedBaseURL.endsWith('/') ? `${normalizedBaseURL}models` : `${normalizedBaseURL}/models`;
        const response = await axios.get(url, { headers, timeout: 10000 });
        const modelsData = response.data?.data || response.data;

        if (Array.isArray(modelsData)) {
          const discoveredModels: AIModelConfig[] = modelsData.map((m: any) => ({
            id: String(m.id || m.name),
            name: String(m.name || m.id),
            providerId: provider?.id || `custom-${Date.now()}`,
            providerType: 'openai-compatible',
            requiresDownload: false,
          }));

          setTestedModels(discoveredModels);

          let warning = '';
          if (isOpenRouterBaseURL(normalizedBaseURL) && apiKey.trim()) {
            const keyInfo = await checkOpenRouterKey(normalizedBaseURL, apiKey.trim());
            if (keyInfo?.isFreeTier) {
              const limitText = keyInfo.limit != null
                ? `${keyInfo.limit} req/day`
                : 'a daily request limit';
              const usageText = keyInfo.usage != null ? ` (${keyInfo.usage} used)` : '';
              warning = `\n\nThis API key is on the OpenRouter free tier — ${limitText}${usageText}. Streaming will fail when the daily quota is exhausted.`;
            }
          }

          Alert.alert('Success', `Connected and discovered ${discoveredModels.length} models.${warning}`);
        } else {
          throw new Error('Unexpected response format. Expected an array of models.');
        }
      }
    } catch (err: any) {
      Alert.alert('Connection Failed', err.message || 'Could not connect to the provider.');
    } finally {
      setIsTesting(false);
    }
  };

  const isBuiltIn = provider?.type === 'apple' || provider?.type === 'llama';

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Name is required.');
      return;
    }

    if (!isBuiltIn && !baseURL.trim() && provider?.type !== 'anthropic') {
      Alert.alert('Validation Error', 'Base URL is required.');
      return;
    }

    const normalizedBaseURL = !isBuiltIn ? normalizeMiniMaxBaseURL(baseURL) : undefined;

    if (!isBuiltIn) {
      const trimmed = normalizedBaseURL ?? baseURL.trim();
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          Alert.alert('Validation Error', 'Base URL must use http or https.');
          return;
        }
        if (parsed.protocol === 'http:') {
          const proceed = await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Insecure URL',
              'This base URL uses http (not https). API key will be sent in plain text. Continue?',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
              ],
            );
          });
          if (!proceed) return;
        }
} catch (error) {
      console.warn('[ProviderConfigModal] handleSave failed:', error);
      Alert.alert('Validation Error', 'Base URL is not a valid URL.');
      return;
    }
    }

    const providerId = provider?.id || `custom-${Date.now()}`;
    const sourceModels = testedModels.length > 0 ? testedModels : (provider?.models || []);
    const models = sourceModels.map((m) => ({ ...m, providerId }));

    const baseProvider: AIProviderConfig = {
      id: providerId,
      type: isBuiltIn ? provider!.type : (isAnthropicBaseURL(normalizedBaseURL ?? '') ? 'anthropic' : 'openai-compatible'),
      name: name.trim(),
      isEnabled: provider?.isEnabled ?? true,
      addedAt: provider?.addedAt || Date.now(),
      ...(isBuiltIn ? {} : {
        baseURL: normalizedBaseURL,
        apiKey: apiKey.trim() || undefined,
      }),
      models,
    };

    try {
      if (provider) {
        await useAIStore.getState().updateProvider(provider.id, baseProvider);
      } else {
        await useAIStore.getState().addProvider(baseProvider);
      }
      onClose();
    } catch (error: any) {
      Alert.alert('Error Saving', error.message || 'Failed to save provider.');
    }
  };

  const handleDelete = async () => {
    if (!provider) return;
    Alert.alert('Delete Provider', `Are you sure you want to remove "${provider.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await useAIStore.getState().removeProvider(provider.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {provider ? 'Edit Provider' : 'Add Provider'}
            </Text>
            <TouchableOpacity testID="provider-config.button.close" onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          
          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: spacing[6] }}
          >
            <Group title="Provider Details">
              <GroupRow>
                <TextInput
                  testID="provider-config.input.name"
                  style={[styles.textInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                  placeholder="Name (e.g., My Ollama, OpenAI)"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </GroupRow>
              {!isBuiltIn && (
                <>
                  <GroupRow>
                    <TextInput
                      testID="provider-config.input.base-url"
                      style={[styles.textInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                      placeholder="Base URL (e.g., http://localhost:11434/v1)"
                      placeholderTextColor={colors.textSecondary}
                      value={baseURL}
                      onChangeText={setBaseURL}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                  </GroupRow>
                  <GroupRow>
                    <View style={styles.apiKeyContainer}>
                      <TextInput
                        testID="provider-config.input.api-key"
                        style={[styles.textInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, paddingRight: 44 }]}
                        placeholder="API Key (Optional)"
                        placeholderTextColor={colors.textSecondary}
                        value={apiKey}
                        onChangeText={setApiKey}
                        secureTextEntry={!apiKeyVisible}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        testID="provider-config.button.toggle-token-visible"
                        style={styles.eyeIcon}
                        onPress={() => setApiKeyVisible((v) => !v)}
                      >
                        <Ionicons
                          name={apiKeyVisible ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  </GroupRow>
                </>
              )}
              {isBuiltIn && (
                <GroupRow>
                  <Text style={[{ color: colors.textSecondary, fontSize: 14 }]}>
                    {provider?.type === 'apple'
                      ? 'Uses Apple Foundation Models — no configuration needed.'
                      : 'Runs locally on your device — download model from the model selector.'}
                  </Text>
                </GroupRow>
              )}
            </Group>
          </ScrollView>

          <View
            style={[
              styles.actionsContainer,
              { gap: spacing[3], borderTopColor: colors.border, paddingHorizontal: 20, paddingTop: spacing[4] },
            ]}
          >
            {!isBuiltIn && (
              <TouchableOpacity
                testID="provider-config-modal.button.test-connection"
                style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
                onPress={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.actionBtnText, { color: colors.primary }]}>Test Connection</Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              testID="provider-config-modal.button.save"
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
            >
              <Text style={[styles.actionBtnText, { color: '#FFF' }]}>Save Provider</Text>
            </TouchableOpacity>

            {provider && provider.type !== 'apple' && provider.type !== 'llama' && (
              <TouchableOpacity
                testID="provider-config.button.delete"
                style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: '#FF3B30', borderWidth: 1, marginTop: spacing[2] }]}
                onPress={handleDelete}
              >
                <Text style={[styles.actionBtnText, { color: '#FF3B30' }]}>Delete Provider</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    padding: 20,
  },
  textInput: {
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '100%',
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
  },
  apiKeyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    position: 'relative',
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconBtn: {
    padding: 4,
  },
  actionsContainer: {
    paddingBottom: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
