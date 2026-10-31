// The link from a game card to that game's page.
//
// `sportKey` on a prediction is the sport and the league joined with an
// underscore, and the league half can itself contain hyphens and dots
// ("football_college-football", "soccer_eng.1"). So it splits on the FIRST
// underscore only — splitting on every one would turn college football into
// the league "college" and lose the rest.

export type GameLinkParts = { sport: string; league: string };

/** Split a prediction's sportKey, or null when it is not one. */
export function splitSportKey(sportKey: string): GameLinkParts | null {
  const i = sportKey.indexOf("_");
  if (i <= 0) return null;
  const sport = sportKey.slice(0, i).trim();
  const league = sportKey.slice(i + 1).trim();
  if (!sport || !league) return null;
  return { sport, league };
}

/**
 * Where a game card leads, or null when it cannot lead anywhere.
 *
 * Null rather than a broken link: a card whose key or id we cannot read stays
 * un-clickable, which is honest, instead of offering a tap that lands on an
 * error page.
 */
export function gameHref(sportKey: string, eventId: string): string | null {
  const parts = splitSportKey(sportKey);
  if (!parts) return null;
  return detailHref(parts.sport, parts.league, eventId);
}

/**
 * The same link for a "more sports" event, which carries its sport and league
 * explicitly rather than folded into a key.
 *
 * Null for anything ESPN does not serve — chess comes from Lichess and already
 * links there, and a cricket match whose competition the feed did not identify
 * cannot be asked for. A card with no link beats a link that 404s.
 */
export function eventHref(
  espnSport: string | null,
  espnLeague: string | null,
  eventId: string,
): string | null {
  if (!espnSport || !espnLeague) return null;
  return detailHref(espnSport, espnLeague, eventId);
}

function detailHref(sport: string, league: string, eventId: string): string | null {
  const event = eventId.trim();
  // The route accepts digits only, so anything else is not linked.
  if (!/^\d{1,20}$/.test(event)) return null;
  const q = new URLSearchParams({ sport, league, event });
  return `/sports/game?${q.toString()}`;
}
