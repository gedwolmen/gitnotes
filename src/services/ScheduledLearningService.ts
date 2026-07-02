import { generateText } from 'ai';
import { useAIStore } from '../stores/aiStore';
import { useNoteStore } from '../stores/noteStore';
import { useScheduledLearningStore } from '../stores/scheduledLearningStore';
import { initializeModel } from './AIService';
import { NotificationService } from './NotificationService';
import {
  ScheduledLearningItem,
  getNextScheduledDates,
  getQuestionerPrompts,
  getQuestionerFolders,
  DayOfWeek,
  QuestionerFolderSelection,
} from '../models/ScheduledLearning';

const NOTIFICATION_ID_PREFIX = 'scheduled-learning-';
const QUESTIONER_MARKER_PREFIX = '<!-- sl-item-id:';
const QUESTIONER_MARKER_SUFFIX = ' -->';

const MS_23_HOURS = 23 * 60 * 60 * 1000;
const MS_24_HOURS = 24 * 60 * 60 * 1000;
const MS_6_DAYS = 6 * MS_24_HOURS;

function getDayFromDate(date: Date): DayOfWeek {
  const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days[(date.getDay() + 6) % 7];
}

function shouldGenerateForDay(item: ScheduledLearningItem, day: DayOfWeek): boolean {
  if (item.repeat === 'one-time') {
    return item.lastGeneratedAt === null;
  }
  if (item.repeat === 'daily') {
    if (item.lastGeneratedAt === null) return true;
    return Date.now() - item.lastGeneratedAt >= MS_23_HOURS;
  }
  const lastGen = item.dayLastGeneratedAt[day];
  if (lastGen === undefined) {
    return true;
  }
  const msSinceLastGeneration = Date.now() - lastGen;
  if (msSinceLastGeneration < MS_6_DAYS) {
    return false;
  }
  return true;
}

export class ScheduledLearningService {
  static async generateAndCreateNote(item: ScheduledLearningItem, day?: DayOfWeek): Promise<boolean> {
    if (item.type === 'questioner') {
      return ScheduledLearningService.generateQuestionerNote(item, day);
    }
    return ScheduledLearningService.generateLearnNote(item, day);
  }

