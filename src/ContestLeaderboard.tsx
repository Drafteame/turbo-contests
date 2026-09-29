import { motion } from 'framer-motion';
import { Header } from './HomeScreen';
import { CONTEST_ACCENTS, getDisplayParticipants, type Contest } from './contests';
import {
  formatEntryDate,
  generateMockLeaderboard,
  type ContestEntry,
  type LeaderboardRow,
} from './contestEntries';

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

function initialsFor(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Medal-style treatment for the top 3 — a restrained gold/silver/bronze
    palette (never the contest's own accent, so it reads as "rank", not
    "this contest's brand"). Ranks 4+ get no special color at all. */
const PODIUM_STYLE: Record<1 | 2 | 3, { tint: string; plinth: string; avatarBg: string }> = {
  1: {
    tint: '#f6c945',
    plinth: 'linear-gradient(to top, rgba(246,201,69,0.24), rgba(246,201,69,0.03))',
    avatarBg: 'linear-gradient(140deg, #ffe08a 0%, #f6c945 100%)',
  },
  2: {
    tint: '#cbd5e1',
    plinth: 'linear-gradient(to top, rgba(203,213,225,0.2), rgba(203,213,225,0.03))',
    avatarBg: 'linear-gradient(140deg, #eef1f5 0%, #b7c0cc 100%)',
  },
  3: {
    tint: '#d99a6c',
    plinth: 'linear-gradient(to top, rgba(217,154,108,0.2), rgba(217,154,108,0.03))',
    avatarBg: 'linear-gradient(140deg, #f0b98a 0%, #c97f4d 100%)',
  },
};

function Avatar({
  name,
  size,
  background,
}: {
  name: string;
  size: number;
  background: string;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundImage: background,
        fontFamily: 'Red Hat Display, sans-serif',
        fontSize: size * 0.34,
        fontWeight: 900,
        color: '#0a0a0a',
      }}
    >
      {initialsFor(name)}
    </div>
  );
}

/* ============================================================ */
/*  Podium — top 3 get real hierarchy (bigger avatar, a raised    */
/*  plinth, medal tint) instead of just another row. Order on     */
/*  screen is 2nd · 1st · 3rd (the familiar podium arrangement),  */
/*  #1 visibly taller/larger than the other two.                  */
/* ============================================================ */
function PodiumColumn({ row, rank }: { row: LeaderboardRow; rank: 1 | 2 | 3 }) {
  const style = PODIUM_STYLE[rank];
  const avatarSize = rank === 1 ? 60 : 46;
  const plinthHeight = rank === 1 ? 68 : rank === 2 ? 50 : 38;
  return (
    <motion.div
      className="flex flex-1 flex-col items-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: rank === 1 ? 0 : 0.08 }}
    >
      <div className="relative">
        <Avatar name={row.name} size={avatarSize} background={style.avatarBg} />
        <div
          className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black"
          style={{
            fontFamily: 'Red Hat Display, sans-serif',
            backgroundColor: style.tint,
            color: '#0a0a0a',
            boxShadow: '0 0 0 2px #0a0a0a',
          }}
        >
          {rank}
        </div>
      </div>
      <span
        className="mt-2 max-w-[84px] truncate text-[12px] font-bold leading-[16px] text-[#fbfbfb]"
        style={{ fontFamily: 'Red Hat Display, sans-serif' }}
      >
        {row.name}
      </span>
      <span
        className="text-[13px] font-black leading-[18px]"
        style={{ fontFamily: 'Red Hat Display, sans-serif', color: style.tint }}
      >
        {formatCount(row.points)} pts
      </span>
      <motion.div
        aria-hidden
        className="mt-2 w-full rounded-t-[10px]"
        style={{ backgroundImage: style.plinth }}
        initial={{ height: 0 }}
        animate={{ height: plinthHeight }}
        transition={{ duration: 0.4, delay: 0.05 }}
      />
    </motion.div>
  );
}

