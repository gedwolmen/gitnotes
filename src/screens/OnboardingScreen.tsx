import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { Button, Input, Surface } from '../components/ui';

interface OnboardingScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

const INFO_STEPS = [
  {
    title: 'Welcome to GitNotēs',
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Button variant="ghost" label="Skip" onPress={handleSkip} />
        </View>

        {isTokenStep ? (
          <View style={styles.content}>
            <Surface elevation="raised" radius="pill" style={styles.iconContainer}>
              <Ionicons name="logo-github" size={72} color={colors.accent} />
            </Surface>

            <Text style={[styles.title, { color: colors.text }]}>Connect GitHub</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Enter a Fine-grained Personal Access Token to link your notes to GitHub repositories. Create one with read/write access to your chosen repositories. You can skip this and add it later in Settings.
            </Text>

            <Button
              variant="ghost"
              onPress={() => Linking.openURL('https://github.com/settings/personal-access-tokens/new?description=GitNotes')}
              leadingIcon={<Ionicons name="open-outline" size={14} color={colors.accent} />}
              label="Open GitHub token settings"
              textStyle={{ color: colors.text, fontSize: 14, fontWeight: '500' }}
              style={{ marginBottom: 16 }}
            />

            <Input
              placeholder="github_pat_xxxxxxxxxxxxxxxxxxxx"
              value={token}
              onChangeText={(t) => { setToken(t); setTokenError(null); }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={{ width: '100%' }}
            />

            {tokenError ? (
              <Text style={styles.errorText}>{tokenError}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.content}>
            <Surface elevation="raised" radius="pill" style={styles.iconContainer}>
              <Ionicons name={INFO_STEPS[currentStep].icon} size={72} color={colors.accent} />
            </Surface>
            <Text style={[styles.title, { color: colors.text }]}>{INFO_STEPS[currentStep].title}</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {INFO_STEPS[currentStep].description}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
              <Surface
                key={index}
                elevation="subtle"
                radius="pill"
                inset={index === currentStep}
                style={{
                  width: 14,
                  height: 14,
                  marginHorizontal: 4,
                  backgroundColor: index === currentStep ? colors.accent : colors.surface,
                }}
              >
                <View />
              </Surface>
            ))}
          </View>

          <Button
            variant="primary"
            fullWidth
            onPress={handleNext}
            disabled={isVerifying}
            label={isVerifying ? '' : isTokenStep ? (token.trim() ? 'Connect' : 'Skip for Now') : 'Next'}
            trailingIcon={
              isVerifying ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Ionicons name="arrow-forward" size={20} color={colors.accent} />
              )
            }
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  iconContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
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
    marginBottom: 24,
  },
});
