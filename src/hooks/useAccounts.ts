import { useEffect, useState } from 'react';
import { AuthService } from '../services/AuthService';

export const useActiveAccount = () => {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof AuthService.getActiveSummary>> | null>(null);
  useEffect(() => {
    void AuthService.getActiveSummary().then(setSummary);
  }, []);
  return summary;
};
