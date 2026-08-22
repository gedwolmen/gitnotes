import { useEffect, useState } from 'react';
import {
  getForegroundSyncHealth,
  subscribeForegroundSync,
  type ForegroundSyncHealth,
} from '../services/ForegroundSyncService';

export function useForegroundSyncHealth(): ForegroundSyncHealth {
  const [health, setHealth] = useState<ForegroundSyncHealth>(getForegroundSyncHealth);

  useEffect(() => subscribeForegroundSync(() => {
    setHealth(getForegroundSyncHealth());
  }), []);

  return health;
}
