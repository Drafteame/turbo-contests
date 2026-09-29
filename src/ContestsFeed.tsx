import { Header } from './HomeScreen';
import popularIcon from './assets/popular.svg';
import { CONTEST_ACCENTS, getDisplayParticipants, type Contest } from './contests';

/** Format a USD amount with thousands separators, no decimals — every
    amount here is prototype/mock data, not a real balance. */
function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/* ============================================================ */
/*  One contest card — name, participants, selection range,     */
/*  fixed entry cost, potential winnings, and the "Jugar" CTA.   */
/*  Visual identity (gradient + glow) comes from `contest.accent`  */
/*  (see contests.ts — every gradient here already exists          */
/*  elsewhere in the app). Hierarchy, top to bottom: name (most     */
/*  prominent) → participants/selection range (small, scannable)    */
/*  → entrada/gana hasta + Jugar (the action panel, second most      */
/*  prominent). No decorative icons — only the one existing "popular" */
/*  flame icon, reused for its established meaning.                    */
/* ============================================================ */
function ContestCard({
  contest,
  onPlay,
  onViewLeaderboard,
  participating,
  entryCount,
}: {
  contest: Contest;
  onPlay: (id: string) => void;
  onViewLeaderboard: (id: string) => void;
  /** True once the player has entered this contest at least once (derived
      from App.tsx's persisted contest entries — see contestEntries.ts).
      Purely informational — re-entering the same contest is still
      allowed. */
  participating: boolean;
  /** How many entries the player has created in this contest. */
  entryCount: number;
}) {
  const accent = CONTEST_ACCENTS[contest.accent];
  // Plain-Spanish, unambiguous — matches this app's own wording for a pick
  // ("Haz 1 selección" / "Haz min. 2 selec." on the bet slip pill).
  const selectionLabel =
    contest.minSelections === contest.maxSelections
      ? `Elige ${contest.minSelections} selecci${contest.minSelections === 1 ? 'ón' : 'ones'}`
      : `Elige de ${contest.minSelections} a ${contest.maxSelections} selecciones`;

  return (
    <div
      className="relative w-full overflow-hidden rounded-[24px] border bg-black p-4"
      style={{
        borderColor: accent.ring,
        boxShadow: '0 14px 28px -12px rgba(0,0,0,0.65)',
      }}
    >
      {/* Ambient glow — restrained, static blurred accent circle in the
          corner. Purely decorative (aria-hidden), sits behind the content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 z-0 h-36 w-36 rounded-full"
        style={{ background: accent.glow, filter: 'blur(44px)' }}
      />
      {/* Top accent bar — the one recurring signature every card shares. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundImage: accent.gradient }}
      />

      <div className="relative z-10 flex flex-col gap-2.5">
        {/* Badge — corner tag, plain text (only "POPULAR" pairs with the
            app's existing flame icon, since that icon's meaning fits). */}
        {(contest.badge || participating) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {contest.badge && (
              <span
                className="inline-flex w-fit items-center gap-1 rounded-[6px] border px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  fontFamily: 'Red Hat Display, sans-serif',
                  color: accent.tint,
                  borderColor: accent.ring,
                  backgroundColor: 'rgba(251,251,251,0.06)',
                }}
              >
                {contest.badgeIcon && (
                  <img src={popularIcon} alt="" aria-hidden className="h-3 w-3" />
                )}
                {contest.badge}
              </span>
            )}
            {/* Participation status — purely informational, never blocks
                re-entering the same contest. Includes the entry count
                once the player has more than one entry here. */}
            {participating && (
              <span
                className="inline-flex w-fit items-center gap-1 rounded-[6px] border px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  fontFamily: 'Red Hat Display, sans-serif',
                  color: '#29C28A',
                  borderColor: 'rgba(41,194,138,0.4)',
                  backgroundColor: 'rgba(41,194,138,0.1)',
                }}
              >
                ✓ Participando{entryCount > 1 ? ` · ${entryCount} entradas` : ''}
              </span>
            )}
          </div>
        )}

        {/* Name + tagline — the card's most prominent element. */}
        <div>
          <h3
            className="text-[20px] font-black italic leading-[25px] text-[#fbfbfb]"
            style={{ fontFamily: 'Red Hat Display, sans-serif' }}
          >
            {contest.name}
          </h3>
          <p
            className="mt-0.5 text-[12px] font-medium leading-[17px] text-[rgba(251,251,251,0.5)]"
            style={{ fontFamily: 'Red Hat Display, sans-serif' }}
          >
            {contest.tagline}
          </p>
        </div>

        {/* Meta row — participants + selection range: secondary, scannable,
            one line, text-only (no icon fits either without misleading). */}
        <div
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium leading-[17px] text-[rgba(251,251,251,0.5)]"
          style={{ fontFamily: 'Red Hat Display, sans-serif' }}
        >
          <span className="whitespace-nowrap">
            {formatCount(getDisplayParticipants(contest, participating))} jugando
          </span>
          <span aria-hidden className="text-[rgba(251,251,251,0.28)]">·</span>
          <span className="whitespace-nowrap">{selectionLabel}</span>
        </div>

        {/* Action panel — entrada / gana hasta + Jugar. The card's second
            most prominent element, set apart as its own raised surface. */}
        <div className="mt-0.5 rounded-[20px] border border-[rgba(251,251,251,0.08)] bg-[rgba(251,251,251,0.045)] p-3">
          <div className="mb-3 flex items-stretch">
            <div className="flex flex-1 flex-col">
              <span
                className="text-[18px] font-black leading-[23px] text-[#fbfbfb]"
                style={{ fontFamily: 'Red Hat Display, sans-serif' }}
              >
                {formatUsd(contest.entryCost)}
              </span>
              <span
                className="mt-0.5 text-[10px] font-bold uppercase leading-[13px] tracking-wide text-[rgba(251,251,251,0.44)]"
                style={{ fontFamily: 'Red Hat Display, sans-serif' }}
              >
                Entrada
              </span>
            </div>
            <div aria-hidden className="mx-3 w-px self-stretch bg-[rgba(251,251,251,0.12)]" />
            <div className="flex flex-1 flex-col items-end text-right">
              <span
                className="text-[20px] font-black leading-[25px] text-[#fbfbfb]"
                style={{ fontFamily: 'Red Hat Display, sans-serif' }}
              >
                {formatUsd(contest.potentialWinnings)}
              </span>
              <span
                className="mt-0.5 text-[10px] font-bold uppercase leading-[13px] tracking-wide"
                style={{ fontFamily: 'Red Hat Display, sans-serif', color: accent.tint }}
              >
                Gana hasta
              </span>
            </div>
          </div>

          {/* Action row — a joined contest gets a "Ver clasificación"
              action alongside Jugar (still creates another entry); a
              fresh contest just shows the single Jugar CTA. */}
          <div className={participating ? 'flex gap-2' : ''}>
            {participating && (
              <button
                type="button"
                onClick={() => onViewLeaderboard(contest.id)}
                className="flex h-11 flex-1 cursor-pointer items-center justify-center rounded-[56px] border border-[rgba(251,251,251,0.16)] bg-[rgba(251,251,251,0.06)] active:scale-[0.97] transition-transform"
              >
                <span
                  className="text-[13px] font-bold leading-[19px] text-[#fbfbfb]"
                  style={{ fontFamily: 'Red Hat Display, sans-serif' }}
                >
                  Ver clasificación
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onPlay(contest.id)}
              className={`relative flex h-11 cursor-pointer items-center justify-center rounded-[56px] active:scale-[0.97] transition-transform ${
                participating ? 'flex-1' : 'w-full'
              }`}
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
                Jugar
              </span>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[inherit]"
                style={{ boxShadow: 'inset 0 0 12px rgba(0,0,0,0.18)' }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  ContestsFeed — the main screen. Reuses the app's sticky      */
/*  topbar (Header, glow) so the shell matches the player-        */
/*  selection screen; below it, a hero title + the contest list. */
/* ============================================================ */
export function ContestsFeed({
  contests,
  onPlay,
  onViewLeaderboard,
  participatingIds,
  entryCounts,
}: {
  contests: Contest[];
  onPlay: (id: string) => void;
  onViewLeaderboard: (id: string) => void;
  /** Ids of contests the player has already entered — derived from
      App.tsx's persisted contest entries (see contestEntries.ts). */
  participatingIds: Set<string>;
  /** contestId → number of entries the player has created there. */
  entryCounts: Map<string, number>;
}) {
  return (
    <div className="flex w-full flex-col">
      {/* TOPBAR — same sticky/glow treatment as HomeScreenChrome's. */}
      <div className="sticky top-0 z-30 bg-black [@media(min-width:431px)_and_(pointer:fine)]:pt-11">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[100px]"
          style={{
            backgroundImage: 'linear-gradient(45.09deg, #4b20ff 0%, #9730ff 100%)',
            filter: 'blur(50px)',
            opacity: 0.48,
          }}
        />
        <Header />
      </div>

      {/* Hero */}
      <div className="px-3 pb-2 pt-4">
        <h1
          className="text-[22px] font-black italic leading-[28px] text-[#fbfbfb]"
          style={{ fontFamily: 'Red Hat Display, sans-serif' }}
        >
          Elige tu contest
        </h1>
        <p
          className="mt-1 text-[13px] font-medium leading-[19px] text-[rgba(251,251,251,0.5)]"
          style={{ fontFamily: 'Red Hat Display, sans-serif' }}
        >
          Selecciona jugadas, paga una entrada fija y multiplica tu premio.
        </p>
      </div>

      {/* Contest list */}
      <div className="flex flex-col gap-4 px-3 pb-3">
        {contests.map((c) => (
          <ContestCard
            key={c.id}
            contest={c}
            onPlay={onPlay}
            onViewLeaderboard={onViewLeaderboard}
            participating={participatingIds.has(c.id)}
            entryCount={entryCounts.get(c.id) ?? 0}
          />
        ))}
      </div>
    </div>
  );
}
