import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  Header,
  LeaguesTab,
  MOCK_PICKS,
  MatchTabsRow,
  PlayerPropCard,
  groupPlayerPicks,
  marketShortLabel,
  splitKickoff,
  type LeagueTabOption,
  type MatchTabOption,
} from './HomeScreen';
import popularIcon from './assets/popular.svg';
import {
  CONTEST_ACCENTS,
  canConfirmContestEntry,
  getDisplayParticipants,
  type Contest,
} from './contests';
import {
  LEAGUES,
  baseSelectedIds,
  contestMatchesFeedFilters,
  matchesForLeague,
  picksForContest,
} from './contestScope';
import type { Selection } from './types';

/** Same glyph this app's (decorative) full-screen leagues row already uses
    for these two league names, so the feed's REAL "Champions"/"Premier"
    tabs read as the same visual family, not an invented icon set. */
const LEAGUE_GLYPHS: Record<string, string> = {
  Champions: '🏆',
  Premier: '🦁',
};

/* ============================================================ */
/*  Horizontal drag-to-scroll — makes a horizontal strip pannable */
/*  via mouse AND touch alike, deciding the gesture's axis from     */
/*  the first few pixels of movement rather than trusting the         */
/*  browser's own touch-action panning recognition in isolation:        */
/*  once a drag commits to the horizontal axis it captures the pointer   */
/*  and drives `scrollLeft` directly; a drag that commits to the vertical  */
/*  axis is released immediately (never `preventDefault`ed) so the page's   */
/*  own scroll still receives it untouched. A plain tap (movement under the */
/*  lock threshold) never engages either branch, so a player control's own   */
/*  onClick still fires normally. Used by the player carousel below and by    */
/*  its market-pill row. */
const AXIS_LOCK_THRESHOLD_PX = 6;

function useHorizontalDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    axis: 'x' | 'y' | null;
    pointerId: number | null;
  } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<T>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: el.scrollLeft,
      axis: null,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<T>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.axis === null) {
      if (Math.abs(dx) < AXIS_LOCK_THRESHOLD_PX && Math.abs(dy) < AXIS_LOCK_THRESHOLD_PX) {
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) {
        d.axis = 'x';
        el.setPointerCapture(d.pointerId!);
      } else {
        // Vertical intent — release the gesture entirely so the page's own
        // scroll (never touched by us) handles it uncontested.
        drag.current = null;
        return;
      }
    }
    if (d.axis !== 'x') return;
    e.preventDefault();
    el.scrollLeft = d.startScrollLeft - dx;
  };

  const endDrag = () => {
    drag.current = null;
  };

  return {
    ref,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}

/** Format a USD amount with thousands separators, no decimals — every
    amount here is prototype/mock data, not a real balance. */
