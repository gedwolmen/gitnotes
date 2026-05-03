## Learnings
- Offline banners can stay lightweight by reading `useNetworkStatus` directly and returning `null` when connected.
- For UI tests, mocking theme/network hooks is enough; no provider setup is needed for a simple present/hidden assertion.
