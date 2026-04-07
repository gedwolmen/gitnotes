import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { OnboardingService } from '../services/OnboardingService';
import { AuthService } from '../services/AuthService';
import { GitHubService } from '../services/GitHubService';

interface OnboardingScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

const INFO_STEPS = [
  {
    title: 'Welcome to GitNotes',
    description: 'Your development notes, perfectly organized with Git integration.',
    icon: 'journal-outline' as const,
  },
  {
    title: 'Link to Git Repositories',
    description: 'Connect your notes to GitHub repositories and track changes.',
    icon: 'code-slash-outline' as const,
  },
  {
    title: 'Organize with Folders',
    description: 'Create folders to organize your notes by project or topic.',
    icon: 'folder-outline' as const,
  },
  {
    title: 'Stay Productive',
    description: 'Pin important notes, use checklists, and track your progress.',
    icon: 'rocket-outline' as const,
  },
];

// Token step is the last step (index INFO_STEPS.length)
const TOKEN_STEP = INFO_STEPS.length;
const TOTAL_STEPS = INFO_STEPS.length + 1;

export default function OnboardingScreen({ onComplete, onSkip }: OnboardingScreenProps) {
  const { colors } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [token, setToken] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const finish = useCallback(async () => {
    await OnboardingService.completeOnboarding();
    onComplete();
  }, [onComplete]);

  const handleNext = useCallback(async () => {
    if (currentStep < TOKEN_STEP) {
      setCurrentStep(currentStep + 1);
    } else {
      // Token step — save token if provided, then finish
      if (token.trim()) {
        setIsVerifying(true);
        setTokenError(null);
        const state = await AuthService.setToken(token.trim());
        if (state.isAuthenticated) {
          await GitHubService.setToken(token.trim());
          setIsVerifying(false);
          await finish();
        } else {
          setIsVerifying(false);
          setTokenError('Invalid token. Please check and try again.');
        }
      } else {
        await finish();
      }
    }
  }, [currentStep, token, finish]);

  const handleSkip = useCallback(async () => {
    await OnboardingService.completeOnboarding();
    onSkip();
  }, [onSkip]);

  const isTokenStep = currentStep === TOKEN_STEP;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleSkip}>
            <Text style={[styles.skipButton, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        {isTokenStep ? (
          <View style={styles.content}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="logo-github" size={80} color={colors.primary} />
            </View>

            <Text style={[styles.title, { color: colors.text }]}>Connect GitHub</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Enter a Personal Access Token to link your notes to GitHub issues and milestones. You can skip this and add it later in Settings.
            </Text>

            <TouchableOpacity
              style={styles.generateLink}
              onPress={() => Linking.openURL('https://github.com/settings/tokens/new?scopes=repo,read:user&description=GitNotes')}
            >
              <Ionicons name="open-outline" size={14} color={colors.primary} />
              <Text style={[styles.generateLinkText, { color: colors.primary }]}>
                Generate token on GitHub
              </Text>
            </TouchableOpacity>

            <TextInput
              style={[
                styles.tokenInput,
                {
                  color: colors.text,
                  borderColor: tokenError ? '#FF3B30' : colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor={colors.textSecondary}
              value={token}
              onChangeText={(t) => { setToken(t); setTokenError(null); }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            {tokenError ? (
              <Text style={styles.errorText}>{tokenError}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.content}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name={INFO_STEPS[currentStep].icon} size={80} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{INFO_STEPS[currentStep].title}</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {INFO_STEPS[currentStep].description}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  { backgroundColor: index === currentStep ? colors.primary : colors.border },
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: colors.primary }]}
            onPress={handleNext}
            disabled={isVerifying}
          >
            {isVerifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextButtonText}>
                  {isTokenStep ? (token.trim() ? 'Connect' : 'Skip for Now') : currentStep === TOKEN_STEP - 1 ? 'Next' : 'Next'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  skipButton: {
    fontSize: 16,
    padding: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  generateLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
  },
  generateLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tokenInput: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 30,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  nextButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