/* ============================================================ */
/*  A rank-4+ row — flat rank badge, name, and a proportional     */
/*  points bar (relative to the leader) so standing is scannable  */
/*  at a glance, not just a number to read.                       */
/* ============================================================ */
function LeaderboardRowView({
  row,
  maxPoints,
  index,
}: {
  row: LeaderboardRow;
  maxPoints: number;
  index: number;
}) {
  const pct = Math.max(6, Math.round((row.points / maxPoints) * 100));
  return (
    <motion.div
      className="flex items-center gap-3 border-b border-[rgba(251,251,251,0.06)] py-2.5 last:border-b-0"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index, 6) * 0.03 }}
    >
      <div
        className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-bold text-[rgba(251,251,251,0.6)]"
        style={{ fontFamily: 'Red Hat Display, sans-serif', backgroundColor: 'rgba(251,251,251,0.08)' }}
      >
        {row.rank}
      </div>
      <div className="flex min-w-px flex-1 flex-col gap-1">
        <span
          className="truncate text-[13px] font-bold leading-[17px] text-[#fbfbfb]"
          style={{ fontFamily: 'Red Hat Display, sans-serif' }}
        >
          {row.name}
        </span>
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-[rgba(251,251,251,0.08)]">
          <motion.div
            className="h-full rounded-full bg-[rgba(251,251,251,0.32)]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, delay: 0.1 }}
          />
        </div>
      </div>
      <span
        className="shrink-0 text-[13px] font-black leading-[19px] text-[rgba(251,251,251,0.85)]"
        style={{ fontFamily: 'Red Hat Display, sans-serif' }}
      >
        {formatCount(row.points)} pts
      </span>
    </motion.div>
  );
}

/* ============================================================ */
/*  One entry row in "Tus entradas" — tapping it opens the        */
/*  read-only entry-detail sheet (ContestEntrySheet, mounted at    */
/*  App.tsx's root level). Always "Pendiente" — no fabricated      */
/*  score/rank, since this prototype has no scoring engine yet.    */
/* ============================================================ */
function MyEntryCard({
  entry,
  index,
  onSelect,
}: {
  entry: ContestEntry;
  index: number;
  onSelect: () => void;
}) {
  const preview = entry.selections.slice(0, 2);
  const extra = entry.selections.length - preview.length;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-[16px] border border-[rgba(251,251,251,0.08)] bg-[rgba(251,251,251,0.045)] p-3 text-left transition-colors active:bg-[rgba(251,251,251,0.08)]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className="text-[12px] font-bold leading-[17px] text-[rgba(251,251,251,0.6)]"
          style={{ fontFamily: 'Red Hat Display, sans-serif' }}
        >
          Entrada #{index + 1} · {formatEntryDate(entry.createdAt)}
        </span>
        <span
          className="inline-flex shrink-0 items-center rounded-[6px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{
            fontFamily: 'Red Hat Display, sans-serif',
            color: '#ffd166',
            borderColor: 'rgba(255,209,102,0.4)',
            backgroundColor: 'rgba(255,209,102,0.1)',
          }}
        >
          Pendiente
        </span>
      </div>
      <p
        className="truncate text-[12px] font-medium leading-[17px] text-[rgba(251,251,251,0.75)]"
        style={{ fontFamily: 'Red Hat Display, sans-serif' }}
      >
        {preview.map((s) => s.pick).join(' · ')}
        {extra > 0 ? ` +${extra} más` : ''}
      </p>
    </button>
  );
}

