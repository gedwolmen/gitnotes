import {
  createScheduledLearningItem,
  updateScheduledLearningItem,
  getNextScheduledDates,
  formatDaysOfWeek,
  getQuestionerPrompts,
  getQuestionerFolders,
  DAY_OF_WEEK_OPTIONS,
} from '../src/models/ScheduledLearning';

describe('ScheduledLearning model', () => {
  describe('createScheduledLearningItem', () => {
    it('creates item with required fields', () => {
      const item = createScheduledLearningItem({
        tags: ['react', 'typescript'],
        daysOfWeek: ['monday', 'wednesday'],
        time: '09:00',
        wordCount: 500,
      });

      expect(item.id).toMatch(/^sl-/);
      expect(item.tags).toEqual(['react', 'typescript']);
      expect(item.daysOfWeek).toEqual(['monday', 'wednesday']);
      expect(item.time).toBe('09:00');
      expect(item.wordCount).toBe(500);
      expect(item.repeat).toBe('weekly');
      expect(item.isEnabled).toBe(true);
      expect(item.description).toBe('');
      expect(item.lastGeneratedAt).toBeNull();
      expect(item.createdAt).toBeGreaterThan(0);
      expect(item.updatedAt).toBeGreaterThan(0);
    });

    it('accepts optional fields', () => {
      const item = createScheduledLearningItem({
        tags: ['node'],
        daysOfWeek: ['friday'],
        time: '14:30',
        wordCount: 250,
        repeat: 'one-time',
        description: 'Learn Node.js basics',
        modelId: 'gpt-4',
        folderId: 'folder-1',
        folderName: 'Coding',
      });

      expect(item.repeat).toBe('one-time');
      expect(item.description).toBe('Learn Node.js basics');
      expect(item.modelId).toBe('gpt-4');
      expect(item.folderId).toBe('folder-1');
      expect(item.folderName).toBe('Coding');
    });
  });

  describe('updateScheduledLearningItem', () => {
    it('updates fields and bumps updatedAt', () => {
      const original = createScheduledLearningItem({
        tags: ['old'],
        daysOfWeek: ['monday'],
        time: '08:00',
        wordCount: 100,
      });

      const updated = updateScheduledLearningItem(original, {
        tags: ['new', 'updated'],
        daysOfWeek: ['tuesday', 'thursday'],
        description: 'New description',
      });

      expect(updated.id).toBe(original.id);
      expect(updated.tags).toEqual(['new', 'updated']);
      expect(updated.daysOfWeek).toEqual(['tuesday', 'thursday']);
      expect(updated.description).toBe('New description');
      expect(updated.time).toBe('08:00');
      expect(updated.updatedAt).toBeGreaterThanOrEqual(original.updatedAt);
    });

    it('preserves unchanged fields', () => {
      const original = createScheduledLearningItem({
        tags: ['keep'],
        daysOfWeek: ['monday'],
        time: '08:00',
        wordCount: 100,
        modelId: 'test-model',
      });

      const updated = updateScheduledLearningItem(original, { wordCount: 300 });
      expect(updated.tags).toEqual(['keep']);
      expect(updated.time).toBe('08:00');
      expect(updated.modelId).toBe('test-model');
    });
  });

  describe('getNextScheduledDates', () => {
    it('returns empty array when no days selected', () => {
      const dates = getNextScheduledDates([], '09:00', 'weekly');
      expect(dates).toEqual([]);
    });

    it('returns single date for one-time repeat', () => {
      const dates = getNextScheduledDates(['monday'], '09:00', 'one-time');
      expect(dates.length).toBe(1);
      expect(dates[0]).toBeInstanceOf(Date);
    });

    it('returns dates for each selected day for weekly repeat', () => {
      const dates = getNextScheduledDates(['monday', 'wednesday', 'friday'], '10:00', 'weekly');
      expect(dates.length).toBe(3);
      dates.forEach((d) => expect(d).toBeInstanceOf(Date));
    });

    it('returns single next-day date for daily repeat', () => {
      const dates = getNextScheduledDates(['monday'], '09:00', 'daily');
      expect(dates.length).toBe(1);
      expect(dates[0]).toBeInstanceOf(Date);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(dates[0].getDate()).toBe(tomorrow.getDate());
      expect(dates[0].getHours()).toBe(9);
      expect(dates[0].getMinutes()).toBe(0);
    });

    it('sets correct time on dates', () => {
      const dates = getNextScheduledDates(['tuesday'], '14:30', 'weekly');
      expect(dates.length).toBe(1);
      expect(dates[0].getHours()).toBe(14);
      expect(dates[0].getMinutes()).toBe(30);
    });
  });

  describe('formatDaysOfWeek', () => {
    it('returns "No days selected" for empty array', () => {
      expect(formatDaysOfWeek([])).toBe('No days selected');
    });

    it('returns full day name for single day', () => {
      expect(formatDaysOfWeek(['monday'])).toBe('Monday');
      expect(formatDaysOfWeek(['sunday'])).toBe('Sunday');
    });

    it('returns "Every day" for all 7 days', () => {
      const allDays: typeof DAY_OF_WEEK_OPTIONS[number]['value'][] = [
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
      ];
      expect(formatDaysOfWeek(allDays)).toBe('Every day');
    });

    it('returns count for more than 4 days', () => {
      expect(formatDaysOfWeek(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])).toBe('5 days/week');
    });

    it('returns short labels for 2-4 days', () => {
      expect(formatDaysOfWeek(['monday', 'wednesday'])).toBe('M, W');
      expect(formatDaysOfWeek(['tuesday', 'thursday', 'friday'])).toBe('T, T, F');
    });

    it('returns "Every day" for daily repeat regardless of days', () => {
      expect(formatDaysOfWeek(['monday'], 'daily')).toBe('Every day');
      expect(formatDaysOfWeek([], 'daily')).toBe('Every day');
    });
  });

  describe('type and questioner fields', () => {
    it('defaults type to learn', () => {
      const item = createScheduledLearningItem({
        tags: ['test'],
        daysOfWeek: ['monday'],
        time: '09:00',
        wordCount: 500,
      });
      expect(item.type).toBe('learn');
      expect(item.questionerSource).toBeNull();
      expect(item.questionerPrompts).toEqual([]);
      expect(item.questionerFolders).toEqual([]);
      expect(item.questionerNoteFolder).toBeNull();
    });

    it('creates questioner item with prompt source', () => {
      const item = createScheduledLearningItem({
        type: 'questioner',
        tags: ['physics'],
        daysOfWeek: ['tuesday'],
        time: '10:00',
        wordCount: 300,
        repeat: 'daily',
        questionerSource: 'prompt',
        questionerPrompts: ['Generate physics questions about Newton laws'],
      });

      expect(item.type).toBe('questioner');
      expect(item.repeat).toBe('daily');
      expect(item.questionerSource).toBe('prompt');
      expect(item.questionerPrompts).toEqual(['Generate physics questions about Newton laws']);
    });

    it('creates questioner item with folder source', () => {
      const item = createScheduledLearningItem({
        type: 'questioner',
        tags: ['math'],
        daysOfWeek: ['wednesday'],
        time: '08:00',
        wordCount: 500,
        questionerSource: 'folder',
        questionerFolders: [{ repoPath: 'owner/repo', folderPath: 'notes/math' }],
      });

      expect(item.type).toBe('questioner');
      expect(item.questionerSource).toBe('folder');
      expect(item.questionerFolders).toEqual([{ repoPath: 'owner/repo', folderPath: 'notes/math' }]);
    });
  });

  describe('multi questioner inputs', () => {
    it('accepts multiple prompts and trims empties', () => {
      const item = createScheduledLearningItem({
        type: 'questioner',
        tags: ['mix'],
        daysOfWeek: ['monday'],
        time: '08:00',
        wordCount: 250,
        questionerSource: 'prompt',
        questionerPrompts: ['  topic A  ', '', 'topic B', '   '],
      });
      expect(item.questionerPrompts).toEqual(['topic A', 'topic B']);
    });

    it('drops folder entries missing repo or folder', () => {
      const item = createScheduledLearningItem({
        type: 'questioner',
        tags: ['mix'],
        daysOfWeek: ['monday'],
        time: '08:00',
        wordCount: 250,
        questionerSource: 'folder',
        questionerFolders: [
          { repoPath: 'owner/repo', folderPath: 'notes/a' },
          { repoPath: '', folderPath: 'notes/b' },
          { repoPath: 'owner/repo', folderPath: '' },
          { repoPath: 'owner/repo2', folderPath: 'notes/c' },
        ],
      });
      expect(item.questionerFolders).toEqual([
        { repoPath: 'owner/repo', folderPath: 'notes/a' },
        { repoPath: 'owner/repo2', folderPath: 'notes/c' },
      ]);
    });

    it('migrates legacy questionerPrompt to questionerPrompts', () => {
      const item = createScheduledLearningItem({
        type: 'questioner',
        tags: ['legacy'],
        daysOfWeek: ['monday'],
        time: '08:00',
        wordCount: 250,
        questionerSource: 'prompt',
        questionerPrompt: '  legacy prompt text  ',
      });
      expect(item.questionerPrompts).toEqual(['legacy prompt text']);
    });

    it('prefers explicit questionerPrompts over legacy questionerPrompt', () => {
      const item = createScheduledLearningItem({
        type: 'questioner',
        tags: ['legacy'],
        daysOfWeek: ['monday'],
        time: '08:00',
        wordCount: 250,
        questionerSource: 'prompt',
        questionerPrompt: 'legacy',
        questionerPrompts: ['newer'],
      });
      expect(item.questionerPrompts).toEqual(['newer']);
    });
  });

  describe('updateScheduledLearningItem multi-field handling', () => {
    it('trims and dedupes updated prompts', () => {
      const original = createScheduledLearningItem({
        type: 'questioner',
        tags: ['x'],
        daysOfWeek: ['monday'],
        time: '08:00',
        wordCount: 250,
        questionerSource: 'prompt',
        questionerPrompts: ['first'],
      });
      const updated = updateScheduledLearningItem(original, {
        questionerPrompts: ['  second  ', '', 'first', 'third   '],
      });
      expect(updated.questionerPrompts).toEqual(['second', 'first', 'third']);
    });

    it('drops invalid folder entries on update', () => {
      const original = createScheduledLearningItem({
        type: 'questioner',
        tags: ['x'],
        daysOfWeek: ['monday'],
        time: '08:00',
        wordCount: 250,
        questionerSource: 'folder',
        questionerFolders: [{ repoPath: 'owner/a', folderPath: 'notes/a' }],
      });
      const updated = updateScheduledLearningItem(original, {
        questionerFolders: [
          { repoPath: '', folderPath: 'x' },
          { repoPath: 'owner/b', folderPath: 'notes/b' },
        ],
      });
      expect(updated.questionerFolders).toEqual([{ repoPath: 'owner/b', folderPath: 'notes/b' }]);
    });

    it('preserves questionerPrompts when not in update payload', () => {
      const original = createScheduledLearningItem({
        type: 'questioner',
        tags: ['x'],
        daysOfWeek: ['monday'],
        time: '08:00',
        wordCount: 250,
        questionerSource: 'prompt',
        questionerPrompts: ['keep me'],
      });
      const updated = updateScheduledLearningItem(original, { description: 'new' });
      expect(updated.questionerPrompts).toEqual(['keep me']);
    });
  });

  describe('legacy item migration', () => {
    function legacyItem(extra: Record<string, unknown> = {}) {
      return {
        id: 'sl-legacy',
        type: 'questioner' as const,
        tags: ['x'],
        description: '',
        daysOfWeek: ['monday' as const],
        time: '08:00',
        modelId: null,
        folderId: null,
        folderName: null,
        folderPath: null,
        repoPath: null,
        branch: null,
        wordCount: 250,
        repeat: 'weekly' as const,
        isEnabled: true,
        lastGeneratedAt: null,
        dayLastGeneratedAt: {},
        questionerSource: 'prompt' as const,
        questionerNoteFolder: null,
        // pre-PR2 fields
        questionerPrompt: 'legacy prompt',
        ...extra,
      };
    }

    it('updateScheduledLearningItem tolerates legacy items without the new arrays', () => {
      const legacy = legacyItem() as unknown as Parameters<typeof updateScheduledLearningItem>[0];
      expect(() => updateScheduledLearningItem(legacy, { description: 'safe update' })).not.toThrow();
      const updated = updateScheduledLearningItem(legacy, { description: 'safe update' });
      expect(updated.questionerPrompts).toEqual([]);
      expect(updated.questionerFolders).toEqual([]);
      expect(updated.description).toBe('safe update');
    });

    it('updateScheduledLearningItem migrates legacy questionerPrompt into questionerPrompts', () => {
      const legacy = legacyItem() as unknown as Parameters<typeof updateScheduledLearningItem>[0];
      const updated = updateScheduledLearningItem(legacy, {
        questionerPrompt: 'migrate me',
      });
      expect(updated.questionerPrompts).toEqual(['migrate me']);
    });

    it('getQuestionerPrompts tolerates missing/legacy item shape', () => {
      const legacy = legacyItem() as unknown as Parameters<typeof getQuestionerPrompts>[0];
      expect(getQuestionerPrompts(legacy)).toEqual(['legacy prompt']);
    });

    it('getQuestionerPrompts falls back to single legacy prompt then to empty array', () => {
      const noLegacy = legacyItem({ questionerPrompt: undefined }) as unknown as Parameters<typeof getQuestionerPrompts>[0];
      expect(getQuestionerPrompts(noLegacy)).toEqual([]);
    });

    it('getQuestionerFolders tolerates legacy items and builds from questionerNoteFolder+repoPath', () => {
      const legacy = legacyItem({
        repoPath: 'owner/repo',
        questionerNoteFolder: 'notes/x',
      }) as unknown as Parameters<typeof getQuestionerFolders>[0];
      expect(getQuestionerFolders(legacy)).toEqual([
        { repoPath: 'owner/repo', folderPath: 'notes/x' },
      ]);
    });
  });
});
