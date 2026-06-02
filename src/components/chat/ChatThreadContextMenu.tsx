import { View } from 'react-native';

import ContextMenu from '../ContextMenu';
import { ChatThreadSummary } from '../../models/Chat';

interface ChatThreadContextMenuProps {
  thread: ChatThreadSummary | null;
  visible: boolean;
  onClose: () => void;
  onOpen: (thread: ChatThreadSummary) => void;
  onRename: (thread: ChatThreadSummary) => void;
  onDelete: (thread: ChatThreadSummary) => Promise<void>;
  bottomSheet?: boolean;
}

export function ChatThreadContextMenu({
  thread,
  visible,
  onClose,
  onOpen,
  onRename,
  onDelete,
  bottomSheet,
}: ChatThreadContextMenuProps) {
  return (
    <View testID="chat-thread-context-menu.item.close">
      <ContextMenu
        visible={visible}
        onClose={onClose}
        title={thread?.title || 'Untitled'}
        headerIcon="chatbubble"
        bottomSheet={bottomSheet}
        sections={
          thread
            ? [
                {
                  items: [
                    {
                      icon: 'eye-outline',
                      label: 'Open',
                      testID: 'chat-thread-context-menu.item.open',
                      onPress: () => onOpen(thread),
                    },
                    {
                      icon: 'pencil-outline',
                      label: 'Rename',
                      testID: 'chat-thread-context-menu.item.rename',
                      onPress: () => onRename(thread),
                    },
                    {
                      icon: 'trash-outline',
                      label: 'Delete',
                      destructive: true,
                      testID: 'chat-thread-context-menu.item.delete',
                      onPress: async () => {
                        await onDelete(thread);
                      },
                    },
                  ],
                },
              ]
            : []
        }
      />
    </View>
  );
}
