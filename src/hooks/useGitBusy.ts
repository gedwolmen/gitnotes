import { useState } from 'react';

export function useGitBusy(repoId: string) {
  const [busy, setBusy] = useState(false);
  return { busy, setBusy };
}
