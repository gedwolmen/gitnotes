import { ScheduledLearningService } from '../src/services/ScheduledLearningService';
import {
  createScheduledLearningItem,
  DayOfWeek,
  ScheduledLearningItem,
} from '../src/models/ScheduledLearning';

function baseItem(overrides: Partial<ScheduledLearningItem> = {}): ScheduledLearningItem {
  return createScheduledLearningItem({
    type: 'questioner',
    tags: ['topic'],
    daysOfWeek: ['monday' as DayOfWeek],
    time: '09:00',
    wordCount: 250,
    ...overrides,
  });
}

const FAKE_NOTES = [
  {
    id: 'n1',
    folderPath: 'notes/math',
    repo: 'owner/repo-a',
    title: 'Algebra basics',
    content: 'A short intro to algebra.',
  },
  {
    id: 'n2',
    folderPath: 'notes/math',
    repo: 'owner/repo-a',
    title: 'Geometry primer',
    content: 'Points, lines, planes.',
  },
  {
    id: 'n3',
    folderPath: 'notes/physics',
    repo: 'owner/repo-b',
    title: 'Kinematics',
    content: 'Position, velocity, acceleration.',
  },
  {
    id: 'n4',
    folderPath: 'notes/physics',
    repo: 'owner/repo-a',
    title: 'Newton laws',
    content: 'Three laws of motion.',
  },
];

describe('ScheduledLearningService.buildQuestionerPromptContext', () => {
  it('returns tag-only context for tags source', () => {
    const item = baseItem({
      questionerSource: 'tags',
      tags: ['algebra', 'geometry'],
    });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toBe('topic tags: algebra, geometry');
  });

  it('handles empty tags gracefully for tags source', () => {
    const item = baseItem({ questionerSource: 'tags', tags: [] });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toBe('no topic tags');
  });

  it('formats a single prompt singularly', () => {
    const item = baseItem({
      questionerSource: 'prompt',
      questionerPrompts: ['Newton laws fundamentals'],
    });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toBe('the following prompt: Newton laws fundamentals');
  });

  it('numbers multiple prompts as separate sections', () => {
    const item = baseItem({
      questionerSource: 'prompt',
      questionerPrompts: ['Algebra basics', 'Geometry shapes'],
    });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toContain('the following prompts (one section per prompt):');
    expect(ctx).toContain('1. Algebra basics');
    expect(ctx).toContain('2. Geometry shapes');
  });

  it('falls back to tags when prompt source has no prompts', () => {
    const item = baseItem({
      questionerSource: 'prompt',
      questionerPrompts: [],
      tags: ['fallback-tag'],
    });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toBe('topic tags: fallback-tag');
  });

  it('summarizes notes for a single folder selection', () => {
    const item = baseItem({
      questionerSource: 'folder',
      questionerFolders: [{ repoPath: 'owner/repo-a', folderPath: 'notes/math' }],
    });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toContain('the following notes from folder "notes/math" in repo "owner/repo-a"');
    expect(ctx).toContain('Title: Algebra basics');
    expect(ctx).toContain('Title: Geometry primer');
    expect(ctx).not.toContain('Title: Kinematics');
  });

  it('summarizes notes across multiple folder selections grouped', () => {
    const item = baseItem({
      questionerSource: 'folder',
      questionerFolders: [
        { repoPath: 'owner/repo-a', folderPath: 'notes/math' },
        { repoPath: 'owner/repo-b', folderPath: 'notes/physics' },
      ],
    });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toContain('across 2 folders');
    expect(ctx).toContain('- owner/repo-a:notes/math');
    expect(ctx).toContain('- owner/repo-b:notes/physics');
    expect(ctx).toContain('Algebra basics');
    expect(ctx).toContain('Kinematics');
    expect(ctx).not.toContain('Newton laws');
  });

  it('filters notes by both folderPath and repoPath', () => {
    const item = baseItem({
      questionerSource: 'folder',
      questionerFolders: [{ repoPath: 'owner/repo-a', folderPath: 'notes/physics' }],
    });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toContain('Title: Newton laws');
    expect(ctx).not.toContain('Title: Kinematics');
  });

  it('reports empty folder selections gracefully', () => {
    const item = baseItem({
      questionerSource: 'folder',
      questionerFolders: [],
      tags: ['fallback'],
    });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toBe('topic tags: fallback');
  });

  it('handles folders with no notes found', () => {
    const item = baseItem({
      questionerSource: 'folder',
      questionerFolders: [{ repoPath: 'owner/repo-a', folderPath: 'notes/empty' }],
    });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toContain('(no notes found in selected folders)');
  });

  it('treats null source as default tags', () => {
    const item = baseItem({ questionerSource: null, tags: ['default-tag'] });
    const ctx = ScheduledLearningService.buildQuestionerPromptContext(item, FAKE_NOTES);
    expect(ctx).toBe('topic tags: default-tag');
  });
});