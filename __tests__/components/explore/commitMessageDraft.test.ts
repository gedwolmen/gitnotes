import { describe, expect, it } from '@jest/globals';

import { buildCommitMessageDraft } from '../../../src/components/explore/commitMessageDraft';
import type { FileStatus } from '../../../src/services/git/engine/GitEngine';

describe('buildCommitMessageDraft', () => {
  it('maps Added and Untracked statuses to the Add category', () => {
    const statuses: FileStatus[] = [
      { path: 'new-note.md', status: 'Added' },
      { path: 'draft.md', status: 'Untracked' },
    ];
    expect(buildCommitMessageDraft(statuses)).toBe('Add: new-note.md, draft.md');
  });

  it('maps Modified status to the Edit category', () => {
    const statuses: FileStatus[] = [{ path: 'notes.md', status: 'Modified' }];
    expect(buildCommitMessageDraft(statuses)).toBe('Edit: notes.md');
  });

  it('maps Deleted status to the Delete category', () => {
    const statuses: FileStatus[] = [{ path: 'old.md', status: 'Deleted' }];
    expect(buildCommitMessageDraft(statuses)).toBe('Delete: old.md');
  });

  it('maps Renamed, TypeChange and Conflicted statuses to the Update category', () => {
    const statuses: FileStatus[] = [
      { path: 'moved.md', status: 'Renamed' },
      { path: 'link.md', status: 'TypeChange' },
      { path: 'merged.md', status: 'Conflicted' },
    ];
    expect(buildCommitMessageDraft(statuses)).toBe('Update: moved.md, link.md, merged.md');
  });

  it('skips Unmodified entries entirely', () => {
    const statuses: FileStatus[] = [
      { path: 'same.md', status: 'Unmodified' },
      { path: 'notes.md', status: 'Modified' },
    ];
    expect(buildCommitMessageDraft(statuses)).toBe('Edit: notes.md');
  });

  it('emits categories in fixed Add, Edit, Delete, Update order joined by newlines', () => {
    const statuses: FileStatus[] = [
      { path: 'moved.md', status: 'Renamed' },
      { path: 'gone.md', status: 'Deleted' },
      { path: 'changed.md', status: 'Modified' },
      { path: 'fresh.md', status: 'Added' },
    ];
    expect(buildCommitMessageDraft(statuses)).toBe(
      'Add: fresh.md\nEdit: changed.md\nDelete: gone.md\nUpdate: moved.md',
    );
  });

  it('caps each category at 8 paths and appends the overflow count', () => {
    const statuses: FileStatus[] = [];
    for (let index = 0; index < 11; index += 1) {
      statuses.push({ path: `note-${index}.md`, status: 'Modified' });
    }
    expect(buildCommitMessageDraft(statuses)).toBe(
      'Edit: note-0.md, note-1.md, note-2.md, note-3.md, note-4.md, note-5.md, note-6.md, note-7.md, … (+3 more)',
    );
  });

  it('returns an empty string when there are no entries', () => {
    expect(buildCommitMessageDraft([])).toBe('');
  });

  it('skips entries whose trimmed path is empty', () => {
    const statuses: FileStatus[] = [
      { path: '', status: 'Added' },
      { path: '   ', status: 'Modified' },
      { path: '  real.md  ', status: 'Modified' },
    ];
    expect(buildCommitMessageDraft(statuses)).toBe('Edit: real.md');
  });
});
