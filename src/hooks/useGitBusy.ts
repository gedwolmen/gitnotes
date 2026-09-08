import { useState } from 'react';

export function useGitBusy(_repoId: string) {
  const [busy, setBusy] = useState(false);
  return { busy, setBusy };
}
