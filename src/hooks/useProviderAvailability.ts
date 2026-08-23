import { useEffect, useState } from 'react';
import type { AIProviderConfig } from '../models/AIProvider';
import {
  Availability,
  resolveProviderAvailability,
} from '../services/ai/providerAvailability';

const PENDING: Availability = { kind: 'available' };
const PROBE_FAILED: Availability = {
  kind: 'unavailable',
  reason: { code: 'unknown', message: 'Provider availability probe failed' },
};

export function useProviderAvailability(provider: AIProviderConfig | null | undefined): Availability {
  const [availability, setAvailability] = useState<Availability>(PENDING);

  useEffect(() => {
    if (!provider) {
      setAvailability(PENDING);
      return;
    }

    let cancelled = false;
    resolveProviderAvailability(provider)
      .then((result) => {
        if (!cancelled) setAvailability(result);
      })
      .catch(() => {
        if (!cancelled) setAvailability(PROBE_FAILED);
      });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  return availability;
}

export function useProvidersAvailability(
  providers: AIProviderConfig[]
): Record<string, Availability> {
  const [map, setMap] = useState<Record<string, Availability>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        providers.map(async (provider) => {
          try {
            const result = await resolveProviderAvailability(provider);
            return [provider.id, result] as const;
          } catch {
            return [provider.id, PROBE_FAILED] as const;
          }
        })
      );
      if (cancelled) return;
      const next: Record<string, Availability> = {};
      for (const [id, value] of entries) next[id] = value;
      setMap(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [providers]);

  return map;
}
