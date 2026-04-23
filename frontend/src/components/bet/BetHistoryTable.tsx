// ============================================================
// BOXMEOUT — BetHistoryTable Component
// ============================================================

import { stellarExplorerUrl } from '../../services/wallet';
import type { Bet } from '../../types';

interface BetHistoryTableProps {
  bets: Bet[];
  /** Called when user clicks "Claim" on an eligible row */
  onClaim: (market_contract_address: string) => void;
  /** Called when user clicks "Refund" on a cancelled market row */
  onRefund: (market_contract_address: string) => void;
}

/**
 * Table of bets, typically shown on the Portfolio page.
 *
 * Columns: Market | Side | Amount (XLM) | Status | Payout (XLM) | Action
 *
 * Action column rules:
 *   - Bet is on winning side + unclaimed  → show "Claim" button
 *   - Market is cancelled + unclaimed     → show "Refund" button
 *   - Already claimed                     → show payout amount in green
 *   - Bet lost                            → show "-" (no action)
 *   - Market not yet resolved             → show "Pending"
 *
 * Renders an empty state message when bets array is empty.
 */
export function BetHistoryTable({
  bets,
  onClaim,
  onRefund,
}: BetHistoryTableProps): JSX.Element {
  if (bets.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-6">No bets yet.</p>;
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="min-w-full text-sm text-left text-gray-300">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-800">
            <th className="pb-2 pr-4 whitespace-nowrap">Market</th>
            <th className="pb-2 pr-4 whitespace-nowrap">Side</th>
            <th className="pb-2 pr-4 whitespace-nowrap">Amount (XLM)</th>
            <th className="pb-2 pr-4 whitespace-nowrap">Status</th>
            <th className="pb-2 pr-4 whitespace-nowrap">Payout (XLM)</th>
            <th className="pb-2 whitespace-nowrap">Action</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((bet) => {
            const payout = bet.payout ? parseFloat(bet.payout) : null;

            let action: JSX.Element;
            if (bet.claimed) {
              action = <span className="text-green-400">{payout != null ? `${payout.toFixed(2)} XLM` : '—'}</span>;
            } else if (payout != null && payout > 0) {
              action = (
                <button
                  onClick={() => onClaim(bet.market_id)}
                  className="min-h-[44px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black text-xs"
                >
                  Claim
                </button>
              );
            } else if (payout != null && payout < 0) {
              action = (
                <button
                  onClick={() => onRefund(bet.market_id)}
                  className="min-h-[44px] px-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs"
                >
                  Refund
                </button>
              );
            } else if (payout === 0) {
              action = <span className="text-gray-500">—</span>;
            } else {
              action = <span className="text-gray-500">Pending</span>;
            }

            return (
              <tr key={bet.tx_hash} className="border-b border-gray-800/50 group">
                <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">
                  <a
                    href={stellarExplorerUrl('tx', bet.tx_hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:text-amber-300 hover:underline"
                    title={bet.tx_hash}
                  >
                    {bet.market_id.slice(0, 8)}…
                  </a>
                </td>
                <td className="py-3 pr-4 capitalize whitespace-nowrap">{bet.side.replace('_', ' ')}</td>
                <td className="py-3 pr-4 whitespace-nowrap">{bet.amount_xlm} XLM</td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  {bet.claimed 
                    ? 'Claimed' 
                    : payout != null 
                      ? (payout > 0 ? 'Won' : payout < 0 ? 'Cancelled' : 'Lost') 
                      : 'Active'
                  }
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">{payout != null ? `${payout.toFixed(2)} XLM` : '—'}</td>
                <td className="py-3 whitespace-nowrap">{action}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
