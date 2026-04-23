'use client';

import { useMarket } from '../../../hooks/useMarket';
import { useBet } from '../../../hooks/useBet';
import { MarketOddsBar } from '../../../components/market/MarketOddsBar';
import { MarketStatusBadge } from '../../../components/market/MarketStatusBadge';
import { CountdownTimer } from '../../../components/ui/CountdownTimer';
import { BetPanel } from '../../../components/bet/BetPanel';
import { stellarExplorerUrl } from '../../../services/wallet';

export default function MarketDetailContent({ market_id }: { market_id: string }): JSX.Element {
  const { market, isLoading, error } = useMarket(market_id);

  if (isLoading) {
    return <main className="max-w-4xl mx-auto px-4 py-8 text-gray-400">Loading…</main>;
  }

  if (error || !market) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-400">Market not found.</p>
      </main>
    );
  }

  const poolA = (parseInt(market.pool_a, 10) / 1e7).toFixed(2);
  const poolB = (parseInt(market.pool_b, 10) / 1e7).toFixed(2);
  const poolDraw = (parseInt(market.pool_draw, 10) / 1e7).toFixed(2);

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Fight header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <MarketStatusBadge status={market.status} />
          {market.title_fight && (
            <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">🏆 Title Fight</span>
          )}
          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">{market.weight_class}</span>
        </div>
        <h1 className="text-xl font-black text-white break-words">
          {market.fighter_a} <span className="text-gray-500">vs</span> {market.fighter_b}
        </h1>
        <p className="text-sm text-gray-400">{market.venue}</p>
        <CountdownTimer scheduled_at={market.scheduled_at} label="Starts in" />
      </div>

      {/* Odds bar + pool sizes */}
      <div className="space-y-2">
        <MarketOddsBar
          pool_a={market.pool_a}
          pool_b={market.pool_b}
          pool_draw={market.pool_draw}
          fighter_a={market.fighter_a}
          fighter_b={market.fighter_b}
        />
        <div className="flex flex-wrap justify-between text-xs text-gray-400 gap-2">
          <span>{poolA} XLM on {market.fighter_a}</span>
          <span>{poolDraw} XLM Draw</span>
          <span>{poolB} XLM on {market.fighter_b}</span>
        </div>
      </div>

      {/* Two-column on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BetPanel — full width mobile, right col desktop */}
        <div className="lg:col-start-3 lg:row-start-1">
          <BetPanel market={market} />
        </div>

        {/* Recent bets — full width mobile, spans 2 cols desktop */}
        <div className="lg:col-span-2 lg:row-start-1 space-y-3">
          <h2 className="text-white font-semibold">Recent Bets</h2>
          <p className="text-gray-500 text-sm">No recent bets yet.</p>
        </div>
      </div>

      {/* Oracle info — shown after resolved */}
      {market.status === 'resolved' && market.outcome && (
        <div className="bg-gray-900 rounded-xl p-4 text-sm space-y-3">
          <div>
            <p className="text-gray-400">Outcome: <span className="text-white font-semibold capitalize">{market.outcome.replace('_', ' ')}</span></p>
          </div>
          {market.oracle_address && (
            <div>
              <p className="text-gray-400">Oracle: </p>
              <a
                href={stellarExplorerUrl('account', market.oracle_address)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 underline font-mono text-xs break-all"
              >
                {market.oracle_address.slice(0, 16)}…
              </a>
            </div>
          )}
          {market.resolution_tx_hash && (
            <div>
              <p className="text-gray-400">Resolution TX: </p>
              <a
                href={stellarExplorerUrl('tx', market.resolution_tx_hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 underline font-mono text-xs break-all"
              >
                {market.resolution_tx_hash.slice(0, 16)}…
              </a>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