/* ============================================================ */
/*  ContestLeaderboard — opened for a joined contest. Shows a     */
/*  gamified podium + ranked standings board (deterministic,      */
/*  never includes the user) plus the user's own entries for      */
/*  this contest (always "Pendiente" — no scoring engine exists    */
/*  yet). Tapping an entry opens its read-only detail sheet.       */
/*  "Crear otra entrada" routes back into the normal draft flow.   */
/* ============================================================ */
export function ContestLeaderboard({
  contest,
  entries,
  onBack,
  onCreateEntry,
  onSelectEntry,
}: {
  contest: Contest;
  entries: ContestEntry[];
  onBack: () => void;
  onCreateEntry: () => void;
  onSelectEntry: (id: string) => void;
}) {
  const accent = CONTEST_ACCENTS[contest.accent];
  const leaderboard = generateMockLeaderboard(contest);
  const podium = leaderboard.filter((r) => r.rank <= 3) as [
    LeaderboardRow,
    LeaderboardRow,
    LeaderboardRow,
  ];
  const rest = leaderboard.filter((r) => r.rank > 3);
  const maxPoints = leaderboard[0]?.points ?? 1;
  const participating = entries.length > 0;

  return (
    <div className="flex w-full flex-col">
      <div className="sticky top-0 z-30 bg-black [@media(min-width:431px)_and_(pointer:fine)]:pt-11">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[100px]"
          style={{ backgroundImage: accent.gradient, filter: 'blur(50px)', opacity: 0.4 }}
        />
        <Header onBack={onBack} title={contest.name} />
      </div>

      {/* Contest summary strip — reuses the feed card's own entrada/gana
          hasta layout so the two screens read as one system. */}
      <div className="px-3 pt-4">
        <div className="rounded-[20px] border border-[rgba(251,251,251,0.08)] bg-[rgba(251,251,251,0.045)] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium leading-[17px] text-[rgba(251,251,251,0.5)]" style={{ fontFamily: 'Red Hat Display, sans-serif' }}>
            <span className="whitespace-nowrap">
              {formatCount(getDisplayParticipants(contest, participating))} jugando
            </span>
            <span aria-hidden className="text-[rgba(251,251,251,0.28)]">·</span>
            <span className="whitespace-nowrap">{entries.length} tuya{entries.length === 1 ? '' : 's'}</span>
          </div>
          <div className="flex items-stretch">
            <div className="flex flex-1 flex-col">
              <span className="text-[16px] font-black leading-[21px] text-[#fbfbfb]" style={{ fontFamily: 'Red Hat Display, sans-serif' }}>
                {formatUsd(contest.entryCost)}
              </span>
              <span className="mt-0.5 text-[10px] font-bold uppercase leading-[13px] tracking-wide text-[rgba(251,251,251,0.44)]" style={{ fontFamily: 'Red Hat Display, sans-serif' }}>
                Entrada
              </span>
            </div>
            <div aria-hidden className="mx-3 w-px self-stretch bg-[rgba(251,251,251,0.12)]" />
            <div className="flex flex-1 flex-col items-end text-right">
              <span className="text-[18px] font-black leading-[23px] text-[#fbfbfb]" style={{ fontFamily: 'Red Hat Display, sans-serif' }}>
                {formatUsd(contest.potentialWinnings)}
              </span>
              <span className="mt-0.5 text-[10px] font-bold uppercase leading-[13px] tracking-wide" style={{ fontFamily: 'Red Hat Display, sans-serif', color: accent.tint }}>
                Gana hasta
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Crear otra entrada — the explicit re-entry action. */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={onCreateEntry}
          className="relative flex h-11 w-full items-center justify-center rounded-[56px] active:scale-[0.97] transition-transform"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[56px]"
            style={{ backgroundImage: accent.gradient }}
          />
          <span
            className="relative text-[14px] font-bold leading-[21px]"
            style={{ fontFamily: 'Red Hat Display, sans-serif', color: accent.ctaTextColor }}
          >
            + Crear otra entrada
          </span>
        </button>
      </div>

      {/* Tus entradas — tap any entry to see its full selections in a
          read-only sheet. Always "Pendiente": this prototype has no
          scoring engine, so we never invent a live score/rank here. */}
      <div className="px-3 pt-5">
        <h2 className="text-[15px] font-black italic leading-[19px] text-[#fbfbfb]" style={{ fontFamily: 'Red Hat Display, sans-serif' }}>
          Tus entradas
        </h2>
        <div className="mt-2.5 flex flex-col gap-2">
          {entries.length === 0 ? (
            <p className="text-[12px] font-medium leading-[17px] text-[rgba(251,251,251,0.5)]" style={{ fontFamily: 'Red Hat Display, sans-serif' }}>
              Todavía no tienes entradas en este contest.
            </p>
          ) : (
            entries.map((entry, i) => (
              <MyEntryCard
                key={entry.id}
                entry={entry}
                index={i}
                onSelect={() => onSelectEntry(entry.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Clasificación — mock competitor standings, deterministic per
          contest. Never includes the current user (see contestEntries.ts).
          Top 3 get a podium treatment for real visual hierarchy; the rest
          are a scannable ranked list with a relative points bar. */}
      <div className="px-3 pb-6 pt-6">
        <h2 className="text-[15px] font-black italic leading-[19px] text-[#fbfbfb]" style={{ fontFamily: 'Red Hat Display, sans-serif' }}>
          Clasificación
        </h2>
        <p className="mt-1 text-[11px] font-medium leading-[15px] text-[rgba(251,251,251,0.4)]" style={{ fontFamily: 'Red Hat Display, sans-serif' }}>
          Vista previa del contest — la clasificación final se calcula cuando terminan los partidos.
        </p>

        {podium.length === 3 && (
          <div
            className="mt-3 flex items-end gap-2 rounded-[20px] border border-[rgba(251,251,251,0.08)] px-3 pt-4"
            style={{
              backgroundImage: `linear-gradient(180deg, ${accent.glow} 0%, rgba(251,251,251,0.02) 65%)`,
            }}
          >
            <PodiumColumn row={podium[1]} rank={2} />
            <PodiumColumn row={podium[0]} rank={1} />
            <PodiumColumn row={podium[2]} rank={3} />
          </div>
        )}

        {rest.length > 0 && (
          <div className="mt-2.5 rounded-[20px] border border-[rgba(251,251,251,0.08)] bg-[rgba(251,251,251,0.045)] px-3">
            {rest.map((row, i) => (
              <LeaderboardRowView key={row.rank} row={row} maxPoints={maxPoints} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
