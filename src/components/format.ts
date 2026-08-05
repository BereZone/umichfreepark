/**
 * Presentation of engine numbers. Shared so the map and the list cannot word
 * the same fact differently.
 *
 * Nothing here decides anything — every function takes a value the engine
 * already computed and chooses how to spell it. Rules, prices and walking times
 * are the engine's; "Free" versus "$0.00" is ours.
 */

/**
 * Cents as money, or the word Free.
 *
 * Zero is spelled out rather than shown as "$0.00" because a price of nothing
 * is the answer the user is looking for, and a row of zeros reads like a
 * placeholder for a number we failed to load.
 */
export function money(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * What a stay costs, given the engine's answer.
 *
 * Null from `costCents` covers two different situations that must never both
 * become "$0.00": a permit lot where there is nothing to buy, and a rate we
 * could not source. They get different words, because the user's next action is
 * different — one means "you cannot park here", the other means "go read the
 * sign".
 */
export function priceFor(
  cents: number | null,
  rateKind: 'free' | 'hourly' | 'flat' | 'permit-only' | 'unknown'
): string {
  if (cents !== null) return money(cents);
  return rateKind === 'permit-only' ? 'Permit only' : 'See sign';
}

/**
 * The engine's reason, minus the part the price column already said.
 *
 * `statusOf` returns sentences that stand on their own — "Free — outside posted
 * enforcement hours" — which is right for the detail panel, where it is the
 * only explanation on screen. In a list it is not: eight consecutive rows each
 * opened with "Free — " while the price beside them also said Free, so the one
 * clause that differed between them started a third of the way into the line
 * and the eye had nothing to scan.
 *
 * Only the leading status word is dropped, and only when the row is already
 * showing it. If the sentence does not start that way it is returned untouched,
 * so a rewording upstream degrades to showing slightly more rather than to
 * silently losing text.
 */
export function reasonDetail(reason: string): string {
  const trimmed = reason.replace(/^(Free|Paid)\s+—\s+/, '');
  if (trimmed === reason) return reason;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Walking time, rounded up. A 61-second walk is "2 min", never "1 min". */
export function walkLabel(seconds: number | null): string | null {
  if (seconds === null) return null;
  return `${Math.ceil(seconds / 60)} min walk`;
}
