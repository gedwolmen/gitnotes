import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';

import { ChatThreadSummary } from '../../models/Chat';
import { useTokens } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/tokens';
import { Surface } from '../ui/Surface';

interface ChatThreadCardProps {
  thread: ChatThreadSummary;
  onPress: () => void;
  onLongPress: () => void;
}

function ChatThreadCardImpl({ thread, onPress, onLongPress }: ChatThreadCardProps) {
  const { colors, type } = useTokens();
  const typography = type ?? TYPE;

  const timeAgo = formatDistanceToNow(thread.updatedAt, { addSuffix: true });

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} onLongPress={onLongPress}>
      <Surface elevation="raised" radius="md" style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Ionicons name="chatbubble-outline" size={18} color={colors.primary} style={styles.icon} />
            <Text
              style={[styles.title, { color: colors.text, fontSize: typography.md }]}
              numberOfLines={1}
            >
              {thread.title}
            </Text>
          </View>

          {thread.preview && (
            <Text
              style={[styles.preview, { color: colors.textSecondary, fontSize: typography.sm }]}
              numberOfLines={2}
            >
              {thread.preview}
            </Text>
          )}

          <View style={styles.footer}>
            <Text style={[styles.time, { color: colors.textSecondary, fontSize: typography.xs }]}>
              {timeAgo}
            </Text>
            <Text style={[styles.messageCount, { color: colors.primary, fontSize: typography.xs }]}>
              {thread.messageCount} messages
            </Text>
          </View>
        </View>
      </Surface>
    </TouchableOpacity>
  );
}

export const ChatThreadCard = memo(ChatThreadCardImpl);

const styles = StyleSheet.create({
  container: {
    padding: 12,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  icon: {
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontWeight: '600',
  },
  preview: {
    marginBottom: 8,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  time: {},
  messageCount: {
    fontWeight: '600',
  },
});

export default ChatThreadCard;
