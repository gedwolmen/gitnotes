import '../../../global.css';
import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Input } from './ui/input';
import { NativeWindThemeProvider } from '../../theme/nativewind';
import { useTokens } from '../../contexts/ThemeContext';
import { SafeAreaView } from '../../components/ui/SafeAreaView';

export default function NativeWindSmokeScreen() {
  const [text, setText] = useState('');
  const [pressed, setPressed] = useState(false);
  const { colors } = useTokens();

  return (
    <NativeWindThemeProvider>
      <SafeAreaView className="flex-1 bg-background">
        <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
          <Text className="text-2xl font-bold text-text">
            NativeWind + RNR Smoke Test
          </Text>

          <Card testID="smoke-card">
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
            </CardHeader>
            <CardContent>
              <Text className="text-sm text-text-secondary">
                This card renders with NativeWind className props.
              </Text>
            </CardContent>
          </Card>

          <View className="flex-row gap-2">
            <Button
              testID="smoke-button"
              onPress={() => setPressed(true)}
            >
              <Text className="font-medium text-text">
                {pressed ? 'Pressed!' : 'Press Me'}
              </Text>
            </Button>

            <Button variant="outline" size="sm" testID="smoke-button-outline">
              <Text className="font-medium text-text">Outline</Text>
            </Button>
          </View>

          <Input
            testID="smoke-input"
            placeholder="Type something..."
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
          />

          {text ? (
            <Text className="text-sm text-text-secondary">
              You typed: {text}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </NativeWindThemeProvider>
  );
}
