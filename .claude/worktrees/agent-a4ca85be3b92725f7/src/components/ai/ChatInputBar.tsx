import React, { useState } from 'react';
import { View, TextInput, ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTokens, useTheme } from '../../contexts/ThemeContext';
import { AIContextItem } from '../../models/AIProvider';
import { Surface } from '../ui/Surface';
import { IconButton } from '../ui/IconButton';

export interface ChatInputBarProps {
  onSend: (text: string) => void;
  onAttach: () => void;
  attachedContexts: AIContextItem[];
  onRemoveContext: (index: number) => void;
  isStreaming: boolean;
  onStop?: () => void;
  disabled?: boolean;
  contextWarning?: { level: 'caution' | 'over' | 'none'; message: string } | null;
}

export function ChatInputBar({
  onSend,
  onAttach,
  attachedContexts,
  onRemoveContext,
  isStreaming,
  onStop,
  disabled,
  contextWarning,
}: ChatInputBarProps) {
  const [text, setText] = useState('');
  const { colors, spacing, type } = useTokens();

  const handleSend = () => {
    if (text.trim() && !isStreaming) {
      onSend(text);
      setText('');
    }
  };

  const isSendDisabled = !text.trim() || isStreaming || disabled;

  return (
    <Surface elevation="raised" style={{ padding: spacing[2], paddingBottom: spacing[4] }}>
      {contextWarning && contextWarning.message && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            backgroundColor: contextWarning.level === 'over' ? '#5a1a1a' : '#5a4a1a',
            borderColor: contextWarning.level === 'over' ? '#d66b6b' : '#e0a936',
            borderWidth: 1,
            borderRadius: 8,
            padding: spacing[2],
            marginBottom: spacing[2],
          }}
        >
          <Ionicons
            name={contextWarning.level === 'over' ? 'alert-circle' : 'warning-outline'}
            size={16}
            color={contextWarning.level === 'over' ? '#ff8b8b' : '#ffd166'}
            style={{ marginRight: spacing[2], marginTop: 1 }}
          />
          <Text style={{ flex: 1, fontSize: type.sm, color: colors.text }}>
            {contextWarning.message}
          </Text>
        </View>
      )}
      {attachedContexts.length > 0 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: spacing[2] }}
        >
          {attachedContexts.map((ctx, index) => (
            <Surface
              key={`${ctx.type}-${ctx.owner}-${ctx.repo}-${ctx.path}-${index}`}
              elevation="flat"
              radius="sm"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.accent + '20',
                paddingHorizontal: spacing[2],
                paddingVertical: spacing[1],
                marginRight: spacing[2],
              }}
            >
              <Ionicons 
                name={ctx.type === 'file' || ctx.type === 'local-notes' ? 'document-text-outline' : 'folder-outline'} 
                size={14} 
                color={colors.accent} 
                style={{ marginRight: spacing[1] }} 
              />
              <Text style={{ fontSize: type.sm, color: colors.text, marginRight: spacing[1] }}>
                {ctx.name}
              </Text>
              <TouchableOpacity onPress={() => onRemoveContext(index)} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </Surface>
          ))}
        </ScrollView>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <IconButton
          variant="ghost"
          onPress={onAttach}
          disabled={disabled || isStreaming}
          style={{ marginRight: spacing[1], marginBottom: 2 }}
        >
          <Ionicons name="attach" size={24} color={colors.textSecondary} />
        </IconButton>

        <TextInput
          style={{
            flex: 1,
            minHeight: 40,
            maxHeight: 100,
            backgroundColor: colors.background,
            color: colors.text,
            borderRadius: 20,
            paddingHorizontal: spacing[3],
            paddingTop: spacing[2],
            paddingBottom: spacing[2],
            fontSize: type.md,
          }}
          placeholder="Type a message..."
          placeholderTextColor={colors.textSecondary}
          multiline
          value={text}
          onChangeText={setText}
          editable={!disabled && !isStreaming}
        />

        {isStreaming && onStop ? (
          <IconButton
            variant="ghost"
            onPress={onStop}
            style={{ marginLeft: spacing[1], marginBottom: 2 }}
            accessibilityLabel="Stop generation"
          >
            <Ionicons name="stop-circle" size={26} color={colors.primary} />
          </IconButton>
        ) : (
          <IconButton
            variant="ghost"
            onPress={handleSend}
            disabled={isSendDisabled}
            style={{ marginLeft: spacing[1], marginBottom: 2 }}
          >
            <Ionicons
              name="send"
              size={24}
              color={isSendDisabled ? colors.textSecondary : colors.primary}
            />
          </IconButton>
        )}
      </View>
    </Surface>
  );
}