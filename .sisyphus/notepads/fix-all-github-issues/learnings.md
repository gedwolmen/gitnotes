## Learnings
- Offline banners can stay lightweight by reading `useNetworkStatus` directly and returning `null` when connected.
- For UI tests, mocking theme/network hooks is enough; no provider setup is needed for a simple present/hidden assertion.
- Todo completion has to persist the same sorted order used by the list UI; otherwise refresh can reload a stale top-of-list ordering and cause visible reflow glitches.
- Toggling a repo-backed todo must sync its updated `completed` state back to GitHub, or the next pull will overwrite the local completion state.
