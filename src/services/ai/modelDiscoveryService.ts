import AsyncStorage from '@react-native-async-storage/async-storage';
import { version as anthropicSdkVersion } from '@ai-sdk/anthropic/package.json';
import type { AIProviderConfig, AIModelConfig } from '../../models/AIProvider';
import { getFactory } from './providerFactory';
import { ANTHROPIC_DEFAULT_MODELS } from './anthropicDefaults';

const CACHE_KEY_PREFIX = 'anthropic-models-cache-';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedModels {
  models: AIModelConfig[];
  timestamp: number;
  sdkVersion: string;
}

/**
 * Get cached models for a provider if they exist and are fresh.
 * Cache is invalidated if:
 * - Cache is older than maxAge
 * - SDK version has changed (indicating potential model updates)
 */
async function getCachedModels(
  providerId: string,
  maxAge: number = CACHE_MAX_AGE_MS
): Promise<AIModelConfig[] | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY_PREFIX + providerId);
    if (!cached) return null;

    const { models, timestamp, sdkVersion }: CachedModels = JSON.parse(cached);
    const isStale = Date.now() - timestamp > maxAge;
    const sdkChanged = sdkVersion !== anthropicSdkVersion;

    if (isStale || sdkChanged) {
      await AsyncStorage.removeItem(CACHE_KEY_PREFIX + providerId);
      return null;
    }

    return models;
  } catch {
    return null;
  }
}

/**
 * Cache discovered models for a provider.
 */
async function cacheModels(providerId: string, models: AIModelConfig[]): Promise<void> {
  try {
    const cacheData: CachedModels = {
      models,
      timestamp: Date.now(),
      sdkVersion: anthropicSdkVersion,
    };
    await AsyncStorage.setItem(CACHE_KEY_PREFIX + providerId, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('[ModelDiscovery] Failed to cache models:', error);
  }
}

/**
 * Discover models for an Anthropic provider if not already cached.
 * Falls back to ANTHROPIC_DEFAULT_MODELS on any error.
 */
export async function discoverModelsIfNeeded(
  providerConfig: AIProviderConfig
): Promise<AIModelConfig[]> {
  if (providerConfig.type !== 'anthropic') {
    return providerConfig.models;
  }

  if (!providerConfig.apiKey) {
    return ANTHROPIC_DEFAULT_MODELS.map(m => ({
      id: m.id,
      name: m.name,
      providerId: providerConfig.id,
      providerType: 'anthropic',
      requiresDownload: false,
    }));
  }

  const cached = await getCachedModels(providerConfig.id);
  if (cached) {
    return cached;
  }

  try {
    const factory = getFactory('anthropic');
    const result = await factory.testConnection(
      providerConfig.baseURL || '',
      providerConfig.apiKey,
      providerConfig.id
    );

    if (result.models.length > 0) {
      await cacheModels(providerConfig.id, result.models);
      return result.models;
    }
  } catch (error) {
    console.warn('[ModelDiscovery] Failed to discover models, using defaults:', error);
  }

  return ANTHROPIC_DEFAULT_MODELS.map(m => ({
    id: m.id,
    name: m.name,
    providerId: providerConfig.id,
    providerType: 'anthropic',
    requiresDownload: false,
  }));
}

/**
 * Clear cached models for a provider (useful for testing or manual refresh).
 */
export async function clearCachedModels(providerId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY_PREFIX + providerId);
  } catch (error) {
    console.warn('[ModelDiscovery] Failed to clear cache:', error);
  }
}

/**
 * Clear all cached Anthropic models.
 */
export async function clearAllCachedModels(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const anthropicKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX));
    if (anthropicKeys.length > 0) {
      await AsyncStorage.multiRemove(anthropicKeys);
    }
  } catch (error) {
    console.warn('[ModelDiscovery] Failed to clear all caches:', error);
  }
}