function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** Real league list (`contestScope.ts`'s `LEAGUES`, derived from
    `HomeScreen.tsx`'s `MATCHES`) adapted into `LeaguesTab`'s option shape,
    with a leading "TODOS" (`'all'`) entry — reuses the SAME component the
    full player-selection screen renders (`HomeScreen.tsx`'s `LeaguesTab`),
    just driven by real data instead of that screen's decorative default. */
function useFeedLeagueOptions(): LeagueTabOption[] {
  return useMemo(
    () => [
      { id: 'all', label: 'TODOS', glyph: '⚽' },
      ...LEAGUES.map((league) => ({
        id: league,
        label: league.toUpperCase(),
        glyph: LEAGUE_GLYPHS[league] ?? '⚽',
      })),
    ],
    [],
  );
}

/** `contestScope.ts`'s `matchesForLeague` adapted into `MatchTabsRow`'s
    option shape (splits "Hoy 18:00" into date/time via the same
    `splitKickoff` the full screen's market accordion cards use). */
function useFeedMatchOptions(league: string): MatchTabOption[] {
  return useMemo(() => {
    if (league === 'all') return [];
    return matchesForLeague(league).map((m) => {
      const { date, time } = splitKickoff(m.matchTime);
      return { id: m.matchId, home: m.homeAbbrev, away: m.awayAbbrev, date, time };
    });
  }, [league]);
}

/* ============================================================ */
/*  Inline player carousel — the players available inside a       */
/*  contest's own league/match scope, as a horizontally-scrollable  */
/*  strip of the SAME `PlayerPropCard` the full player-selection      */
/*  screen's market accordion uses (compact size, ruleset line          */
/*  shown since there's no accordion title here to supply that            */
/*  context) — never a second visual system. Shares the exact same         */
/*  draft (`draft`/`onTogglePick`, both prop-drilled from App.tsx) as        */
/*  the full screen, so picking/removing a player here is instantly           */
/*  reflected there and vice-versa. Cards are plain DOM children of a           */
/*  single `overflow-x-auto` row — nothing is virtualized or                     */
/*  conditionally unmounted on scroll, so a selected state a card                 */
/*  already shows stays intact as it scrolls out of and back into view.            */
/* ============================================================ */
function ContestPlayerCarousel({
  contest,
  draft,
  onTogglePick,
}: {
  contest: Contest;
  draft: Selection[];
  onTogglePick: (pickId: string) => void;
}) {
  const scopedPicks = useMemo(
    () => picksForContest(contest, MOCK_PICKS),
    [contest],
  );
  const markets = useMemo(
    () => Array.from(new Set(scopedPicks.map((p) => p.market))),
    [scopedPicks],
  );
  const [activeMarket, setActiveMarket] = useState(markets[0] ?? '');
  useEffect(() => {
    if (!markets.includes(activeMarket)) setActiveMarket(markets[0] ?? '');
  }, [markets, activeMarket]);

  const selected = useMemo(() => baseSelectedIds(draft), [draft]);
  const market = activeMarket || markets[0] || '';
  const groups = groupPlayerPicks(scopedPicks, market);

  const pillDrag = useHorizontalDragScroll<HTMLDivElement>();
  const carouselDrag = useHorizontalDragScroll<HTMLDivElement>();

  if (scopedPicks.length === 0 || groups.length === 0) return null;

  return (
    <div className="mt-1">
      {/* Market pills — only shown when the contest's scope spans more
          than one market (a single-match contest usually only needs one). */}
      {markets.length > 1 && (
        <div
          ref={pillDrag.ref}
          className="no-scrollbar mb-1.5 flex gap-1.5 overflow-x-auto"
          style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain', overscrollBehaviorY: 'auto' }}
          onPointerDown={pillDrag.onPointerDown}
          onPointerMove={pillDrag.onPointerMove}
          onPointerUp={pillDrag.onPointerUp}
          onPointerCancel={pillDrag.onPointerCancel}
        >
          {markets.map((m) => {
            const isActive = m === activeMarket;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setActiveMarket(m)}
                className={`flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-[56px] border px-2.5 text-[11px] font-bold leading-[16px] transition-transform active:scale-[0.96] ${
                  isActive
                    ? 'border-[#4b20ff] text-[#fbfbfb]'
                    : 'border-[rgba(251,251,251,0.16)] bg-[rgba(251,251,251,0.08)] text-[rgba(251,251,251,0.6)]'
                }`}
                style={{
                  fontFamily: 'Red Hat Display, sans-serif',
                  backgroundImage: isActive
                    ? 'linear-gradient(46.31deg, rgba(75,32,255,0.24) 0%, rgba(151,48,255,0.24) 100%)'
                    : undefined,
                }}
              >
                {marketShortLabel(m)}
              </button>
            );
          })}
        </div>
      )}

      {/* The carousel itself — a single native `overflow-x-auto` row, PLUS
          the `useHorizontalDragScroll` pointer handlers above (`carouselDrag`)
          so a horizontal drag scrolls it deterministically regardless of
          input device, instead of relying solely on the browser's own touch-
          action panning recognition. `touch-action: pan-x` is kept as the
          native-path hint (and is what lets a vertical/diagonal touch drag
          fall through to the page uncontested); the JS handlers decide the
          SAME way — once a drag's first few pixels commit to the horizontal
          axis it captures the pointer and drives `scrollLeft` directly, a
          vertical-axis commit releases the gesture immediately without ever
          calling `preventDefault`, so the feed's own scroll still receives
          it. No outer element wraps the whole card in a second, redundant
          horizontal scroller — this is the only horizontally-scrollable
          region on the card. `overscrollBehaviorY: 'auto'` OVERRIDES (on
          just the Y axis) the shared `.no-scrollbar` class's
          `overscroll-behavior: contain` — that shorthand exists so this
          app's other horizontal strips don't re-trigger pull-to-refresh, but
          it also has the side effect of swallowing a vertical scroll/wheel
          input that starts over this element instead of letting it chain to
          the page (this element has no vertical overflow of its own to
          consume, so "contain" traps it rather than bubbling it up) — a real
          bug caught during in-browser verification, not a hypothetical.
          `overscrollBehaviorX` stays `contain` so the carousel itself still
          doesn't rubber-band/chain past its own horizontal ends. */}
      <div
        ref={carouselDrag.ref}
        className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5"
        style={{
          touchAction: 'pan-x',
          overscrollBehaviorX: 'contain',
          overscrollBehaviorY: 'auto',
        }}
        onPointerDown={carouselDrag.onPointerDown}
        onPointerMove={carouselDrag.onPointerMove}
        onPointerUp={carouselDrag.onPointerUp}
        onPointerCancel={carouselDrag.onPointerCancel}
      >
        {groups.map((g) => (
          <PlayerPropCard
            key={g.groupId}
            group={g}
            market={market}
            selectedIds={selected}
            onSelect={onTogglePick}
            size="compact"
            showRuleset
            className="w-[130px] shrink-0"
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================ */
/*  One contest card — name, participants, selection range,     */
/*  fixed entry cost, potential winnings, inline player-picking, */
/*  and the participation CTA. Visual identity (gradient + glow) */
/*  comes from `contest.accent` (see contests.ts — every gradient  */
/*  here already exists elsewhere in the app).                      */
/* ============================================================ */
function ContestCard({
  contest,
  onOpen,
  onEnter,
  onViewLeaderboard,
  participating,
  entryCount,
  draft,
  onTogglePick,
}: {
  contest: Contest;
  /** Opens the full player-selection screen for this contest. */
  onOpen: (id: string) => void;
  /** Submits the entry directly ("Jugar por $X") once the draft is valid —
      same submit guard / success animation / joined state as the full
      screen's own CTA (see App.tsx's `enterContest`). */
  onEnter: (id: string) => void;
  onViewLeaderboard: (id: string) => void;
  /** True once the player has entered this contest at least once (derived
      from App.tsx's persisted contest entries — see contestEntries.ts).
      Purely informational — re-entering the same contest is still
      allowed. */
  participating: boolean;
  /** How many entries the player has created in this contest. */
  entryCount: number;
  /** This contest's own selection draft — shared with the full
      player-selection screen (see App.tsx's `draftsByContest`). */
  draft: Selection[];
  onTogglePick: (pickId: string) => void;
}) {
  const accent = CONTEST_ACCENTS[contest.accent];
  // Plain-Spanish, unambiguous — matches this app's own wording for a pick
  // ("Haz 1 selección" / "Haz min. 2 selec." on the bet slip pill).
  const selectionLabel =
    contest.minSelections === contest.maxSelections
      ? `Elige ${contest.minSelections} selecci${contest.minSelections === 1 ? 'ón' : 'ones'}`
      : `Elige de ${contest.minSelections} a ${contest.maxSelections} selecciones`;
  const canPlayDirectly = canConfirmContestEntry(contest, draft.length);

  return (
    <div
      className="relative w-full overflow-hidden rounded-[24px] border bg-black p-3.5"
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

      <div className="relative z-10 flex flex-col gap-1.5">
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

        {/* Name + tagline — the card's most prominent element. Tapping it
            still opens the full player-selection screen (see `onOpen`). */}
        <button
          type="button"
          onClick={() => onOpen(contest.id)}
          className="cursor-pointer text-left"
        >
          <h3
            className="text-[18px] font-black italic leading-[22px] text-[#fbfbfb]"
            style={{ fontFamily: 'Red Hat Display, sans-serif' }}
          >
            {contest.name}
          </h3>
          <p
            className="mt-0.5 truncate text-[12px] font-medium leading-[16px] text-[rgba(251,251,251,0.5)]"
            style={{ fontFamily: 'Red Hat Display, sans-serif' }}
          >
            {contest.tagline}
          </p>
        </button>

        {/* Meta row — participants + selection range/progress: secondary,
            scannable, one line, text-only (no icon fits either without
            misleading). */}
        <div
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium leading-[16px] text-[rgba(251,251,251,0.5)]"
          style={{ fontFamily: 'Red Hat Display, sans-serif' }}
        >
          <span className="whitespace-nowrap">
            {formatCount(getDisplayParticipants(contest, participating))} jugando
          </span>
          <span aria-hidden className="text-[rgba(251,251,251,0.28)]">·</span>
          <span className="whitespace-nowrap">
            {draft.length > 0
              ? `${draft.length}/${contest.maxSelections} elegidas`
              : selectionLabel}
          </span>
        </div>

        {/* Inline player carousel — same scoped players + shared draft as
            the full screen (see ContestPlayerCarousel above). Horizontal
            swipes here move only this strip; they never bubble up into a
            card-level or feed-level horizontal scroller (there isn't one). */}
        <ContestPlayerCarousel contest={contest} draft={draft} onTogglePick={onTogglePick} />
        <button
          type="button"
          onClick={() => onOpen(contest.id)}
          className="-mt-0.5 w-fit cursor-pointer text-left text-[12px] font-bold leading-[17px] text-[rgba(251,251,251,0.6)] transition-opacity hover:opacity-80"
          style={{ fontFamily: 'Red Hat Display, sans-serif' }}
        >
          Ver más jugadores →
        </button>

        {/* Action panel — entrada / gana hasta + Jugar. The card's second
            most prominent element, set apart as its own raised surface. */}
        <div className="mt-0.5 rounded-[20px] border border-[rgba(251,251,251,0.08)] bg-[rgba(251,251,251,0.045)] p-2.5">
          <div className="mb-2.5 flex items-stretch">
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
              action alongside the play CTA (still creates another entry);
              the play CTA itself is "Jugar por: $X" (submits directly)
              once the draft is valid, or "Jugar" (opens the full screen)
              otherwise. */}
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
              onClick={() =>
                canPlayDirectly ? onEnter(contest.id) : onOpen(contest.id)
              }
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
                {canPlayDirectly ? `Jugar por: ${formatUsd(contest.entryCost)}` : 'Jugar'}
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
/*  selection screen; below it, league/match tabs filter the       */
/*  contest list, each card supporting inline player picking.        */
/* ============================================================ */
export function ContestsFeed({
  contests,
  onOpen,
  onEnter,
  onViewLeaderboard,
  participatingIds,
  entryCounts,
  draftsByContest,
  onTogglePick,
}: {
  contests: Contest[];
  /** Opens the full player-selection screen for a contest. */
  onOpen: (id: string) => void;
  /** Submits a contest entry directly from the feed once its draft is
      valid (see App.tsx's `enterContest`). */
  onEnter: (id: string) => void;
  onViewLeaderboard: (id: string) => void;
  /** Ids of contests the player has already entered — derived from
      App.tsx's persisted contest entries (see contestEntries.ts). */
  participatingIds: Set<string>;
  /** contestId → number of entries the player has created there. */
  entryCounts: Map<string, number>;
  /** contestId → its own in-progress selection draft (see App.tsx). */
  draftsByContest: Record<string, Selection[]>;
  onTogglePick: (contestId: string, pickId: string) => void;
}) {
  const [activeLeague, setActiveLeague] = useState('all');
  const [activeMatch, setActiveMatch] = useState('all');
  const leagueOptions = useFeedLeagueOptions();
  const matchOptions = useFeedMatchOptions(activeLeague);

  const filtered = contests.filter((c) =>
    contestMatchesFeedFilters(c, activeLeague, activeMatch),
  );

  // Two-tier sticky header, same pattern as HomeScreenChrome's: the topbar
  // (Header + glow) pins at the very top; the league/match tabs pin in a
  // SEPARATE sticky layer measured to sit right below it (`topbarH`) —
  // without this, the tabs (being in normal flow) would scroll partway
  // under the topbar as the feed scrolls (its top few pixels clipped by the
  // topbar's opaque background) and then scroll fully out of view, unlike
  // their pinned counterpart on the full player-selection screen. Pinning
  // them here is what keeps them "visible and usable... not clipped or
  // covered by the header" at any scroll position.
  const topbarRef = useRef<HTMLDivElement>(null);
  const [topbarH, setTopbarH] = useState(88);
  useEffect(() => {
    const measure = () => {
      if (topbarRef.current) setTopbarH(topbarRef.current.offsetHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div className="flex w-full flex-col">
      {/* TOPBAR — same sticky/glow treatment as HomeScreenChrome's. */}
      <div
        ref={topbarRef}
        className="sticky top-0 z-30 bg-black [@media(min-width:431px)_and_(pointer:fine)]:pt-11"
      >
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

      {/* League + match tabs — the SAME `LeaguesTab`/`MatchTabsRow`
          components the full player-selection screen renders (see
          HomeScreen.tsx), driven here by real league/match data instead of
          that screen's decorative default, and made a controlled filter via
          `active`/`onChange`. Pinned in their own sticky layer (see
          `topbarH` above) right below the topbar; match options always
          reflect the selected league, and clearing the league resets any
          match selection back to "TODOS". */}
      <div className="sticky z-20 bg-black" style={{ top: topbarH }}>
        <LeaguesTab
          options={leagueOptions}
          active={activeLeague}
          onChange={(l) => {
            setActiveLeague(l);
            setActiveMatch('all');
          }}
        />
        {activeLeague !== 'all' && (
          <MatchTabsRow
            matches={matchOptions}
            todosId="all"
            active={activeMatch}
            onChange={setActiveMatch}
          />
        )}
      </div>

      {/* Contest list */}
      <div className="flex flex-col gap-4 px-3 pb-3">
        {filtered.map((c) => (
          <ContestCard
            key={c.id}
            contest={c}
            onOpen={onOpen}
            onEnter={onEnter}
            onViewLeaderboard={onViewLeaderboard}
            participating={participatingIds.has(c.id)}
            entryCount={entryCounts.get(c.id) ?? 0}
            draft={draftsByContest[c.id] ?? []}
            onTogglePick={(pickId) => onTogglePick(c.id, pickId)}
          />
        ))}
        {filtered.length === 0 && (
          <p
            className="px-1 py-6 text-center text-[13px] font-medium text-[rgba(251,251,251,0.5)]"
            style={{ fontFamily: 'Red Hat Display, sans-serif' }}
          >
            No hay contests para esta liga/partido.
          </p>
        )}
      </div>
    </div>
  );
}
