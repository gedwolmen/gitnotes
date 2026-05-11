import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { View, Text, Platform, Pressable, useColorScheme } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatMessage } from '../../models/Chat';
import { useTokens, useTheme } from '../../contexts/ThemeContext';
import { formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { Surface } from '../ui/Surface';
import { useMarkdown, type MarkedStyles } from 'react-native-marked';
import type { ViewStyle } from 'react-native';
import type { RootStackParamList } from '../../navigation/types';

type NoteToolResult = { noteId: string; title?: string };

function parseNoteToolResult(raw: string | undefined): NoteToolResult | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.noteId === 'string') {
      return { noteId: parsed.noteId, title: typeof parsed.title === 'string' ? parsed.title : undefined };
    }
  } catch {
    return null;
  }
  return null;
}

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onLongPress?: (message: ChatMessage) => void;
}

function ChatMessageBubbleImpl({ message, isStreaming, onLongPress }: ChatMessageBubbleProps) {
  const { colors, spacing, type } = useTokens();
  const { isDark } = useTheme();
  const colorScheme = useColorScheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [dotStep, setDotStep] = useState(0);

  // Detect tool calls that touch a single note (`create_note` / `edit_note` /
  // `get_note`). The previous render dumped the full Note JSON into the chat;
  // now we collapse it to a tappable link that opens the note in the editor.
  const noteToolResult = useMemo(() => {
    if (!message.toolCallName) return null;
    if (!['create_note', 'edit_note', 'get_note'].includes(message.toolCallName)) return null;
    return parseNoteToolResult(message.toolCallResult);
  }, [message.toolCallName, message.toolCallResult]);

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

  const isUser = message.role === 'user';
  const textColor = isUser ? '#ffffff' : colors.text;
  const markdownTheme = useMemo(() => ({
    colors: {
      text: textColor,
      code: textColor,
      link: colors.primary,
      border: isDark ? '#444' : '#ddd',
      background: 'transparent' as const,
    },
  }), [textColor, colors.primary, isDark]);
  const markdownStyles = useMemo<MarkedStyles>(() => ({
    paragraph: { backgroundColor: 'transparent', marginVertical: 0, paddingVertical: 0 },
    text: { color: textColor, backgroundColor: 'transparent' },
    em: { color: textColor },
    strong: { color: textColor },
    li: { color: textColor },
    codespan: { color: textColor, backgroundColor: isDark ? '#1c1c1e' : '#e8e8e8' },
    code: { backgroundColor: isDark ? '#1c1c1e' : '#e8e8e8' },
    blockquote: { backgroundColor: 'transparent', borderLeftColor: isDark ? '#444' : '#ddd' },
  }), [textColor, isDark]);
  // react-native-marked's <Markdown> wraps output in a FlatList that captures
  // pan gestures even with `scrollEnabled: false`, which deadlocks the outer
  // ChatScreen FlatList on iOS for long bubbles (see #748). Render via the
  // `useMarkdown` hook directly into a plain <View> instead — same tokens,
  // no inner virtualized list. Hook must run unconditionally so it sits
  // above the early returns below.
  const markdownNodes = useMarkdown(message.content ?? '', {
    theme: markdownTheme,
    styles: markdownStyles,
    colorScheme,
  });

  if (message.role === 'system') {
    return (
      <View style={{ alignItems: 'center', marginVertical: spacing[2] }}>
        <Text style={{ color: '#888', fontStyle: 'italic', fontSize: type.sm }}>
          {message.content}
        </Text>
      </View>
    );
  }

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

  return (
    <View testID="chat.message-bubble.button.long-press">
      <Pressable
        testID="chat-message-bubble.button.long-press"
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
                {message.toolCallName}{message.toolCallResult ? '' : '…'}
              </Text>
              {!message.toolCallResult && isStreaming && (
                <View style={{ flexDirection: 'row', marginLeft: spacing[2] }}>
                  {[0, 1, 2].map((i) => (
                    <View
                      key={i}
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: textColor,
                        opacity: dotStep === i + 1 || dotStep === 0 ? 0.9 : 0.3,
                        marginRight: i < 2 ? 3 : 0,
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
            {noteToolResult ? (
              <Pressable
                testID="chat-message-bubble.tool-result.note-link"
                onPress={() => navigation.navigate('NoteEditor', { noteId: noteToolResult.noteId })}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: spacing[1],
                  paddingHorizontal: spacing[2],
                  paddingVertical: spacing[1],
                  borderRadius: 8,
                  backgroundColor: pressed ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.05)',
                })}
              >
                <Ionicons name="document-text-outline" size={16} color={colors.primary} style={{ marginRight: spacing[1] }} />
                <Text style={{ color: colors.primary, fontSize: type.sm, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                  {noteToolResult.title ?? 'Open note'}
                </Text>
              </Pressable>
            ) : message.toolCallResult ? (
              <Surface elevation="flat" style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: spacing[2], borderRadius: 8, marginTop: spacing[1] }}>
                <Text style={{ color: textColor, fontSize: type.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }} numberOfLines={6}>
                  {message.toolCallResult}
                </Text>
              </Surface>
            ) : null}
          </View>
        ) : isUser ? (
          <Text style={{ color: textColor, fontSize: type.md }}>
            {message.content}
          </Text>
        ) : (
          <View>
            {markdownNodes.map((node, idx) => (
              <Fragment key={idx}>{node}</Fragment>
            ))}
          </View>
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
    </View>
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
