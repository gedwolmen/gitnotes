import { Platform } from 'react-native';
import type { AIProviderConfig, ProviderPlatform } from '../../models/AIProvider';

export type AvailabilityReason =
  | { code: 'platform-mismatch'; supportedPlatforms: ProviderPlatform[] }
  | { code: 'device-ineligible'; message: string }
  | { code: 'apple-intelligence-disabled' }
  | { code: 'apple-intelligence-downloading' }
  | { code: 'unknown'; message: string };

export type Availability =
  | { kind: 'available' }
  | { kind: 'unavailable'; reason: AvailabilityReason };

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: Availability; expiresAt: number }>();

export function clearProviderAvailabilityCache(): void {
  cache.clear();
}

function currentPlatform(): ProviderPlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

// Apple Intelligence requires A17 Pro / M-series silicon.
// First eligible iPhone is iPhone 15 Pro (iPhone16,1 / iPhone16,2). All iPhone 17,x
// (iPhone 16 family) are eligible; older identifiers are not.
function isAppleIntelligenceEligibleModel(modelId: string | null | undefined): boolean {
  if (!modelId) return true; // simulator returns null modelId — assume eligible there
  const match = modelId.match(/^iPhone(\d+),(\d+)$/);
  if (!match) {
    // iPad / Mac: iPad14,8+ and any Mac with Apple silicon are eligible.
    // For now, assume non-iPhone Apple devices are eligible (best-effort).
    return true;
  }
  const major = parseInt(match[1], 10);
  // iPhone16,x = iPhone 15 / 15 Plus / 15 Pro / 15 Pro Max.
  // Only the Pro variants (16,1 and 16,2) are eligible.
  if (major === 16) {
    const minor = parseInt(match[2], 10);
    return minor === 1 || minor === 2;
  }
  // iPhone17,x and newer are all A18+/Pro chips, all eligible.
  return major >= 17;
}

async function probeApple(): Promise<Availability> {
  if (Platform.OS !== 'ios') {
    return {
      kind: 'unavailable',
      reason: { code: 'platform-mismatch', supportedPlatforms: ['ios'] },
    };
  }

  let nativeAvailable = false;
  let nativeError: unknown = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const apple = require('@react-native-ai/apple') as typeof import('@react-native-ai/apple');
    nativeAvailable = apple.AppleFoundationModels.isAvailable();
  } catch (error) {
    nativeError = error;
  }

  if (nativeAvailable) {
    return { kind: 'available' };
  }

  // Native says unavailable. Disambiguate by checking the device model.
  let modelId: string | null | undefined = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Device = require('expo-device') as typeof import('expo-device');
    modelId = Device.modelId ?? null;
  } catch {
    // expo-device unavailable — fall through to generic unknown
  }

  if (!isAppleIntelligenceEligibleModel(modelId)) {
    return {
      kind: 'unavailable',
      reason: {
        code: 'device-ineligible',
        message: 'Requires iPhone 15 Pro or newer',
      },
    };
  }

  // Device is capable but the model isn't ready — most likely the user hasn't
  // enabled Apple Intelligence in Settings (or it's still downloading; we can't
  // currently tell those apart from JS).
  if (nativeError) {
    const message = nativeError instanceof Error ? nativeError.message : String(nativeError);
    return { kind: 'unavailable', reason: { code: 'unknown', message } };
  }

  return { kind: 'unavailable', reason: { code: 'apple-intelligence-disabled' } };
}

export async function resolveProviderAvailability(
  provider: AIProviderConfig
): Promise<Availability> {
  const cached = cache.get(provider.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value: Availability;

  const supported = provider.supportedPlatforms;
  if (supported && supported.length > 0) {
    const platform = currentPlatform();
    if (!platform || !supported.includes(platform)) {
      value = {
        kind: 'unavailable',
        reason: { code: 'platform-mismatch', supportedPlatforms: supported },
      };
      cache.set(provider.id, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    }
  }

  if (provider.type === 'apple') {
    value = await probeApple();
  } else {
    value = { kind: 'available' };
  }

  cache.set(provider.id, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export class ProviderUnavailableError extends Error {
  readonly reason: AvailabilityReason;
  constructor(reason: AvailabilityReason, providerName: string) {
    super(`Provider "${providerName}" is unavailable: ${reason.code}`);
    this.name = 'ProviderUnavailableError';
    this.reason = reason;
  }
}
