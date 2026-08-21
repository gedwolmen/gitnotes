import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useTokens } from '../../contexts/ThemeContext';
import { Group, GroupRow } from '../ui';
import { useAIStore } from '../../stores/aiStore';
import { downloadModel, getModelStatus } from '../../services/AIService';
import { AIModelConfig, AIProviderConfig } from '../../models/AIProvider';
import { resolveProviderAvailability, type Availability } from '../../services/ai/providerAvailability';
import { describeAvailability } from '../../services/ai/providerAvailabilityCopy';
import { filterProviders } from './modelSelectorFilter';

interface ModelSelectorProps {
  visible: boolean;
  onClose: () => void;
}

export function ModelSelector({ visible, onClose }: ModelSelectorProps) {
  const { colors } = useTheme();
  const { spacing } = useTokens();
  const { t } = useTranslation();

  const providers = useAIStore((state) => state.providers);
  const selectedModelId = useAIStore((state) => state.selectedModelId);
  const selectModel = useAIStore((state) => state.selectModel);
  const updateProvider = useAIStore((state) => state.updateProvider);

  const [statuses, setStatuses] = useState<Record<string, 'ready' | 'needs-download' | 'unavailable'>>({});
  const [providerAvailability, setProviderAvailability] = useState<Record<string, Availability>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [isDownloading, setIsDownloading] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const loadStatuses = useCallback(async () => {
    const newStatuses: Record<string, 'ready' | 'needs-download' | 'unavailable'> = {};
    const newAvailability: Record<string, Availability> = {};
    for (const provider of providers) {
      if (!provider.isEnabled) continue;
      try {
        newAvailability[provider.id] = await resolveProviderAvailability(provider);
      } catch {
        newAvailability[provider.id] = { kind: 'available' };
      }
      for (const model of provider.models) {
        try {
          const status = await getModelStatus(model);
          newStatuses[model.id] = status;
        } catch {
          newStatuses[model.id] = 'unavailable';
        }
      }
    }
    setStatuses(newStatuses);
    setProviderAvailability(newAvailability);
  }, [providers]);

  useEffect(() => {
    if (visible) {
      loadStatuses();
    }
  }, [visible, loadStatuses]);

  const handleDownload = async (model: AIModelConfig) => {
    setIsDownloading((prev) => ({ ...prev, [model.id]: true }));
    setDownloadProgress((prev) => ({ ...prev, [model.id]: 0 }));
    
    try {
      await downloadModel(model, (pct) => {
        setDownloadProgress((prev) => ({ ...prev, [model.id]: pct }));
      });
      
      const provider = providers.find(p => p.id === model.providerId);
      if (provider) {
        const updatedModels = provider.models.map(m => 
          m.id === model.id ? { ...m, isDownloaded: true, requiresDownload: false } : m
        );
        await updateProvider(provider.id, { models: updatedModels });
        
        setStatuses((prev) => ({ ...prev, [model.id]: 'ready' }));
      }
    } catch (err) {
      console.error('Failed to download model:', err);
    } finally {
      setIsDownloading((prev) => ({ ...prev, [model.id]: false }));
    }
  };

  const visibleProviders = useMemo(() => {
    const baseProviders = providers
      .filter((p) => p.isEnabled)
      .filter((p) => {
        if (!p.supportedPlatforms || p.supportedPlatforms.length === 0) return true;
        const os = Platform.OS as 'ios' | 'android';
        return p.supportedPlatforms.includes(os);
      });
    return filterProviders(baseProviders, query);
  }, [providers, query]);

  const trimmedQuery = query.trim();

  const handleSelectModel = async (model: AIModelConfig) => {
    if (statuses[model.id] === 'unavailable') return;
    if (statuses[model.id] === 'needs-download') return;
    
    await selectModel(model.id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select AI Model</Text>
            <TouchableOpacity testID="model-selector.button.close" onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          
          <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              testID="model-selector.input.search"
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search models or providers"
              placeholderTextColor={colors.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                testID="model-selector.button.clear-search"
                onPress={() => setQuery('')}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={{ paddingBottom: spacing[8] }}
            keyboardShouldPersistTaps="handled"
          >
            {trimmedQuery !== '' && visibleProviders.length === 0 && (
              <Text
                testID="model-selector.text.empty"
                style={[styles.emptyText, { color: colors.textSecondary }]}
              >
                No models match "{trimmedQuery}"
              </Text>
            )}
            {visibleProviders
              .map((provider: AIProviderConfig) => {
                const availability = providerAvailability[provider.id];
                const providerUnavailable = availability && availability.kind === 'unavailable';
                const unavailableReason =
                  providerUnavailable ? describeAvailability(t, availability.reason) : null;

                if (providerUnavailable) {
                  return (
                    <View key={provider.id} style={{ marginBottom: spacing[6] }}>
                      <Group title={provider.name}>
                        <GroupRow disabled>
                          <Text style={[styles.modelDesc, { color: colors.textSecondary, paddingVertical: spacing[1] }]}>
                            {unavailableReason ?? t('ai.availability.unknown')}
                          </Text>
                        </GroupRow>
                      </Group>
                    </View>
                  );
                }

                return (
                  <View key={provider.id} style={{ marginBottom: spacing[6] }}>
                    <Group title={provider.name}>
                  {provider.models.map((model) => {
                    const status = statuses[model.id];
                    const downloading = isDownloading[model.id];
                    const progress = downloadProgress[model.id] || 0;
                    const isSelected = selectedModelId === model.id;
                    const isUnavailable = status === 'unavailable';
                    const needsDownload = status === 'needs-download';
                    return (
                      <GroupRow
                        key={model.id}
                        testID={`model-selector.button.select-model-${model.id}`}
                        onPress={
                          isUnavailable || needsDownload || downloading
                            ? undefined
                            : () => handleSelectModel(model)
                        }
                        disabled={isUnavailable}
                      >
                        <View style={styles.rowContent}>
                          <View style={styles.modelInfo}>
                            <Text style={[styles.modelName, { color: isUnavailable ? colors.textSecondary : colors.text }]}>
                              {model.name}
                            </Text>
                            {isUnavailable && (
                              <Text style={[styles.modelDesc, { color: colors.textSecondary }]}>
                                {t('ai.availability.unknown')}
                              </Text>
                            )}
                            {needsDownload && !downloading && (
                              <Text style={[styles.modelDesc, { color: colors.textSecondary }]}>
                                Requires download ({model.downloadSize || 'unknown size'})
                              </Text>
                            )}
                            {downloading && (
                              <Text style={[styles.modelDesc, { color: colors.primary }]}>
                                Downloading... {Math.round(progress * 100)}%
                              </Text>
                            )}
                          </View>

                          <View style={styles.modelStatus}>
                            {downloading ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : needsDownload ? (
                              <TouchableOpacity
                                testID={`model-selector.button.download-${model.id}`}
                                style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
                                onPress={() => handleDownload(model)}
                              >
                                <Ionicons name="download-outline" size={16} color="#FFF" />
                                <Text style={styles.downloadBtnText}>Download</Text>
                              </TouchableOpacity>
                            ) : isSelected ? (
                              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                            ) : null}
                          </View>
                        </View>
                      </GroupRow>
                    );
                  })}
                    </Group>
                  </View>
                );
              })}
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  modelInfo: {
    flex: 1,
    paddingRight: 16,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '500',
  },
  modelDesc: {
    fontSize: 13,
    marginTop: 4,
  },
  modelStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  downloadBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
