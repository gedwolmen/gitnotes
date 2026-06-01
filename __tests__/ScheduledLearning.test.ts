import {
  createScheduledLearningItem,
  updateScheduledLearningItem,
  getNextScheduledDates,
  formatDaysOfWeek,
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
  });
});