  private static async generateLearnNote(item: ScheduledLearningItem, day?: DayOfWeek): Promise<boolean> {
    const targetDay = day ?? getDayFromDate(new Date());

    if (!shouldGenerateForDay(item, targetDay)) {
      return false;
    }

    try {
      const aiStore = useAIStore.getState();
      const noteStore = useNoteStore.getState();

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
      const descriptionText = item.description ? `\n\nAdditional context: ${item.description}` : '';

      const existingNotesForTags = noteStore.notes.filter((note) =>
        note.tags?.some((tag) => item.tags.includes(tag))
      );

      let depthHint = '';
      if (existingNotesForTags.length > 0) {
        const existingTitles = existingNotesForTags
          .slice(0, 5)
          .map((n) => n.title)
          .join('; ');
        depthHint = `\n\nA prior note exists on this subject. Existing notes: "${existingTitles}". Generate more advanced content that builds on and goes beyond what has already been covered.`;
      }

      const systemPrompt = `You are an educational content generator. Create a well-structured learning note about the topic(s) provided. The note should be informative, educational, and engaging. Format with markdown. Include examples where helpful.`;

      const userPrompt = `Create a learning note about: ${tagsText}${descriptionText}${depthHint}\n\nRequirements:\n- Approximately ${wordCount} words\n- Well-structured with sections/headings\n- Educational and informative tone\n- Include practical examples if relevant`;

      const result = await generateText({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Strip AI thinking tags (e.g. <think>...</think>) from the response
      const cleanedContent = result.text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const title = `Learning: ${tagsText} - ${dateStr}`;

      const folderPath = item.folderPath ?? undefined;

      await noteStore.createNote({
        title,
        content: cleanedContent,
        tags: ['scheduled-learning', ...item.tags],
        folderPath,
        repo: item.repoPath ?? undefined,
        branch: item.branch ?? undefined,
        format: 'markdown',
      });

      await useScheduledLearningStore.getState().markGenerated(item.id, targetDay);

      return true;
    } catch (error) {
      console.error('[ScheduledLearning] Failed to generate learn note:', error);
      return false;
    }
  }

  private static async resolveModel(item: { modelId: string | null }) {
    const aiStore = useAIStore.getState();
    const modelId = item.modelId ?? aiStore.selectedModelId;
    if (!modelId) {
      console.warn('[ScheduledLearning] No model selected');
      return null;
    }
    const modelConfig = aiStore.getAvailableModels().find((m) => m.id === modelId);
    if (!modelConfig) {
      console.warn('[ScheduledLearning] Model not found:', modelId);
      return null;
    }
    const provider = aiStore.providers.find((p) =>
      p.models.some((m) => m.id === modelId)
    );
    if (!provider) {
      console.warn('[ScheduledLearning] Provider not found for model:', modelId);
      return null;
    }
    const model = await initializeModel(modelConfig, provider);
    return { model, modelId };
  }

  private static async generateQuestionerNote(item: ScheduledLearningItem, day?: DayOfWeek): Promise<boolean> {
    const targetDay = day ?? getDayFromDate(new Date());
    if (!shouldGenerateForDay(item, targetDay)) {
      return false;
    }

    try {
      const resolved = await ScheduledLearningService.resolveModel(item);
      if (!resolved) return false;
      const { model } = resolved;
      const noteStore = useNoteStore.getState();

      const promptContext = ScheduledLearningService.buildQuestionerPromptContext(
        item,
        noteStore.notes,
      );

      const wordCount = item.wordCount;
      const descriptionText = item.description ? `\n\nAdditional context: ${item.description}` : '';
      const marker = `${QUESTIONER_MARKER_PREFIX} ${item.id}${QUESTIONER_MARKER_SUFFIX}`;

      const systemPrompt = `You are an educational question generator. Create a set of questions that test knowledge on the given topic. Format the questions in markdown with clear numbering and sections. Include a mix of question types (short answer, explanation, problem-solving). Leave space after each question for the user to write their answer. Do NOT provide answers - only questions.`;

      const userPrompt = `Generate questions based on ${promptContext}${descriptionText}\n\nRequirements:\n- Approximately ${wordCount} words total\n- Mix of difficulty levels\n- Clear, well-structured questions in markdown\n- Leave space for answers after each question\n- Include a section header like "## Questions" at the top`;

      const result = await generateText({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const cleanedContent = result.text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const title = `Questions: ${item.tags.join(', ')} - ${dateStr}`;

      const content = `${marker}\n${cleanedContent}`;

      await noteStore.createNote({
        title,
        content,
        tags: ['scheduled-learning', 'questioner', ...item.tags],
        folderPath: item.folderPath ?? undefined,
        repo: item.repoPath ?? undefined,
        branch: item.branch ?? undefined,
        format: 'markdown',
      });

      await useScheduledLearningStore.getState().markGenerated(item.id, targetDay);
      return true;
    } catch (error) {
      console.error('[ScheduledLearning] Failed to generate questioner note:', error);
      return false;
    }
  }

  static buildQuestionerPromptContext(
    item: ScheduledLearningItem,
    notes: ReadonlyArray<{ folderPath?: string | null; repo?: string | null; title: string; content: string }>,
  ): string {
    const source = item.questionerSource ?? 'tags';
    if (source === 'tags') {
      if (item.tags.length === 0) {
        return 'no topic tags';
      }
      return `topic tags: ${item.tags.join(', ')}`;
    }
    if (source === 'prompt') {
      const prompts = getQuestionerPrompts(item);
      if (prompts.length === 0) {
        return item.tags.length > 0 ? `topic tags: ${item.tags.join(', ')}` : 'no prompt';
      }
      if (prompts.length === 1) {
        return `the following prompt: ${prompts[0]}`;
      }
      const numbered = prompts.map((p, i) => `${i + 1}. ${p}`).join('\n');
      return `the following prompts (one section per prompt):\n${numbered}`;
    }
    const folders = getQuestionerFolders(item);
    if (folders.length === 0) {
      return item.tags.length > 0 ? `topic tags: ${item.tags.join(', ')}` : 'no folder selected';
    }
    const blocks = folders
      .map((folder) =>
        ScheduledLearningService.summarizeFolderForPrompt(folder, notes),
      )
      .filter((block) => block.length > 0);
    if (blocks.length === 0) {
      return `the following notes from folder(s): ${folders.map((f) => f.folderPath).join(', ')}\n\n(no notes found in selected folders)`;
    }
    const header = folders.length === 1
      ? `the following notes from folder "${folders[0].folderPath}"${folders[0].repoPath ? ` in repo "${folders[0].repoPath}"` : ''}`
      : `the following notes across ${folders.length} folders:\n${folders.map((f) => `- ${f.repoPath ?? 'unknown'}:${f.folderPath}`).join('\n')}`;
    return `${header}\n\n${blocks.join('\n\n---\n\n')}`;
  }

  private static summarizeFolderForPrompt(
    folder: QuestionerFolderSelection,
    notes: ReadonlyArray<{ folderPath?: string | null; repo?: string | null; title: string; content: string }>,
  ): string {
    const folderNotes = notes.filter((n) => {
      if (n.folderPath !== folder.folderPath) return false;
      if (folder.repoPath && n.repo !== folder.repoPath) return false;
      return true;
    });
    if (folderNotes.length === 0) return '';
    return folderNotes
      .slice(0, 10)
      .map((n) => `Title: ${n.title}\nContent preview: ${n.content.substring(0, 300)}`)
      .join('\n\n---\n\n');
  }

  static async gradeQuestionerNote(noteId: string): Promise<boolean> {
    try {
      const noteStore = useNoteStore.getState();
      const note = noteStore.getNoteById(noteId);
      if (!note) {
        console.warn('[ScheduledLearning] Note not found for grading:', noteId);
        return false;
      }

      const isQuestioner = note.tags?.includes('questioner');
      if (!isQuestioner) {
        console.warn('[ScheduledLearning] Note is not a questioner note:', noteId);
        return false;
      }

      const markerMatch = note.content.match(/<!-- sl-item-id:\s*(\S+)\s*-->/);
      const slItemId = markerMatch ? markerMatch[1] : null;

      let item: ScheduledLearningItem | undefined;
      if (slItemId) {
        item = useScheduledLearningStore.getState().items.find((i) => i.id === slItemId);
      }

      const resolved = await ScheduledLearningService.resolveModel(
        item ?? { modelId: null }
      );
      if (!resolved) return false;
      const { model } = resolved;

      const contentForGrading = note.content.replace(/\n\n---\n\n## Grading & Corrections[\s\S]*$/, '');

      const systemPrompt = `You are an expert grader. The user has answered questions in a note. For each question:\n1. Evaluate if the answer is correct\n2. Provide feedback on the answer\n3. If incorrect or incomplete, provide the correct answer with explanation\n4. Give an overall grade at the end\n\nFormat your grading in clear markdown with sections for each question.`;

      const userPrompt = `Grade the following questions and answers:\n\n${contentForGrading}`;

      const result = await generateText({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const cleanedGrading = result.text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      const gradingSection = `\n\n---\n\n## Grading & Corrections\n\n${cleanedGrading}`;
      const updatedContent = contentForGrading + gradingSection;

      await noteStore.updateNote({ id: noteId, content: updatedContent });

      return true;
    } catch (error) {
      console.error('[ScheduledLearning] Failed to grade questioner note:', error);
      return false;
    }
  }

  static async scheduleNotification(item: ScheduledLearningItem): Promise<string | null> {
    try {
      const hasPermission = await NotificationService.requestPermissions();
      if (!hasPermission) return null;

      const nextDates = getNextScheduledDates(item.daysOfWeek, item.time, item.repeat);
      if (nextDates.length === 0) return null;

      const nextDate = nextDates[0];

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