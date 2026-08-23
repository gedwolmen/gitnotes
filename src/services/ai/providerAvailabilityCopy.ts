import type { TFunction } from 'i18next';
import type { AvailabilityReason } from './providerAvailability';

export function describeAvailability(t: TFunction, reason: AvailabilityReason): string {
  switch (reason.code) {
    case 'platform-mismatch': {
      if (reason.supportedPlatforms.includes('ios') && !reason.supportedPlatforms.includes('android')) {
        return t('ai.availability.iosOnly');
      }
      if (reason.supportedPlatforms.includes('android') && !reason.supportedPlatforms.includes('ios')) {
        return t('ai.availability.androidOnly');
      }
      return t('ai.availability.unknown');
    }
    case 'device-ineligible':
      return reason.message;
    case 'apple-intelligence-disabled':
      return t('ai.availability.appleIntelligenceDisabled');
    case 'apple-intelligence-downloading':
      return t('ai.availability.appleIntelligenceDownloading');
    case 'llama-not-installed':
      return reason.message || t('ai.availability.llamaNotInstalled');
    case 'unknown':
    default:
      return reason.message ? `${t('ai.availability.unknown')} (${reason.message})` : t('ai.availability.unknown');
  }
}
