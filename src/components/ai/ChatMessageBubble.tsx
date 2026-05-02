import React, { useEffect, useState } from 'react';
import { View, Text, Platform, Pressable } from 'react-native';
import { ChatMessage } from '../../models/Chat';
import { useTokens, useTheme } from '../../contexts/ThemeContext';
import { formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { Surface } from '../ui/Surface';
import Markdown, { type MarkedStyles } from 'react-native-marked';
import type { ViewStyle } from 'react-native';

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onLongPress?: (message: ChatMessage) => void;
}

function ChatMessageBubbleImpl({ message, isStreaming, onLongPress }: ChatMessageBubbleProps) {
  const { colors, spacing, type } = useTokens();
  const { isDark } = useTheme();

  const [dotStep, setDotStep] = useState(0);

  useEffect(() => {
    if (!isStreaming) {
      setDotStep(0);
      return;
    }
    const interval = setInterval(() => {
      setDotStep((s) => (s + 1) % 4);
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
  const isStreamingPlaceholder = !isUser && isStreaming && !message.content && !message.toolCallName;

  if (isStreamingPlaceholder) {
    return (
      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', height: type.md * 1.4, paddingHorizontal: spacing[2], marginVertical: spacing[1] }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.textSecondary,
              opacity: dotStep === i + 1 || dotStep === 0 ? 1 : 0.3,
              marginRight: i < 2 ? 4 : 0,
            }}
          />
        ))}
      </View>
    );
  }
  
  const containerStyle: ViewStyle = {
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    maxWidth: '85%',
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
      background: 'transparent' as const,
    }
  };

  const markdownStyles: MarkedStyles = {
    paragraph: { backgroundColor: 'transparent', marginVertical: 0, paddingVertical: 0 },
    text: { color: textColor, backgroundColor: 'transparent' },
    em: { color: textColor },
    strong: { color: textColor },
    li: { color: textColor },
    codespan: { color: textColor, backgroundColor: isDark ? '#1c1c1e' : '#e8e8e8' },
    code: { backgroundColor: isDark ? '#1c1c1e' : '#e8e8e8' },
    blockquote: { backgroundColor: 'transparent', borderLeftColor: isDark ? '#444' : '#ddd' },
  };

  const markdownFlatListProps = {
    style: { backgroundColor: 'transparent' },
    contentContainerStyle: { backgroundColor: 'transparent' },
    scrollEnabled: false,
  };

  return (
    <Pressable
      style={containerStyle}
      onLongPress={onLongPress ? () => onLongPress(message) : undefined}
      delayLongPress={350}
      android_ripple={{ color: 'transparent' }}
    >
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
            value={message.content}
            theme={markdownTheme}
            styles={markdownStyles}
            flatListProps={markdownFlatListProps}
          />
        )}
      </View>
      {isUser && message.attachedContexts && message.attachedContexts.length > 0 && (
        <View style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          marginTop: spacing[1],
          gap: spacing[1],
        }}>
          {message.attachedContexts.map((ctx, idx) => (
            <View
              key={`${ctx.type}-${ctx.path}-${idx}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDark ? '#2c2c2e' : '#e8e8e8',
                paddingHorizontal: spacing[2],
                paddingVertical: 2,
                borderRadius: 10,
              }}
            >
              <Ionicons
                name={
                  ctx.type === 'file' || ctx.type === 'local-notes' ? 'document-text-outline'
                  : ctx.type === 'repo' ? 'git-branch-outline'
                  : ctx.type === 'local-todos' ? 'checkbox-outline'
                  : 'folder-outline'
                }
                size={11}
                color={colors.textSecondary}
                style={{ marginRight: 3 }}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                {ctx.name}
              </Text>
            </View>
          ))}
        </View>
      )}
      <Text style={{
        color: colors.textSecondary,
        fontSize: 10,
        alignSelf: isUser ? 'flex-end' as const : 'flex-start' as const,
        marginTop: spacing[1]
      }}>
        {timestamp}
      </Text>
    </Pressable>
  );
}

export const ChatMessageBubble = React.memo(ChatMessageBubbleImpl, (prev, next) => {
  if (prev.isStreaming !== next.isStreaming) return false;
  if (prev.onLongPress !== next.onLongPress) return false;
  const a = prev.message;
  const b = next.message;
  return (
    a.id === b.id
    && a.content === b.content
    && a.toolCallResult === b.toolCallResult
    && a.toolCallName === b.toolCallName
    && a.role === b.role
  );
});
