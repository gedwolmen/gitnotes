import {
  createReminder,
  updateReminder,
  getNextScheduledDates,
  formatReminderSchedule,
  type ReminderItem,
  type ReminderCreateInput,
} from '../src/models/Reminder';

describe('createReminder', () => {
  it('creates a note reminder with noteId set and others null', () => {
    const item = createReminder({
      entityType: 'note',
      noteId: 'n-1',
      entityLabel: 'My Note',
      time: '09:00',
    });
    expect(item.entityType).toBe('note');
    expect(item.noteId).toBe('n-1');
    expect(item.repoPath).toBeNull();
    expect(item.folderPath).toBeNull();
    expect(item.tag).toBeNull();
    expect(item.isEnabled).toBe(true);
    expect(item.notificationId).toBeNull();
    expect(item.id).toMatch(/^rem-/);
  });

  it('creates a folder reminder with repoPath and folderPath', () => {
    const item = createReminder({
      entityType: 'folder',
      repoPath: 'me/repo',
      folderPath: 'docs',
      entityLabel: 'docs',
      time: '14:30',
    });
    expect(item.entityType).toBe('folder');
    expect(item.repoPath).toBe('me/repo');
    expect(item.folderPath).toBe('docs');
    expect(item.noteId).toBeNull();
    expect(item.tag).toBeNull();
  });

  it('creates a repo reminder with repoPath only', () => {
    const item = createReminder({
      entityType: 'repo',
      repoPath: 'me/repo',
      entityLabel: 'repo',
      time: '08:00',
    });
    expect(item.entityType).toBe('repo');
    expect(item.repoPath).toBe('me/repo');
    expect(item.folderPath).toBeNull();
  });

  it('creates a tag reminder with tag only', () => {
    const item = createReminder({
      entityType: 'tag',
      tag: 'important',
      entityLabel: 'important',
      time: '10:00',
    });
    expect(item.entityType).toBe('tag');
    expect(item.tag).toBe('important');
    expect(item.repoPath).toBeNull();
  });

  it('throws when note entity is missing noteId', () => {
    expect(() =>
      createReminder({
        entityType: 'note',
        entityLabel: 'test',
        time: '09:00',
      }),
    ).toThrow('note entity requires noteId');
  });

  it('throws when folder entity is missing folderPath', () => {
    expect(() =>
      createReminder({
        entityType: 'folder',
        repoPath: 'me/repo',
        entityLabel: 'test',
        time: '09:00',
      }),
    ).toThrow('folder entity requires repoPath and folderPath');
  });

  it('throws when repo entity is missing repoPath', () => {
    expect(() =>
      createReminder({
        entityType: 'repo',
        entityLabel: 'test',
        time: '09:00',
      }),
    ).toThrow('repo entity requires repoPath');
  });

  it('throws when tag entity is missing tag', () => {
    expect(() =>
      createReminder({
        entityType: 'tag',
        entityLabel: 'test',
        time: '09:00',
      }),
    ).toThrow('tag entity requires tag');
  });

  it('throws when time format is invalid', () => {
    expect(() =>
      createReminder({
        entityType: 'tag',
        tag: 'x',
        entityLabel: 'x',
        time: 'nine',
      }),
    ).toThrow('time must be in HH:MM format');
  });

  it('defaults repeat to weekly and daysOfWeek to monday', () => {
    const item = createReminder({
      entityType: 'tag',
      tag: 'x',
      entityLabel: 'x',
      time: '10:00',
    });
    expect(item.repeat).toBe('weekly');
    expect(item.daysOfWeek).toEqual(['monday']);
  });
});

describe('updateReminder', () => {
  it('merges partial updates and bumps updatedAt', () => {
    const original = createReminder({
      entityType: 'note',
      noteId: 'n-1',
      entityLabel: 'Note',
      time: '09:00',
    });
    const before = Date.now();
    const updated = updateReminder(original, { time: '15:00' });
    expect(updated.time).toBe('15:00');
    expect(updated.id).toBe(original.id);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('preserves id and createdAt', () => {
    const original = createReminder({
      entityType: 'tag',
      tag: 'x',
      entityLabel: 'x',
      time: '09:00',
    });
    const updated = updateReminder(original, { entityLabel: 'updated' });
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.entityLabel).toBe('updated');
  });
});

describe('getNextScheduledDates', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-06-10T12:00:00Z')); // Tuesday
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('daily returns next day at specified time', () => {
    const dates = getNextScheduledDates(['monday'], '09:00', 'daily');
    expect(dates).toHaveLength(1);
    const next = dates[0];
    expect(next.getDate()).toBe(11); // Wednesday
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
  });

  it('weekly returns next matching weekday', () => {
    const dates = getNextScheduledDates(
      ['monday', 'friday'],
      '14:30',
      'weekly',
    );
    expect(dates).toHaveLength(2);
    // Monday (next Mon June 16)
    const mon = dates.find((d) => d.getDay() === 1);
    expect(mon).toBeDefined();
    expect(mon!.getDate()).toBe(16);
    // Friday (next Fri June 13)
    const fri = dates.find((d) => d.getDay() === 5);
    expect(fri).toBeDefined();
    expect(fri!.getDate()).toBe(13);
  });

  it('one-time returns nearest future day from selected days', () => {
    const dates = getNextScheduledDates(
      ['monday', 'wednesday'],
      '09:00',
      'one-time',
    );
    expect(dates).toHaveLength(1);
    // Wednesday (June 11) is closer than Monday (June 16)
    expect(dates[0].getDay()).toBe(3); // Wednesday
    expect(dates[0].getDate()).toBe(11);
  });

  it('returns empty array when no days specified for non-daily repeat', () => {
    const dates = getNextScheduledDates([], '09:00', 'weekly');
    expect(dates).toHaveLength(0);
  });
});

describe('formatReminderSchedule', () => {
  it('formats daily schedule', () => {
    const item = createReminder({
      entityType: 'tag',
      tag: 'x',
      entityLabel: 'x',
      time: '09:00',
      repeat: 'daily',
    });
    expect(formatReminderSchedule(item)).toBe('Every day at 9:00 AM');
  });

  it('formats weekly schedule with multiple days', () => {
    const item = createReminder({
      entityType: 'tag',
      tag: 'x',
      entityLabel: 'x',
      time: '14:30',
      repeat: 'weekly',
      daysOfWeek: ['monday', 'wednesday', 'friday'],
    });
    const result = formatReminderSchedule(item);
    expect(result).toContain('M');
    expect(result).toContain('W');
    expect(result).toContain('F');
    expect(result).toContain('2:30 PM');
  });

  it('formats one-time schedule', () => {
    const item = createReminder({
      entityType: 'tag',
      tag: 'x',
      entityLabel: 'x',
      time: '10:00',
      repeat: 'one-time',
      daysOfWeek: ['friday'],
    });
    const result = formatReminderSchedule(item);
    expect(result).toContain('One-time');
    expect(result).toContain('Friday');
  });
});
