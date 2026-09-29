/** ============================================================
 *  Contest entries — local persistence + deterministic mock leaderboard.
 *
 *  A "contest entry" is created once per successful `enterContest()` call
 *  in App.tsx (see `finishEntryCreated`). Entries are stored in
 *  localStorage so the joined state (and the entry history) survives a
 *  page reload — there's no backend yet, this is prototype-only storage.
 *
 *  Every entry is created `status: 'pending'` and STAYS pending: this
 *  prototype has no scoring engine, so we never invent a live score,
 *  rank, or win/loss result for a user's own entry. The mock leaderboard
 *  (`generateMockLeaderboard`) is a SEPARATE, clearly-fake set of other
 *  competitors — it never includes the current user.
 *  ============================================================ */

import type { Contest } from './contests';
import type { Selection } from './types';

export type ContestEntryStatus = 'pending';

/** Just enough of a Selection to render an entry's picks later — not the
    full object (id/matchId/groupId are draft-time only, meaningless once
    the entry is saved). */
export type ContestEntrySelection = Pick<
  Selection,
  | 'market'
  | 'pick'
  | 'odds'
  | 'homeAbbrev'
  | 'awayAbbrev'
  | 'matchTime'
  | 'threshold'
  | 'side'
>;

export type ContestEntry = {
  id: string;
  contestId: string;
  createdAt: number;
  selections: ContestEntrySelection[];
  status: ContestEntryStatus;
};

const STORAGE_KEY = 'tc:contest-entries:v1';

function readAll(): ContestEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: ContestEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable (private mode, quota) — entries still work for
    // the rest of this session, just won't survive a reload.
  }
}

export function loadContestEntries(): ContestEntry[] {
  return readAll();
}

/** Persists a new entry for `contestId` from the current draft
    `selections`, and returns it so the caller can append it to its own
    in-memory state without re-reading storage. */
export function saveContestEntry(
  contestId: string,
  selections: Selection[],
): ContestEntry {
  const entry: ContestEntry = {
    id: `${contestId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    contestId,
    createdAt: Date.now(),
    selections: selections.map((s) => ({
      market: s.market,
      pick: s.pick,
      odds: s.odds,
      homeAbbrev: s.homeAbbrev,
      awayAbbrev: s.awayAbbrev,
      matchTime: s.matchTime,
      threshold: s.threshold,
      side: s.side,
    })),
    status: 'pending',
  };
  writeAll([...readAll(), entry]);
  return entry;
}

export function entriesForContest(
  entries: ContestEntry[],
  contestId: string,
): ContestEntry[] {
  return entries.filter((e) => e.contestId === contestId);
}

/** Shared formatting so the leaderboard's "Tus entradas" list and the
    read-only entry-detail sheet render identical text. */
export function formatEntryDate(ms: number): string {
  return new Date(ms).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatEntrySelectionLabel(s: ContestEntrySelection): string {
  const sideLabel = s.side === 'mas' ? 'Más' : 'Menos';
  return `${sideLabel} ${s.threshold}`;
}

/* ============================================================ */
/*  Deterministic mock leaderboard                              */
/*  Same contest → same rows, every time, no backend needed.    */
/*  Never includes the current user — their own entries stay    */
/*  pending and are shown separately (see ContestLeaderboard).  */
/* ============================================================ */

const FIRST_NAMES = [
  'Carlos', 'Ana', 'Luis', 'Sofía', 'Diego', 'Valentina', 'Miguel', 'Camila',
  'Jorge', 'Fernanda', 'Andrés', 'Paola', 'Ricardo', 'Gabriela', 'Sergio',
  'Daniela', 'Alejandro', 'Mariana', 'Iván', 'Renata', 'Óscar', 'Ximena',
  'Pablo', 'Lucía',
];
const LAST_INITIALS = [
  'M.', 'R.', 'F.', 'G.', 'P.', 'S.', 'T.', 'V.', 'C.', 'L.', 'B.', 'N.',
];

/** xmur3 + xorshift-ish string seed → deterministic [0,1) generator. */
function seededRandom(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export type LeaderboardRow = {
  rank: number;
  name: string;
  points: number;
};

/** A believable, stable top-N board for a contest — seeded off the
    contest's own id, so it never reshuffles between visits/reloads. Row
    count and point scale both track the contest's own numbers (bigger
    prize pool / more participants → more rows, higher points) without
    ever trying to render its full (mock) participant count. */
export function generateMockLeaderboard(contest: Contest): LeaderboardRow[] {
  const rng = seededRandom(contest.id);
  const rowCount = Math.min(12, Math.max(6, Math.round(contest.participants / 400) + 6));
  const basePoints = 40 + contest.maxSelections * 8;

  const usedNames = new Set<string>();
  const rows: LeaderboardRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    let name = '';
    let guard = 0;
    do {
      const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
      const last = LAST_INITIALS[Math.floor(rng() * LAST_INITIALS.length)];
      name = `${first} ${last}`;
      guard += 1;
    } while (usedNames.has(name) && guard < 20);
    usedNames.add(name);

    const decay = 1 - i / (rowCount + 2);
    const points = Math.max(1, Math.round((basePoints + rng() * basePoints * 1.4) * decay));
    rows.push({ rank: 0, name, points });
  }

  rows.sort((a, b) => b.points - a.points);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}
