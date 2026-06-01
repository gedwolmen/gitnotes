import { generateText } from 'ai';
import { useAIStore } from '../stores/aiStore';
import { useNoteStore } from '../stores/noteStore';
import { useFolderStore } from '../stores/folderStore';
import { initializeModel } from './AIService';
import { NotificationService } from './NotificationService';
import { ScheduledLearningItem } from '../models/ScheduledLearning';

const NOTIFICATION_ID_PREFIX = 'scheduled-learning-';

export class ScheduledLearningService {
  static async generateAndCreateNote(item: ScheduledLearningItem): Promise<boolean> {
    try {
      const aiStore = useAIStore.getState();
      const noteStore = useNoteStore.getState();
      const folderStore = useFolderStore.getState();

      const modelId = item.modelId ?? aiStore.selectedModelId;
      if (!modelId) {
        console.warn('[ScheduledLearning] No model selected');
        return false;
      }

      const modelConfig = aiStore
        .getAvailableModels()
        .find((m) => m.id === modelId);
      if (!modelConfig) {
        console.warn('[ScheduledLearning] Model not found:', modelId);
        return false;
      }

      const provider = aiStore.providers.find((p) =>
        p.models.some((m) => m.id === modelId)
      );
      if (!provider) {
        console.warn('[ScheduledLearning] Provider not found for model:', modelId);
        return false;
      }

      const model = await initializeModel(modelConfig, provider);

      const tagsText = item.tags.join(', ');
      const wordCount = item.wordCount;

      const systemPrompt = `You are an educational content generator. Create a well-structured learning note about the topic(s) provided. The note should be informative, educational, and engaging. Format with markdown. Include examples where helpful.`;

      const userPrompt = `Create a learning note about: ${tagsText}\n\nRequirements:\n- Approximately ${wordCount} words\n- Well-structured with sections/headings\n- Educational and informative tone\n- Include practical examples if relevant`;

      const result = await generateText({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const title = `Learning: ${tagsText} - ${dateStr}`;

      const folderPath = item.folderId
        ? folderStore.folders.find((f) => f.id === item.folderId)?.path
        : undefined;

      await noteStore.createNote({
        title,
        content: result.text,
        tags: ['scheduled-learning', ...item.tags],
        folderPath,
        format: 'markdown',
      });

      await useScheduledLearningStore.getState().markGenerated(item.id);

      return true;
    } catch (error) {
      console.error('[ScheduledLearning] Failed to generate note:', error);
      return false;
    }
  }

  static async scheduleNotification(item: ScheduledLearningItem): Promise<string | null> {
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission) return null;

      const nextDate = getNextScheduledDate(item.dayOfWeek, item.time);

      const notificationId = await NotificationService.scheduleLearningNotification({
        title: 'Time to Learn!',
        body: `Your scheduled learning session for "${item.tags.join(', ')}" is ready.`,
        data: { scheduledLearningId: item.id },
        trigger: nextDate,
      });

      return notificationId;
    } catch (error) {
      console.error('[ScheduledLearning] Failed to schedule notification:', error);
      return null;
    }
  }

  static async cancelNotification(itemId: string): Promise<void> {
    try {
      const notificationId = NOTIFICATION_ID_PREFIX + itemId;
      await NotificationService.cancelReminder(notificationId);
    } catch (error) {
      console.error('[ScheduledLearning] Failed to cancel notification:', error);
    }
  }
}

import { useScheduledLearningStore } from '../stores/scheduledLearningStore';
import { getNextScheduledDate } from '../models/ScheduledLearning';