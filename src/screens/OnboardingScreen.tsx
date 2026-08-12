import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { OnboardingService } from '../services/OnboardingService';
import { AuthService } from '../services/AuthService';
import { GitHubService } from '../services/GitHubService';
import { useAIStore } from '../stores/aiStore';
import { Button, Input, Surface } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';

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
  {
    title: 'Dump Your Thoughts',
    description: "Thought Dump lets you capture fleeting ideas, half-formed questions, and stream-of-consciousness reflections as Markdown files in your repo. They're indexed for smart search and feed context into your AI chats.",
    icon: 'bulb-outline' as const,
  },
  {
    title: 'Scheduled Learning',
    description: 'Let AI generate daily or weekly learning notes on your topics. You can also get Questioner notes with questions you answer and get graded — perfect for active recall and spaced repetition.',
    icon: 'help-circle-outline' as const,
  },
];

const TOKEN_STEP = INFO_STEPS.length;
const AI_STEP = TOKEN_STEP + 1;
const TOTAL_STEPS = INFO_STEPS.length + 2;

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
    } else if (currentStep === TOKEN_STEP) {
      if (token.trim()) {
        setIsVerifying(true);
        setTokenError(null);
        const state = await AuthService.setToken(token.trim());
        if (state.isAuthenticated) {
          await GitHubService.setToken(token.trim());
          setIsVerifying(false);
          setCurrentStep(AI_STEP);
        } else {
          setIsVerifying(false);
          setTokenError('Invalid token. Please check and try again.');
        }
      } else {
        setCurrentStep(AI_STEP);
      }
    }
  }, [currentStep, token]);

  const handleEnableAI = useCallback(async () => {
    await useAIStore.getState().setEnabled(true);
    await finish();
  }, [finish]);

  const handleSkipAI = useCallback(async () => {
    await useAIStore.getState().setEnabled(false);
    await finish();
  }, [finish]);

  const handleSkip = useCallback(async () => {
    await OnboardingService.completeOnboarding();
    onSkip();
  }, [onSkip]);

  const isTokenStep = currentStep === TOKEN_STEP;
  const isAIStep = currentStep === AI_STEP;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-row justify-end px-5 pt-2.5">
          <Button variant="ghost" label="Skip" testID="onboarding.button.skip" onPress={handleSkip} />
        </View>

        {isTokenStep ? (
          <ScrollView
            className="flex-1 px-10"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Surface elevation="raised" radius="pill" className="w-[140px] h-[140px] items-center justify-center mb-6">
              <Ionicons name="logo-github" size={72} color={colors.accent} />
            </Surface>

            <Text className="text-[28px] font-bold text-center" style={{ color: colors.text }}>Connect GitHub</Text>
            <Text className="text-base text-center leading-6" style={{ color: colors.textSecondary }}>
              Enter a Fine-grained Personal Access Token with Contents: Read and write access to each repository, or a classic token with the repo scope. You can skip this and add it later in Settings.
            </Text>

            <Button
              variant="ghost"
              testID="onboarding.button.open-link"
              onPress={() => Linking.openURL('https://github.com/settings/personal-access-tokens/new?description=GitNotes')}
              leadingIcon={<Ionicons name="open-outline" size={14} color={colors.accent} />}
              label="Open GitHub token settings"
              textStyle={{ color: colors.text, fontSize: 14, fontWeight: '500' }}
              style={{ marginBottom: 16 }}
            />

            <Input
              testID="onboarding.input.token"
              placeholder="github_pat_xxxxxxxxxxxxxxxxxxxx"
              value={token}
              onChangeText={(t) => { setToken(t); setTokenError(null); }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              showSoftInputOnFocus={false}
              containerStyle={{ width: '100%' }}
            />

            <TouchableOpacity
              testID="onboarding.button.paste-token"
              className="flex-row items-center gap-2 py-3 px-4"
              onPress={async () => {
                const text = await Clipboard.getString();
                if (text) {
                  setToken(text);
                  setTokenError(null);
                }
              }}
            >
              <Ionicons name="clipboard-outline" size={16} color={colors.accent} />
              <Text className="text-sm font-medium" style={{ color: colors.accent }}>Paste from Clipboard</Text>
            </TouchableOpacity>

            {tokenError ? (
              <Text className="text-[13px] text-center mt-2" style={{ color: '#FF3B30' }}>{tokenError}</Text>
            ) : null}
          </ScrollView>
        ) : isAIStep ? (
          <View className="flex-1 px-10 items-center">
            <Surface elevation="raised" radius="pill" className="w-[140px] h-[140px] items-center justify-center mb-6">
              <Ionicons name="sparkles-outline" size={72} color={colors.accent} />
            </Surface>
            <Text className="text-[28px] font-bold text-center" style={{ color: colors.text }}>GitNotēs AI</Text>
            <Text className="text-base text-center leading-6" style={{ color: colors.textSecondary }}>
              Chat over your notes, todos, and canvases. AI can read context and apply edits when you allow it.
            </Text>
            <Text className="text-[13px] text-center leading-[18px] mt-2 opacity-80" style={{ color: colors.textSecondary }}>
              You can turn this on or off anytime in Settings → AI.
            </Text>
          </View>
        ) : (
          <View className="flex-1 px-10 items-center">
            <Surface elevation="raised" radius="pill" className="w-[140px] h-[140px] items-center justify-center mb-6">
              <Ionicons name={INFO_STEPS[currentStep].icon} size={72} color={colors.accent} />
            </Surface>
            <Text className="text-[28px] font-bold text-center" style={{ color: colors.text }}>{INFO_STEPS[currentStep].title}</Text>
            <Text className="text-base text-center leading-6" style={{ color: colors.textSecondary }}>
              {INFO_STEPS[currentStep].description}
            </Text>
          </View>
        )}

        <View className="px-5 pb-10">
          <View className="flex-row justify-center mb-6">
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

          {isAIStep ? (
            <View className="w-full">
              <Button
                variant="primary"
                fullWidth
                testID="onboarding.button.enable-ai"
                onPress={handleEnableAI}
                label="Enable AI"
                trailingIcon={<Ionicons name="sparkles" size={20} color={colors.accent} />}
              />
              <Button
                variant="ghost"
                fullWidth
                testID="onboarding.button.skip-ai"
                onPress={handleSkipAI}
                label="Skip for Now"
                style={{ marginTop: 8 }}
              />
            </View>
          ) : (
            <Button
              variant="primary"
              fullWidth
              testID="onboarding.button.next"
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
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
