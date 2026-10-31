// Where a futures contract card leads.
//
// The outlook page used to be a dead end: it would read "Crude oil, leaning
// up, MCL ~$600 margin" and offer nothing to click, so the only way to act on
// it was a generic link to the practice page where the contract had to be
// found and typed again from memory. This builds the link that fixes that.

/** Whether a side should be carried into the ticket, and which. */
export type TicketSide = "BUY" | "SELL" | null;

/**
 * The practice-ticket URL for one contract.
 *
 * Two decisions are deliberate.
 *
 * The symbol is sent as the bare root. The practice page strips `.COMM` and
 * `futuresSpec` resolves by root as well as by full symbol, so both forms
 * behave identically — and the bare root is the form the ticket displays, so
 * the URL matches what the reader then sees.
 *
 * The side is sent only when the lean clears the bar for a fund. The page
 * prints a lean below that bar in grey, labelled "very weak"; prefilling a
 * direction behind it would have the app argue with itself and put a position
 * in the ticket that nothing on the page supports. Above the bar, carrying it
 * over saves a step on a call the page is already making out loud.
 */
export function ticketHref(
  contractSymbol: string,
  direction: TicketSide,
  clearsBar: boolean,
): string {
  const symbol = contractSymbol.trim().toUpperCase().replace(/\.COMM$/, "");
  const q = new URLSearchParams({ symbol });
  if (clearsBar && direction) q.set("side", direction);
  return `/paper?${q.toString()}`;
}
