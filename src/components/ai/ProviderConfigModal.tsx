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

interface ProviderConfigModalProps {
  visible: boolean;
  onClose: () => void;
  provider?: AIProviderConfig;
}

export function ProviderConfigModal({ visible, onClose, provider }: ProviderConfigModalProps) {
  const { colors, style: uiStyle } = useTheme();
  const { spacing, type } = useTokens();
  
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
      const url = baseURL.endsWith('/') ? `${baseURL}models` : `${baseURL}/models`;
      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }
      
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
        Alert.alert('Success', `Connected and discovered ${discoveredModels.length} models.`);
      } else {
        throw new Error('Unexpected response format. Expected an array of models.');
      }
    } catch (err: any) {
      Alert.alert('Connection Failed', err.message || 'Could not connect to the provider.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !baseURL.trim()) {
      Alert.alert('Validation Error', 'Name and Base URL are required.');
      return;
    }

    const baseProvider: AIProviderConfig = {
      id: provider?.id || `custom-${Date.now()}`,
      type: 'openai-compatible',
      name: name.trim(),
      isEnabled: provider?.isEnabled ?? true,
      addedAt: provider?.addedAt || Date.now(),
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim() || undefined,
      models: testedModels.length > 0 ? testedModels : (provider?.models || []),
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
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          
          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: spacing[8] }}
          >
            <Group title="Provider Details">
              <GroupRow>
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder="Name (e.g., My Ollama, OpenAI)"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </GroupRow>
              <GroupRow>
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
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
                <View style={styles.apiKeyRow}>
                  <TextInput
                    style={[styles.textInput, { color: colors.text, flex: 1 }]}
                    placeholder="API Key (Optional)"
                    placeholderTextColor={colors.textSecondary}
                    value={apiKey}
                    onChangeText={setApiKey}
                    secureTextEntry={!apiKeyVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setApiKeyVisible((v) => !v)}
                    style={styles.iconBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={apiKeyVisible ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </GroupRow>
            </Group>

            <View style={[styles.actionsContainer, { marginTop: spacing[6], gap: spacing[3] }]}>
              <TouchableOpacity
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

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
              >
                <Text style={[styles.actionBtnText, { color: '#FFF' }]}>Save Provider</Text>
              </TouchableOpacity>

              {provider && provider.type !== 'apple' && provider.type !== 'llama' && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: 'transparent', marginTop: spacing[2] }]}
                  onPress={handleDelete}
                >
                  <Text style={[styles.actionBtnText, { color: '#FF3B30' }]}>Delete Provider</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
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
    paddingVertical: 8,
    width: '100%',
  },
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  iconBtn: {
    padding: 4,
  },
  actionsContainer: {
    paddingBottom: 40,
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
