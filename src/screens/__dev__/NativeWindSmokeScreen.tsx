import '../../../global.css';
import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Input } from './ui/input';

export default function NativeWindSmokeScreen() {
  const [text, setText] = useState('');
  const [pressed, setPressed] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <Text className="text-2xl font-bold text-gray-900">
          NativeWind + RNR Smoke Test
        </Text>

        <Card testID="smoke-card">
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-sm text-gray-600">
              This card renders with NativeWind className props.
            </Text>
          </CardContent>
        </Card>

        <View className="flex-row gap-2">
          <Button
            testID="smoke-button"
            onPress={() => setPressed(true)}
          >
            <Text className="font-medium text-white">
              {pressed ? 'Pressed!' : 'Press Me'}
            </Text>
          </Button>

          <Button variant="outline" size="sm" testID="smoke-button-outline">
            <Text className="font-medium text-gray-900">Outline</Text>
          </Button>
        </View>

        <Input
          testID="smoke-input"
          placeholder="Type something..."
          value={text}
          onChangeText={setText}
        />

        {text ? (
          <Text className="text-sm text-gray-500">
            You typed: {text}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
