import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
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

interface ModelSelectorProps {
  visible: boolean;
  onClose: () => void;
}

export function ModelSelector({ visible, onClose }: ModelSelectorProps) {
  const { colors } = useTheme();
  const { spacing, type } = useTokens();
  const { t } = useTranslation();

  const providers = useAIStore((state) => state.providers);
  const selectedModelId = useAIStore((state) => state.selectedModelId);
  const selectModel = useAIStore((state) => state.selectModel);
  const updateProvider = useAIStore((state) => state.updateProvider);

  const [statuses, setStatuses] = useState<Record<string, 'ready' | 'needs-download' | 'unavailable'>>({});
  const [providerAvailability, setProviderAvailability] = useState<Record<string, Availability>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [isDownloading, setIsDownloading] = useState<Record<string, boolean>>({});

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
        } catch (e) {
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

  const handleSelectModel = async (model: AIModelConfig) => {
    if (statuses[model.id] === 'unavailable') return;
    if (statuses[model.id] === 'needs-download') return;
    
    await selectModel(model.id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select AI Model</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          
          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={{ paddingBottom: spacing[8] }}
          >
            {providers.filter(p => p.isEnabled).map((provider: AIProviderConfig) => (
              <View key={provider.id} style={{ marginBottom: spacing[6] }}>
                <Group title={provider.name}>
                  {provider.models.map((model) => {
                    const status = statuses[model.id];
                    const downloading = isDownloading[model.id];
                    const progress = downloadProgress[model.id] || 0;
                    const isSelected = selectedModelId === model.id;
                    const isUnavailable = status === 'unavailable';
                    const needsDownload = status === 'needs-download';
                    const availability = providerAvailability[provider.id];
                    const unavailableReason =
                      availability && availability.kind === 'unavailable'
                        ? describeAvailability(t, availability.reason)
                        : null;

                    return (
                      <GroupRow
                        key={model.id}
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
                                {unavailableReason ?? t('ai.availability.unknown')}
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
            ))}
          </ScrollView>
        </View>
      </View>
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
