/** ============================================================
 *  Contest scope — league/match filtering shared by the contests feed
 *  (tabs + inline card selection) and the full player-selection screen.
 *  Lives in its own module (rather than inside HomeScreen.tsx or
 *  contests.ts) so it can import `MATCHES` from HomeScreen.tsx AND
 *  `Contest` from contests.ts without either of those two files having
 *  to import each other or this module — avoids a circular import.
 *  ============================================================ */

import { MATCHES } from './HomeScreen';
import type { Contest } from './contests';
import type { Selection } from './types';

/** Every distinct league a match belongs to, in a stable (first-seen)
    order — drives the feed's league tabs. */
export const LEAGUES: string[] = Array.from(
  new Set(MATCHES.map((m) => m.league)),
);

export function matchesForLeague(league: string) {
  return MATCHES.filter((m) => m.league === league);
}

/** Picks available inside a contest's scope: a single match if `matchId`
    is set, every match in `league` if it's not `'all'`, or everything. */
export function picksForContest(
  contest: Contest,
  picks: Selection[],
): Selection[] {
  if (contest.matchId) {
    return picks.filter((p) => p.matchId === contest.matchId);
  }
  if (contest.league !== 'all') {
    const ids = new Set(matchesForLeague(contest.league).map((m) => m.matchId));
    return picks.filter((p) => ids.has(p.matchId));
  }
  return picks;
}

/** Plain-text description of a contest's fixed scope, or null when it
    isn't scoped to anything narrower than "all leagues, all matches" (in
    which case the feed/full-screen nav tabs stay visible instead). */
export function contestScopeLabel(contest: Contest): string | null {
  if (contest.matchId) {
    const m = MATCHES.find((mm) => mm.matchId === contest.matchId);
    if (m) return `${m.league} · ${m.homeAbbrev} vs ${m.awayAbbrev} · ${m.matchTime}`;
  }
  if (contest.league !== 'all') return contest.league;
  return null;
}

/** A contest whose selection UI should be scoped to one league/match — the
    full-screen leagues row + match tabs are redundant (and misleading)
    when true, since there's nothing else to navigate to. */
export function isContestScoped(contest: Contest): boolean {
  return contest.league !== 'all' || !!contest.matchId;
}

/** A contest appears under a league tab if it's scoped to that league, or
    if it isn't restricted to any one league (`'all'`) — an unrestricted
    contest is never hidden by picking a specific league. Selecting a
    specific match additionally hides contests scoped to a different match;
    a contest with no `matchId` (league-wide or unrestricted) still shows
    under any match tab within its league. */
export function contestMatchesFeedFilters(
  contest: Contest,
  activeLeague: string,
  activeMatch: string,
): boolean {
  if (activeLeague !== 'all' && contest.league !== 'all' && contest.league !== activeLeague) {
    return false;
  }
  if (activeMatch !== 'all' && contest.matchId && contest.matchId !== activeMatch) {
    return false;
  }
  return true;
}

/** Base (suffix-stripped) selection ids currently in a draft — used to
    highlight which options are selected in the market accordion / feed
    chips. Mirrors App.tsx's own `baseSelectedIds` derivation. */
export function baseSelectedIds(selections: Selection[]): Set<string> {
  const s = new Set<string>();
  for (const sel of selections) {
    const lastDash = sel.id.lastIndexOf('-');
    s.add(sel.id.slice(0, lastDash));
  }
  return s;
}
