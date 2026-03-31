import { describe, it, expect, vi } from 'vitest';
import {
  emitPriceUpdate,
  setSocketIORef,
  hasSignificantChange,
  getDirection,
} from '../../src/websocket/realtime.js';

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('emitPriceUpdate', () => {
  it('emits price_update to the market room', () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    setSocketIORef({ to: mockTo } as any);

    emitPriceUpdate('market-1', 0, 5500, 1000);

    expect(mockTo).toHaveBeenCalledWith('market:market-1');
    expect(mockEmit).toHaveBeenCalledWith(
      'price_update',
      expect.objectContaining({
        type: 'price_update',
        marketId: 'market-1',
        outcomeId: 0,
        newPriceBps: 5500,
        volume: 1000,
      })
    );
    setSocketIORef(null as any);
  });

  it('does nothing when io is not initialized', () => {
    setSocketIORef(null as any);
    expect(() => emitPriceUpdate('market-1', 0, 5000, 100)).not.toThrow();
  });
});

describe('odds helpers', () => {
  it('hasSignificantChange: false for ≤1%', () => {
    expect(hasSignificantChange({ yes: 50, no: 50 }, { yes: 50.5, no: 49.5 }, 1)).toBe(false);
  });
  it('hasSignificantChange: true for >1%', () => {
    expect(hasSignificantChange({ yes: 50, no: 50 }, { yes: 51.1, no: 48.9 }, 1)).toBe(true);
  });
  it('getDirection: YES when yes odds increase', () => {
    expect(getDirection({ yes: 40, no: 60 }, { yes: 41, no: 59 })).toBe('YES');
  });
  it('getDirection: NO when yes odds decrease', () => {
    expect(getDirection({ yes: 60, no: 40 }, { yes: 59, no: 41 })).toBe('NO');
  });
});
