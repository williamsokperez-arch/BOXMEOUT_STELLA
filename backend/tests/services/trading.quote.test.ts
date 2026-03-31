import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradingService } from '../../src/services/trading.service.js';
import { ammService } from '../../src/services/blockchain/amm.js';

// Mock AMM service
vi.mock('../../src/services/blockchain/amm.js', () => ({
  ammService: {
    getTradeQuote: vi.fn(),
  },
}));

describe('TradingService.getQuote()', () => {
  let service: TradingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TradingService();
  });

  it('should fetch a quote from ammService and return it', async () => {
    const mockQuote = {
      sharesReceived: 100,
      pricePerUnit: 0.5,
      totalCost: 50,
      feeAmount: 1,
      priceImpactBps: 10,
    };

    vi.mocked(ammService.getTradeQuote).mockResolvedValue(mockQuote as any);

    const result = await service.getQuote({
      marketId: 'market-1',
      outcome: 1,
      amount: 50,
      side: 'buy',
    });

    expect(ammService.getTradeQuote).toHaveBeenCalledWith({
      marketId: 'market-1',
      outcome: 1,
      amount: 50,
      isBuy: true,
    });

    expect(result).toEqual({
      sharesOut: 100,
      avgPriceBps: 5000,
      priceImpactBps: 10,
      totalFees: 1,
    });
  });

  it('should use cache for subsequent calls within TTL', async () => {
    const mockQuote = {
      sharesReceived: 100,
      pricePerUnit: 0.5,
      totalCost: 50,
      feeAmount: 1,
      priceImpactBps: 10,
    };

    vi.mocked(ammService.getTradeQuote).mockResolvedValue(mockQuote as any);

    // First call
    await service.getQuote({
      marketId: 'm1',
      outcome: 1,
      amount: 10,
      side: 'buy',
    });

    // Second call (same params)
    await service.getQuote({
      marketId: 'm1',
      outcome: 1,
      amount: 10,
      side: 'buy',
    });

    expect(ammService.getTradeQuote).toHaveBeenCalledTimes(1);
  });

  it('should refresh cache after TTL', async () => {
    const mockQuote = {
      sharesReceived: 100,
      pricePerUnit: 0.5,
      totalCost: 50,
      feeAmount: 1,
      priceImpactBps: 10,
    };

    vi.mocked(ammService.getTradeQuote).mockResolvedValue(mockQuote as any);

    // First call
    await service.getQuote({
      marketId: 'm1',
      outcome: 1,
      amount: 10,
      side: 'buy',
    });

    // Advance time (using vi.useFakeTimers if necessary, but here it's easier to just wait or mock Date.now)
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 3000); // +3 seconds

    // Second call
    await service.getQuote({
      marketId: 'm1',
      outcome: 1,
      amount: 10,
      side: 'buy',
    });

    expect(ammService.getTradeQuote).toHaveBeenCalledTimes(2);
    
    vi.restoreAllMocks();
  });
});
