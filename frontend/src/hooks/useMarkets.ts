// ============================================================
// BOXMEOUT — useMarkets Hook
// Fetches and auto-refreshes the full market list.
// Contributors: implement the hook body.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import type { Market } from '../types';
import type { MarketFilters } from '../services/api';
import { fetchMarkets } from '../services/api';

export interface UseMarketsResult {
  markets: Market[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  /** Call to trigger a manual refetch */
  refetch: () => void;
}

/**
 * Fetches all boxing markets from the API.
 * Auto-polls every 30 seconds to pick up new markets and status changes.
 * Polling stops when the component using this hook unmounts.
 *
 * Returns stale data during a background refresh (isLoading stays false
 * to avoid layout flash — use a subtle spinner instead).
 */
export function useMarkets(filters?: MarketFilters): UseMarketsResult {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAndUpdate = useCallback(async () => {
    try {
      const response = await fetchMarkets(filters);
      setMarkets(response.markets);
      setTotal(response.total);
      setError(null);
      setIsLoading(false);
    } catch (e) {
      setError(e as Error);
      setIsLoading(false);
    }
  }, [filters]);

  const refetch = useCallback(() => {
    fetchAndUpdate();
  }, [fetchAndUpdate]);

  useEffect(() => {
    // Initial fetch
    fetchAndUpdate();

    // Set up polling interval every 30 seconds
    const intervalId = setInterval(() => {
      fetchAndUpdate();
    }, 30_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchAndUpdate]);

  return { markets, total, isLoading, error, refetch };
}
