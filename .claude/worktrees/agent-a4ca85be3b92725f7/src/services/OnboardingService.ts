import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBootValue } from './StorageBootstrap';

const ONBOARDING_COMPLETED_KEY = '@gitnotes:onboarding_completed';

export class OnboardingService {
  static async isOnboardingCompleted(): Promise<boolean> {
    try {
      const value = getBootValue('@gitnotes:onboarding_completed') ?? await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY);
      return value === 'true';
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      return false;
    }
  }

  static async completeOnboarding(): Promise<void> {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      throw error;
    }
  }

  static async resetOnboarding(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ONBOARDING_COMPLETED_KEY);
    } catch (error) {
      console.error('Error resetting onboarding:', error);
      throw error;
    }
  }
}