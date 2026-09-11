import { githubActivity, useGitHubActivityStore } from '@/stores/githubActivityStore';

describe('github activity store', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useGitHubActivityStore.getState().reset();
  });

  afterEach(() => {
    useGitHubActivityStore.getState().reset();
    jest.useRealTimers();
  });

  it('keeps the active label while the indicator waits to hide', () => {
    githubActivity.begin('Syncing…');
    jest.advanceTimersByTime(300);

    githubActivity.end();

    expect(useGitHubActivityStore.getState()).toEqual(expect.objectContaining({
      visible: true,
      label: 'Syncing…',
    }));

    jest.advanceTimersByTime(300);

    expect(useGitHubActivityStore.getState()).toEqual(expect.objectContaining({
      visible: false,
      label: null,
    }));
  });
});
