import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { ChatMessage } from '../../models/Chat';
import { useTokens, useTheme } from '../../contexts/ThemeContext';
import { formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { Surface } from '../ui/Surface';
import Markdown from 'react-native-marked';

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function ChatMessageBubble({ message, isStreaming }: ChatMessageBubbleProps) {
  const { colors, spacing, type } = useTokens();
  const { isDark } = useTheme();

  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const timestamp = formatDistanceToNow(message.timestamp, { addSuffix: true });

  if (message.role === 'system') {
    return (
      <View style={{ alignItems: 'center', marginVertical: spacing[2] }}>
        <Text style={{ color: '#888', fontStyle: 'italic', fontSize: type.sm }}>
          {message.content}
        </Text>
      </View>
    );
  }

  const isUser = message.role === 'user';
  
  const containerStyle = {
    alignSelf: isUser ? 'flex-end' as const : 'flex-start' as const,
    maxWidth: '85%' as const,
    marginVertical: spacing[1],
  };

  const surfaceBg = isDark ? '#2c2c2e' : '#f0f0f0';

  const bubbleStyle = {
    backgroundColor: isUser ? colors.primary : surfaceBg,
    padding: spacing[3],
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: isUser ? 16 : 4,
    borderBottomRightRadius: isUser ? 4 : 16,
  };

  const textColor = isUser ? '#ffffff' : colors.text;

  const markdownTheme = {
    colors: {
      text: textColor,
      code: textColor,
      link: colors.primary,
      border: isDark ? '#444' : '#ddd',
    }
  };

  return (
    <View style={containerStyle as any}>
      <View style={bubbleStyle}>
        {message.toolCallName ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: message.toolCallResult ? spacing[1] : 0 }}>
              <Ionicons name="build-outline" size={16} color={textColor} style={{ marginRight: spacing[1] }} />
              <Text style={{ color: textColor, fontWeight: 'bold' }}>
                {message.toolCallName}...
              </Text>
            </View>
            {message.toolCallResult && (
              <Surface elevation="flat" style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: spacing[2], borderRadius: 8, marginTop: spacing[1] }}>
                <Text style={{ color: textColor, fontSize: type.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                  {message.toolCallResult}
                </Text>
              </Surface>
            )}
          </View>
        ) : isUser ? (
          <Text style={{ color: textColor, fontSize: type.md }}>
            {message.content}
          </Text>
        ) : (
          <Markdown 
            value={message.content + (isStreaming && !message.content ? dots : '')} 
            theme={markdownTheme as any}
          />
        )}
      </View>
      <Text style={{ 
        color: colors.textSecondary, 
        fontSize: 10, 
        alignSelf: isUser ? 'flex-end' as const : 'flex-start' as const,
        marginTop: spacing[1]
      }}>
        {timestamp}
      </Text>
    </View>
  );
}
