import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tierForOdds, type ButtonLiveState } from './ButtonPreviewMomios';
import { buttonProgressionConfig } from './buttonProgressionConfig';
import { playSelectionHaptic, playTierCrossingHaptic } from './haptics';
import { HomeScreenChrome, MOCK_PICKS, Navbar } from './HomeScreen';
import { ContestsFeed } from './ContestsFeed';
import { ContestLeaderboard } from './ContestLeaderboard';
import { ContestEntrySheet } from './ContestEntrySheet';
import { CONTESTS, canConfirmContestEntry } from './contests';
import {
  contestScopeLabel,
  isContestScoped,
  picksForContest,
} from './contestScope';
import {
  entriesForContest,
  loadContestEntries,
  saveContestEntry,
  type ContestEntry,
} from './contestEntries';
import { ContestPlayButton } from './ContestPlayButton';
import { EntryCreatedOverlay } from './EntryCreatedOverlay';
import { OnboardingSheet } from './OnboardingSheet';
import {
  OneClickBetPill,
  type OneClickBetPillState,
} from './OneClickBetPill';
import { useOneClickBetSession } from './oneClickBetSession';
import { useOneClickBetOnboarding } from './oneClickBetOnboarding';
import type { Selection, Tier } from './types';

// One Click Bet: how long the pressed pick shows its selected/filled state
// before the pill dismisses. Feeds the OneClickBetSession's acceptToSubmitMs
// (see useOneClickBetSession() below) — same clock, not a duplicated number.
const OCB_SELECTED_HOLD_MS = 320;

/* ============================================================ */
/*  Debug overlay helpers                                        */
/* ============================================================ */
function PhaseBar({ label, value }: { label: string; value: number }) {
  // Render a 0..1 motion phase as a thin progress strip.
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="w-[36px] text-[9px] uppercase tracking-wider text-amber-300/80">
        {label}
      </span>
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-amber-300/80"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ============================================================ */
/*  Debug flags from URL                                         */
/* ============================================================ */
function useDebug() {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === 'true';
  }, []);
}

/* ============================================================ */
/*  Cumulative odds = multiplicative product of selections      */
/* ============================================================ */
function computeCumulativeOdds(selections: Selection[]): number {
  if (selections.length === 0) return 0;
  return selections.reduce((acc, s) => acc * s.odds, 1);
}

/* ============================================================ */
/*  Pre-built selection sets that land cleanly inside each tier  */
/*  Used by the debug jump-to-tier buttons.                      */
/* ============================================================ */
function selectionsForTier(target: Tier): Selection[] {
  // Hand-picked combos so each tier renders with a representative
  // odds value squarely inside its range (no overshoot into the next).
  const byId = (id: string) => MOCK_PICKS.find((p) => p.id === id)!;
  const stamp = (picks: Selection[]) =>
    picks.map((p, i) => ({ ...p, id: `${p.id}-${i}` }));

  switch (target) {
    case 0:
      return [];
    case 1:
      // 2.6x — sits in [2.00, 5.00)
      return stamp([byId('ars-rma-goals-saka-0.5-mas')]);
    case 2:
      // 2.6 * 3.1 = 8.06x — sits in [5.00, 15.00)
      return stamp([
        byId('ars-rma-goals-saka-0.5-mas'),
        byId('ars-rma-goals-odegaard-0.5-mas'),
      ]);
    case 3:
      // 2.6 * 3.1 * 1.65 * 1.8 ≈ 23.94x — comfortably inside [15.00, 50.00)
      return stamp([
        byId('ars-rma-goals-saka-0.5-mas'),
        byId('ars-rma-goals-odegaard-0.5-mas'),
        byId('psg-rma-goals-mbappe-0.5-mas'),
        byId('psg-rma-shots-vini-1.5-mas'),
      ]);
    case 4:
      // ≈ 23.94 * 1.95 * 1.6 ≈ 74.7x — comfortably > 50.00
      return stamp([
        byId('ars-rma-goals-saka-0.5-mas'),
        byId('ars-rma-goals-odegaard-0.5-mas'),
        byId('psg-rma-goals-mbappe-0.5-mas'),
        byId('psg-rma-shots-vini-1.5-mas'),
        byId('psg-rma-goals-lewa-0.5-mas'),
        byId('liv-mci-shots-haaland-1.5-mas'),
      ]);
  }
}

export function App() {
  const debug = useDebug();
  // MASTER SWITCH — see cfg.animationsEnabled. OR-ing it here suppresses the
  // T4 Siri vignette rotation (and, via the opacity gate below, the vignette
  // itself) alongside the OS-level reduced-motion preference.
  const reducedMotion =
    useReducedMotion() || !buttonProgressionConfig.animationsEnabled;
  // OS-level preference ONLY (no master-switch OR) — the OCB floating
  // pill's squash-and-stretch enter/exit, like BetSlipSheet's own
  // appear/collapse pulses, isn't gated by `cfg.animationsEnabled`: it's
  // core entry/exit feedback, not an ambient tier effect, so it keeps
  // playing even with the master switch off (matching BetSlipSheet/
  // BetSlipShell, which reference no reduced-motion flag at all for their
  // entry/exit motion). Only real prefers-reduced-motion simplifies it.
  const osReducedMotion = useReducedMotion();
  // ONE DRAFT PER CONTEST — keyed by contest id, shared between that
  // contest's feed card (inline player chips) and the full player-
  // selection screen: both read/write the SAME entry in this map, so a
  // pick made in either place is reflected in the other immediately, and
  // navigating back and forth to a contest preserves its draft (nothing
  // clears an entry except a successful entry or an explicit reset/remove).
  // A contest's own picks never leak into another contest's draft, since
  // each lives under its own key.
  const [draftsByContest, setDraftsByContest] = useState<
    Record<string, Selection[]>
  >({});
  const updateDraft = useCallback(
    (contestId: string, updater: (current: Selection[]) => Selection[]) => {
      setDraftsByContest((all) => ({
        ...all,
        [contestId]: updater(all[contestId] ?? []),
      }));
    },
    [],
  );
  // CONTESTS FEED — the app's main screen. Opening a contest card sets
  // `activeContestId` and switches to the existing player-selection screen
  // (unchanged below); the header's back button (see HomeScreen's Header)
  // returns to the feed. The draft is NOT cleared on open — it's preserved
  // per contest (see `draftsByContest` above).
  const [screen, setScreen] = useState<'feed' | 'contest' | 'leaderboard'>(
    'feed',
  );
  const [activeContestId, setActiveContestId] = useState<string | null>(null);
  const activeContest = useMemo(
    () => CONTESTS.find((c) => c.id === activeContestId) ?? null,
    [activeContestId],
  );
  // The active contest's own draft — the single source of truth read by
  // every selection-derived value below (cumulative odds, tier, the bet
  // slip's selected ids, etc.), exactly as the old flat `selections` state
  // used to be, just keyed by contest now.
  const selections = activeContestId ? draftsByContest[activeContestId] ?? [] : [];
  const openContest = useCallback((id: string) => {
    setActiveContestId(id);
    setScreen('contest');
  }, []);
  const openLeaderboard = useCallback((id: string) => {
    setActiveContestId(id);
    setSelectedEntryId(null);
    setScreen('leaderboard');
  }, []);
  const backToFeed = useCallback(() => {
    setSelectedEntryId(null);
    setScreen('feed');
  }, []);
  // Which of the player's own entries is open in the read-only detail
  // sheet (see ContestEntrySheet) — null when none is. Cleared whenever
  // the player navigates away from the leaderboard so a stale sheet can
  // never reappear over a different screen.
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  // Mirrors `activeContest` into a ref so the stable-identity callbacks below
  // (togglePick, jumpToTier — kept with empty/minimal deps so they aren't
  // recreated on every render) can read the CURRENT contest without being
  // recreated every time it changes.
  const activeContestRef = useRef(activeContest);
  useEffect(() => {
    activeContestRef.current = activeContest;
  }, [activeContest]);
  // Brief, in-context explanation shown when a selection is blocked because
  // the active contest's maximum has been reached (tap, long-press, AND the
  // debug "+ Añadir selección" control all route through togglePick, so none
  // of them can bypass this). Auto-clears after a few seconds.
  const [contestLimitNotice, setContestLimitNotice] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (!contestLimitNotice) return;
    const t = setTimeout(() => setContestLimitNotice(null), 2600);
    return () => clearTimeout(t);
  }, [contestLimitNotice]);
  // QUICK BET ONBOARDING — no longer auto-opens on load; only reachable via
  // the debug-overlay "Show onboarding sheet" button (or a future explicit
  // user-triggered entry point).
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  // Separated intro/setup onboarding state (see oneClickBetOnboarding.ts).
  // The Quick Bet default-stake setting it also owns is no longer surfaced
  // in the onboarding sheet — a long-press never creates an entry on its
  // own (see the OneClickBetSession doc comment), so there's no per-hold
  // stake left to configure; only the odds-change acknowledgment remains.
  const {
    readiness: ocbOnboardingReadiness,
    markIntroSeen: markOcbIntroSeen,
    markSetupComplete: markOcbSetupComplete,
    saveConfiguration: saveOcbConfiguration,
  } = useOneClickBetOnboarding();
  const [speedScale, setSpeedScale] = useState(1);
  const [live, setLive] = useState<ButtonLiveState | null>(null);
  // PASS 3 — Tier 3 odds effect selector (default flames; toggled in debug).
  const [tier3OddsEffect, setTier3OddsEffect] = useState<
    'flames' | 'smoke'
  >(buttonProgressionConfig.tier3OddsEffect);
  // PASS 3 — "Bouncy entry only on FIRST mount per session". Once the bet
  // slip has mounted (and started its bounce) once, this flips to true and
  // subsequent 0 → 1 transitions skip the bounce.
  const hasBouncedOnceRef = useRef(false);

  // CONTEST ENTRY — tapping the `ContestPlayButton` creates the entry
  // directly (no review step, no swipe gesture — see the "Contest draft/
  // review flow" landmark). `success` drives the shared "Entrada creada"
  // animation sequence exactly as before.
  const [success, setSuccess] = useState(false);
  // Contest entries — persisted to localStorage (see contestEntries.ts) so
  // the joined state and entry history survive a page reload. Every entry
  // is created `status: 'pending'` and stays that way: this prototype has
  // no scoring engine, so a live score/rank is never invented for one.
  const [contestEntries, setContestEntries] = useState<ContestEntry[]>(() =>
    loadContestEntries(),
  );
  // Ids of contests the player has entered at least once — derived, not
  // duplicated state, so it can never drift from `contestEntries`.
  // Entering again is still allowed (nothing in the product spec blocks a
  // repeat entry), and this Set counts the player once regardless of how
  // many entries they've made.
  const participatingContestIds = useMemo(
    () => new Set(contestEntries.map((e) => e.contestId)),
    [contestEntries],
  );
  const entryCountsByContest = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of contestEntries) {
      counts.set(e.contestId, (counts.get(e.contestId) ?? 0) + 1);
    }
    return counts;
  }, [contestEntries]);
  // The active contest's own entries, in the same order the leaderboard
  // lists them — both the leaderboard and the detail sheet index off this
  // same array so "Entrada #N" always matches between the two.
  const activeContestEntries = useMemo(
    () =>
      activeContestId
        ? entriesForContest(contestEntries, activeContestId)
        : [],
    [contestEntries, activeContestId],
  );
  const selectedEntryIndex = useMemo(
    () => activeContestEntries.findIndex((e) => e.id === selectedEntryId),
    [activeContestEntries, selectedEntryId],
  );
  const selectedEntry =
    selectedEntryIndex >= 0 ? activeContestEntries[selectedEntryIndex] : null;
  // ONE CLICK BET — floating progress pill (see OneClickBetPill.tsx). The
  // REAL hold-driven values come from the OneClickBetSession (ocbSession,
  // defined below); `debugOcbState`/`debugOcbProgress` only drive the pill
  // when no real Quick Bet hold is active (`?debug=true` dev controls,
  // preview-only). 'hidden' means the region shows the normal contest play
  // button as usual.
  const [debugOcbState, setDebugOcbState] =
    useState<OneClickBetPillState>('hidden');
  const [debugOcbProgress, setDebugOcbProgress] = useState(0);

  // Dismissal (× button, backdrop tap, swipe-down, or the primary CTA) —
  // persists "seen" for the rest of this browser session so it doesn't
  // reappear on a same-tab reload or route change, then unmounts the sheet
  // (AnimatePresence plays the close animation first). Still the ONE thing
  // every dismissal path does, exactly as before — only "setup complete" is
  // new, and it's a separate call fired from `onSetupComplete` below, only
  // on the "Jugar ahora" (valid amount + accepted odds) path.
  const closeOnboarding = useCallback(() => {
    markOcbIntroSeen();
    setOnboardingOpen(false);
  }, [markOcbIntroSeen]);

  // Fired ONLY when OnboardingSheet's "Jugar ahora" succeeds (valid amount +
  // odds-change accepted) — persists the odds-change preference and marks
  // setup complete, independent of `closeOnboarding`'s intro-seen flag.
  // Purely additive: does not change what the sheet shows or when it closes.
  const handleOcbSetupComplete = useCallback(
    (acceptOddsChange: boolean) => {
      saveOcbConfiguration({ acceptOddsChange });
      markOcbSetupComplete();
    },
    [saveOcbConfiguration, markOcbSetupComplete],
  );

  const [entryCount, setEntryCount] = useState(0);
  const [entryBump, setEntryBump] = useState(0); // Mis entradas icon "catch" bump
  // Navbar compresses to an icon-only row while scrolling DOWN through the
  // offer, and springs back to full size on any scroll UP (or near the top).
  // The same signal collapses the leagues row (in HomeScreenChrome).
  // `lastScrollTopRef` holds the previous scrollTop so we can read direction.
  // `navLockRef` holds a timestamp until which direction flips are ignored:
  // collapsing the leagues row shrinks the scroll content, which fires reflow
  // scroll events in the OPPOSITE direction — without the lock those flip the
  // state straight back and the bars twitch. The lock spans the 250ms morph.
  const [navCompact, setNavCompact] = useState(false);
  const lastScrollTopRef = useRef(0);
  const navLockRef = useRef(0);
  // Entry-count badge over "Mis entradas": appears on each new entry, holds
  // 5s, then hides. Re-shown (timer reset) every time the count changes.
  const [badgeVisible, setBadgeVisible] = useState(false);
  useEffect(() => {
    if (entryCount === 0) return;
    setBadgeVisible(true);
    const t = setTimeout(() => setBadgeVisible(false), 5000);
    return () => clearTimeout(t);
  }, [entryCount]);

  const selectedIds = useMemo(
    () => new Set(selections.map((s) => s.id)),
    [selections],
  );
  const cumulativeOdds = useMemo(
    () => computeCumulativeOdds(selections),
    [selections],
  );
  const tier: Tier = tierForOdds(cumulativeOdds);

  /* ---------- handlers ---------- */
  // REGRESSION FIX — removed `queueMicrotask` ref-flipping from setSelections
  // updaters. The microtask was firing BEFORE React re-rendered with the new
  // state, so BetSlipShell mounted with bouncy=false on its very first mount.
  // The ref is now flipped via BetSlipShell's onMounted callback (below).
  const addRandom = useCallback(() => {
    const contest = activeContestRef.current;
    if (!contest) return;
    const max = contest.maxSelections;
    if (selections.length >= max) return;
    // Only pool from picks inside the active contest's own league/match
    // scope (see contestScope.ts) — a debug add must respect the same
    // scope the real chips/cards are limited to.
    const scopedPicks = picksForContest(contest, MOCK_PICKS);
    // Skip options already selected AND options whose Más/Menos sibling is
    // already selected (same groupId) — the random add must respect the
    // same mutual-exclusion rule as a manual tap.
    const selectedGroupIds = new Set(
      selections
        .map((s) => MOCK_PICKS.find((p) => s.id.startsWith(p.id))?.groupId)
        .filter((g): g is string => Boolean(g)),
    );
    const available = scopedPicks.filter(
      (p) =>
        !selections.some((s) => s.id.startsWith(p.id)) &&
        !selectedGroupIds.has(p.groupId),
    );
    const pool = available.length > 0 ? available : scopedPicks;
    if (pool.length === 0) return;
    const next = pool[Math.floor(Math.random() * pool.length)];
    updateDraft(contest.id, (s) => [...s, { ...next, id: `${next.id}-${s.length}` }]);
    // HAPTIC — light selection tick on add. No-op on iOS Safari.
    playSelectionHaptic();
  }, [selections, updateDraft]);

  // Toggles a pick within a SPECIFIC contest's draft — the one primitive
  // every entry point (feed card chips, the full-screen market accordion,
  // debug controls, AND the One Click Bet long-press session) goes through,
  // so none of them can bypass that contest's selection-count cap or the
  // Más/Menos mutual-exclusion rule.
  const togglePickFor = useCallback(
    (contestId: string, id: string) => {
      // HAPTIC — light selection tick on every toggle (add OR remove). The
      // user's finger has already done the work; the haptic confirms it.
      // No-op on iOS Safari (no Web Haptics API in 2026).
      playSelectionHaptic();
      updateDraft(contestId, (current) => {
        const existing = current.find((s) => s.id.startsWith(id));
        if (existing) return current.filter((s) => s !== existing);
        const contest = CONTESTS.find((c) => c.id === contestId);
        const max = contest?.maxSelections ?? buttonProgressionConfig.maxSelections;
        if (current.length >= max) {
          if (contest) {
            setContestLimitNotice(
              `Máximo ${max} selecciones para "${contest.name}".`,
            );
          }
          return current;
        }
        const pick = MOCK_PICKS.find((p) => p.id === id);
        if (!pick) return current;
        // Más/Menos on the same player+market+threshold are mutually
        // exclusive — selecting one replaces the other instead of stacking.
        const withoutGroupConflict = current.filter((s) => {
          const base = MOCK_PICKS.find((p) => s.id.startsWith(p.id));
          return base?.groupId !== pick.groupId;
        });
        return [
          ...withoutGroupConflict,
          { ...pick, id: `${pick.id}-${withoutGroupConflict.length}` },
        ];
      });
    },
    [updateDraft],
  );

  // Kept with a stable identity (reads `activeContestRef` rather than
  // `activeContest` directly) since it's shared by taps on the full-screen
  // market accordion AND the One Click Bet long-press session (`onAccept`
  // below) — both always act on the CURRENTLY OPEN contest's draft.
  const togglePick = useCallback(
    (id: string) => {
      const contestId = activeContestRef.current?.id;
      if (!contestId) return;
      togglePickFor(contestId, id);
    },
    [togglePickFor],
  );

  const removeLast = useCallback(() => {
    const contestId = activeContestId;
    if (!contestId) return;
    updateDraft(contestId, (s) => {
      if (s.length === 0) return s;
      // HAPTIC — same light tick as toggle/add so removal feels consistent.
      playSelectionHaptic();
      return s.slice(0, -1);
    });
  }, [activeContestId, updateDraft]);

  const reset = useCallback(() => {
    if (!activeContestId) return;
    updateDraft(activeContestId, () => []);
  }, [activeContestId, updateDraft]);

  const jumpToTier = useCallback(
    (target: Tier) => {
      // Debug-only tool — still must not exceed the active contest's max.
      const contestId = activeContestRef.current?.id;
      if (!contestId) return;
      const picks = selectionsForTier(target);
      const max = activeContestRef.current?.maxSelections;
      updateDraft(contestId, () => (max ? picks.slice(0, max) : picks));
    },
    [updateDraft],
  );

  // Tapping a pick again removes it (togglePick's existing find-and-filter
  // branch) — that's the only "remove a selection" affordance now that
  // there's no review list of rows with their own × buttons.

  // ContestPlayButton's tap handler — creates the entry DIRECTLY, no review
  // step or swipe gesture. Re-validates against the ACTIVE contest (not just
  // trusting that the button was visible/enabled) so a stale click can never
  // submit outside its selection range — see the "must not bypass contest
  // rules" requirement. Also guarded against `success` already being true —
  // an entry is created by exactly one tap, so a double-click/duplicate
  // event while one is already mid-creation/animation must be a no-op
  // rather than starting a second entry.
  // `submittingRef` (not just the `success` state) is the actual double-
  // submission guard: `ContestPlayButton` stays mounted through its exit
  // animation (AnimatePresence), holding the `onPlay` closure captured at
  // its LAST render before removal — which still closes over `success ===
  // false`. A second tap landing during that exit would read that stale
  // closure value and slip past a plain `if (success) return`. A ref is
  // mutated and read synchronously regardless of which render's closure
  // is invoked, so it can't go stale.
  const submittingRef = useRef(false);
  // Accepts an optional `contestId` so BOTH entry points — the full
  // screen's `ContestPlayButton` (omits it, uses whichever contest is
  // already active/open) AND a feed card's own "Jugar por: $X" CTA (passes
  // its own contest id, which may not be the currently-open one) — share
  // this exact guard/success path. Setting `activeContestId` here (even
  // when triggered from the feed, which never changes `screen`) is what
  // lets `finishEntryCreated` below know which contest's draft to save and
  // clear, regardless of which screen the entry was submitted from.
  const enterContest = useCallback(
    (contestId?: string) => {
      const targetId = contestId ?? activeContestId;
      if (submittingRef.current || !targetId) return;
      const contest = CONTESTS.find((c) => c.id === targetId);
      if (!contest) return;
      const draft = draftsByContest[targetId] ?? [];
      if (!canConfirmContestEntry(contest, draft.length)) return;
      submittingRef.current = true;
      setActiveContestId(targetId);
      setSuccess(true);
    },
    [activeContestId, draftsByContest],
  );

  // Fired when the green ticket has flown into Mis entradas — settles the
  // entry (badge bump, count, marks the contest "Participando"), clears
  // THAT contest's draft (never another contest's — each lives under its
  // own key in `draftsByContest`), and returns to the feed so the player
  // can immediately enter another contest.
  const finishEntryCreated = useCallback(() => {
    submittingRef.current = false;
    setSuccess(false);
    if (activeContestId) {
      const entry = saveContestEntry(activeContestId, draftsByContest[activeContestId] ?? []);
      setContestEntries((es) => [...es, entry]);
      updateDraft(activeContestId, () => []);
    }
    setEntryCount((c) => c + 1);
    setScreen('feed');
  }, [activeContestId, draftsByContest, updateDraft]);

  // ONE CLICK BET SESSION — a completed hold only toggles the pressed pick's
  // normal selection state, exactly like a tap (see oneClickBetSession.ts's
  // doc comment): it can never create an entry by itself, since an entry
  // requires at least `slipEntry.minSelections` (2) picks, placed only
  // through the normal swipe-to-confirm flow. `togglePick` already reuses the
  // same add/remove/group-exclusion rules a manual tap uses.
  const onAccept = useCallback(
    (pick: Selection) => togglePick(pick.id),
    [togglePick],
  );

  const {
    session: ocbSession,
    bind: bindPick,
    cancelActive: cancelOcbSession,
  } = useOneClickBetSession(togglePick, {
    holdDurationMs: buttonProgressionConfig.longPress.durationMs,
    engageMs: 150,
    reverseMs: buttonProgressionConfig.longPress.reverseMs,
    // Kept in lockstep with the pill's own exit-animation duration (see
    // OneClickBetPill.tsx / buttonProgressionConfig.ocbPillMotion.exit) so
    // the session only resets — restoring the bet slip — once the pill's
    // squash/stretch exit has visually finished.
    exitMs: osReducedMotion
      ? buttonProgressionConfig.ocbPillMotion.exit.reducedDurationMs
      : buttonProgressionConfig.ocbPillMotion.exit.durationMs,
    cancelTolerancePx: buttonProgressionConfig.longPress.cancelTolerancePx,
    onAccept,
    acceptToSubmitMs: OCB_SELECTED_HOLD_MS,
    // Informational only (see oneClickBetOnboarding.ts) — the session
    // doesn't gate or alter gesture behavior on this yet; it's exposed so a
    // future onboarding redesign (or the pill) can query readiness without
    // this hook needing to own any onboarding UI.
    onboardingReadiness: ocbOnboardingReadiness,
  });

  // Real vs. debug-preview pill data. `ocbSession.pillVisible` is the
  // session's own visibility field (true only once an engaged hold — see
  // oneClickBetSession.ts's `engageMs` — is in progress, through the brief
  // post-complete "filled" hold); real session data always wins over the
  // debug controls when a hold is actually happening.
  const realOcbActive = ocbSession.pillVisible;
  const oneClickBetPillVisible =
    (realOcbActive || debugOcbState !== 'hidden') && !success;
  const ocbPillState: OneClickBetPillState = !realOcbActive
    ? debugOcbState
    : ocbSession.phase === 'candidate' || ocbSession.phase === 'pressing'
      ? 'pressing'
      : ocbSession.phase === 'reversing'
        ? 'reversing'
        : ocbSession.phase === 'exiting'
          ? 'exiting'
          : 'filled'; // completed
  const ocbPillProgress = realOcbActive ? ocbSession.progress : debugOcbProgress;
  const ocbOdds = realOcbActive ? (ocbSession.odds ?? 0) : cumulativeOdds;

  /* ---------- tier-crossing haptic ---------- */
  // Watch `tier` for changes. On any transition between adjacent tiers
  // (or jumps spanning multiple at once via the debug buttons), fire a
  // medium-impact haptic. Skip the initial mount so we don't vibrate on
  // page load. No-op on iOS Safari.
  const prevTierRef = useRef<Tier>(tier);
  useEffect(() => {
    if (prevTierRef.current !== tier) {
      playTierCrossingHaptic();
      prevTierRef.current = tier;
    }
  }, [tier]);

  // Map selected pick ids back to base ids (without -N suffix) for the
  // market accordion so it can highlight which picks are in the slip.
  const baseSelectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const sel of selections) {
      // id format: "psg-w-0" -> base "psg-w"
      const lastDash = sel.id.lastIndexOf('-');
      s.add(sel.id.slice(0, lastDash));
    }
    return s;
  }, [selections]);

  // Whether the bet slip (collapsed pill) is on screen. Visible at ANY
  // selection count, including 0 (empty-state pill: 0 bets, $0 / $0,
  // disabled CTA) — only the success overlay hides it (the One Click Bet
  // floating pill sits in the same slot and is hidden/shown separately, see
  // `oneClickBetPillVisible`; a long-press no longer suppresses the button,
  // since it only ever adds/selects a pick). Drives BOTH the button mount
  // and the size of the dark gradient behind the navbar: the gradient only
  // needs to extend up far enough to separate the button from the content
  // when it's present. When it's absent, the reserved slot collapses so the
  // gradient shrinks to just the navbar band.
  //
  // Visible only while the CURRENT selection count is within the active
  // contest's allowed range (inclusive of both ends) — below the minimum
  // the top contest-context bar explains how many more are needed instead;
  // at the maximum, togglePick already refuses further adds.
  const contestPlayButtonVisible =
    !success &&
    screen === 'contest' &&
    !!activeContest &&
    canConfirmContestEntry(activeContest, selections.length);

  /* ============================================================ */
  /*  Render                                                      */
  /* ============================================================ */
  return (
    // RESPONSIVE LAYOUT — `[@media(min-width:431px)_and_(pointer:fine)]:`
    // (inline arbitrary variant, not a named `screens` entry — Tailwind
    // disables `min-[…]`/`max-[…]` arbitrary variants globally if `screens`
    // contains any object value) = width ≥ 431px AND pointer: fine (real
    // mouse). Width alone isn't reliable: some
    // Android phones report a CSS viewport width > 430px (larger screens,
    // OS display-scaling, landscape) and would otherwise be misclassified
    // as "desktop" here, forcing them into the fixed 390×844 mockup box —
    // pointer: fine reliably excludes touchscreens regardless of width.
    //   not desktop (real mobile browsers): full-bleed, no mockup chrome.
    //                                    Inner fills 100dvh × 100vw, square
    //                                    corners, no bezel, no shadow, notch
    //                                    hidden (real device has its own).
    //   desktop (desktop demo + tablets): 390×844 phone mockup (clamped to
    //                                      the real viewport) centered with
    //                                      bezel, rounded corners, shadow,
    //                                      notch — preserves the original
    //                                      desktop preview.
    //   ≥ 640px  (sm): extra outer padding so the mockup floats away
    //                  from the viewport edges.
    // 100dvh (dynamic viewport height) accounts for iOS Safari's URL bar
    // expand/collapse — uses the *current* viewport so the navbar doesn't
    // get pushed under browser chrome.
    <div className="flex min-h-[100dvh] w-full items-stretch justify-center [@media(min-width:431px)_and_(pointer:fine)]:items-center [@media(min-width:431px)_and_(pointer:fine)]:p-2 min-[640px]:p-6">
      {/* Phone frame */}
      <div className="relative w-full [@media(min-width:431px)_and_(pointer:fine)]:w-auto">
        <div className="[@media(min-width:431px)_and_(pointer:fine)]:rounded-[44px] [@media(min-width:431px)_and_(pointer:fine)]:bg-black/40 [@media(min-width:431px)_and_(pointer:fine)]:p-3 [@media(min-width:431px)_and_(pointer:fine)]:shadow-[0_30px_80px_rgba(75,32,255,0.25)] [@media(min-width:431px)_and_(pointer:fine)]:ring-1 [@media(min-width:431px)_and_(pointer:fine)]:ring-white/10">
          <div
            className="relative h-[100dvh] w-full overflow-hidden [@media(min-width:431px)_and_(pointer:fine)]:h-[min(844px,100dvh)] [@media(min-width:431px)_and_(pointer:fine)]:w-[min(390px,100vw)] [@media(min-width:431px)_and_(pointer:fine)]:rounded-[36px]"
            style={{
              // Matches the Figma newLeagueMarkets card bg (#000000) so the
              // chrome around the card and the card itself read as one
              // continuous surface. The outer bezel (`bg-black/40` above)
              // is a stylistic phone-mockup frame; leave it.
              background: '#000000',
            }}
          >
            {/* Notch — desktop mockup only. On real mobile the device has
                its own physical notch / dynamic island, so we hide ours. */}
            <div className="absolute left-1/2 top-2 z-30 hidden h-6 w-28 -translate-x-1/2 rounded-full bg-black [@media(min-width:431px)_and_(pointer:fine)]:block" />

            {/* T4 SIRI-STYLE VIGNETTE.
                Multi-color perimeter glow modeled on iOS 26 Siri
                activation. A heavily-blurred conic gradient with
                Apple-Intelligence-style colors (pink/magenta, purple,
                blue-purple, warm amber) rotates around the screen.
                A radial mask keeps the gradient clipped to the
                perimeter — inner 55% of the radius stays transparent
                so the markets/offers in the center column are
                untouched.

                Structure:
                  outer motion.div = the mask layer + fade-in opacity
                  inner motion.div = the rotating conic gradient

                The inner div is sized at 200% × 200% with inset -50%
                so rotation never reveals empty corners.

                Sits at z-[15] — ABOVE scrollable content (z-10) so it
                tints the edges of the cards, but BELOW the bet slip +
                navbar (z-20) so the CTA stays at full brightness.

                Tunables live at `cfg.tier4.vignette`. */}
            <motion.div
              aria-hidden
              className="vignette-shape-breathe pointer-events-none absolute inset-0 z-[15]"
              style={{
                overflow: 'hidden',
                // The radial mask is built from CSS custom properties
                // declared in src/index.css (.vignette-shape-breathe).
                // Those properties oscillate over an 18s loop so the
                // mask's ellipse subtly morphs (width, height, center,
                // and inner-stop each animate on slightly different
                // phases). Same trick the iOS 26 Siri activation uses
                // — continuous color rotation + organic shape morph.
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity:
                  tier === 4 && !reducedMotion
                    ? buttonProgressionConfig.tier4.vignette.opacityMax
                    : 0,
              }}
              transition={{
                duration:
                  buttonProgressionConfig.tier4.vignette.fadeInMs / 1000,
                ease: 'easeOut',
              }}
            >
              <motion.div
                style={{
                  position: 'absolute',
                  inset: '-50%',
                  width: '200%',
                  height: '200%',
                  // Conic gradient using the SAME two-color palette as
                  // the bet-slip outer glow swirl (see .outer-glow-swirl
                  // in src/index.css): #4e7bff (blue) alternating with
                  // #9730ff (purple). 5 stops at 90deg intervals create
                  // two visible "color crests" of each hue as the
                  // gradient rotates — so two waves of blue→purple
                  // sweep across the perimeter per rotation. Keeps the
                  // vignette tonally locked to the button's own glow
                  // so the screen edges and the bet slip read as one
                  // color system.
                  backgroundImage:
                    'conic-gradient(from 0deg, #4e7bff, #9730ff, #4e7bff, #9730ff, #4e7bff)',
                  // Heavy blur so the conic reads as soft light, not
                  // hard-edged color wedges.
                  filter: 'blur(40px)',
                  // Hardware-accelerate the rotation so it stays
                  // smooth on mobile.
                  willChange: 'transform',
                }}
                animate={
                  tier === 4 && !reducedMotion ? { rotate: 360 } : { rotate: 0 }
                }
                transition={
                  tier === 4 && !reducedMotion
                    ? {
                        // 16-second full rotation — slow enough to feel
                        // meditative, fast enough that the colors are
                        // visibly moving when the user looks at the screen.
                        duration: 16,
                        repeat: Infinity,
                        ease: 'linear',
                      }
                    : { duration: 0.3 }
                }
              />
            </motion.div>

            {/* Top decorative light moved into the sticky topbar
                (HomeScreenChrome) so it stays with the pinned header. */}

            {/* Scrollable content area */}
            <div
              className="no-scrollbar absolute inset-0 z-10 overflow-y-auto pb-[160px]"
              onScroll={(e) => {
                const st = e.currentTarget.scrollTop;
                const delta = st - lastScrollTopRef.current;
                lastScrollTopRef.current = st;
                // Ignore scroll events during the post-toggle lock window so
                // the collapse-driven reflow can't flip the state back.
                if (Date.now() < navLockRef.current) return;
                let next: boolean | null = null;
                if (st <= 8) next = false; // full near the top
                else if (delta > 8) next = true; // scrolling down
                else if (delta < -8) next = false; // scrolling up
                if (next === null) return;
                const target = next;
                setNavCompact((c) => {
                  if (c !== target) navLockRef.current = Date.now() + 320;
                  return target;
                });
              }}
            >
              {screen === 'feed' ? (
                <ContestsFeed
                  contests={CONTESTS}
                  onOpen={openContest}
                  onEnter={enterContest}
                  onViewLeaderboard={openLeaderboard}
                  participatingIds={participatingContestIds}
                  entryCounts={entryCountsByContest}
                  draftsByContest={draftsByContest}
                  onTogglePick={togglePickFor}
                />
              ) : screen === 'leaderboard' && activeContest ? (
                <ContestLeaderboard
                  contest={activeContest}
                  entries={activeContestEntries}
                  onBack={backToFeed}
                  onCreateEntry={() => openContest(activeContest.id)}
                  onSelectEntry={setSelectedEntryId}
                />
              ) : (
                <>
              <HomeScreenChrome
                picks={activeContest ? picksForContest(activeContest, MOCK_PICKS) : MOCK_PICKS}
                selectedIds={baseSelectedIds}
                bindPick={bindPick}
                cancelActivePress={cancelOcbSession}
                headerCollapsed={navCompact}
                onBack={backToFeed}
                activeContestName={activeContest?.name}
                activeContest={activeContest}
                selectionCount={selections.length}
                contestLimitNotice={contestLimitNotice}
                hideLeagueMatchTabs={!!activeContest && isContestScoped(activeContest)}
                scopeLabel={activeContest ? contestScopeLabel(activeContest) : null}
              />

              {/* Debug controls inline (only visible with ?debug=true) */}
              {debug && (
                <div className="mx-3 mb-2 mt-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
                  <div className="mb-2 text-[11px] font-bold text-amber-300">
                    DEBUG · jump to tier
                  </div>
                  <div className="mb-2 flex gap-1.5">
                    {[0, 1, 2, 3, 4].map((t) => (
                      <button
                        key={t}
                        onClick={() => jumpToTier(t as Tier)}
                        className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold ${
                          tier === t
                            ? 'bg-amber-300 text-black'
                            : 'bg-white/10 text-white'
                        }`}
                      >
                        T{t}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setSpeedScale((s) => (s === 1 ? 3 : 1))}
                    className="w-full rounded-md bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white"
                  >
                    Animation speed: {speedScale === 1 ? '1× normal' : '3× slow'}
                  </button>
                  {/* PASS 3 — Tier 3 odds effect variant toggle. */}
                  <button
                    onClick={() =>
                      setTier3OddsEffect((e) =>
                        e === 'flames' ? 'smoke' : 'flames',
                      )
                    }
                    className="mt-1.5 w-full rounded-md bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white"
                  >
                    T3 odds effect: {tier3OddsEffect === 'flames' ? '🔥 flames' : '💨 smoke'}
                  </button>
                  {/* DEV OVERRIDE — reopens the Quick Bet onboarding sheet on
                      demand. This is now the only way to open it; it no
                      longer auto-opens on load. */}
                  <button
                    onClick={() => setOnboardingOpen(true)}
                    className="mt-1.5 w-full rounded-md bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white"
                  >
                    Show onboarding sheet
                  </button>
                </div>
              )}

              {/* DEV CONTROLS — One Click Bet floating pill preview.
                  Real gesture state now (see ocbSession above); the debug
                  buttons below only drive the pill when no real hold is
                  active. Never rendered outside ?debug=true. */}
              {debug && (
                <div className="mx-3 mb-2 mt-3 rounded-xl border border-[#4b20ff]/40 bg-[#4b20ff]/10 p-3">
                  <div className="mb-2 text-[11px] font-bold text-[#b18bff]">
                    DEBUG · one click bet pill
                  </div>
                  <div className="mb-1.5 grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setDebugOcbState('hidden')}
                      className={`col-span-2 rounded-md px-2 py-1.5 text-[11px] font-bold ${
                        debugOcbState === 'hidden'
                          ? 'bg-[#b18bff] text-black'
                          : 'bg-white/10 text-white'
                      }`}
                    >
                      Contest play button
                    </button>
                    <button
                      onClick={() => setDebugOcbState('default')}
                      disabled={selections.length === 0}
                      className={`rounded-md px-2 py-1.5 text-[11px] font-bold disabled:opacity-30 ${
                        debugOcbState === 'default'
                          ? 'bg-[#b18bff] text-black'
                          : 'bg-white/10 text-white'
                      }`}
                    >
                      OCB: default
                    </button>
                    <button
                      onClick={() => setDebugOcbState('filled')}
                      disabled={selections.length === 0}
                      className={`rounded-md px-2 py-1.5 text-[11px] font-bold disabled:opacity-30 ${
                        debugOcbState === 'filled'
                          ? 'bg-[#b18bff] text-black'
                          : 'bg-white/10 text-white'
                      }`}
                    >
                      OCB: filled
                    </button>
                  </div>
                  {/* "pressing" progress scrub — only meaningful once the
                      pill is in the 'pressing' state. */}
                  <div className="mb-1.5 flex gap-1.5">
                    {[0, 0.25, 0.5, 0.75].map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setDebugOcbState('pressing');
                          setDebugOcbProgress(p);
                        }}
                        disabled={selections.length === 0}
                        className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold disabled:opacity-30 ${
                          debugOcbState === 'pressing' && debugOcbProgress === p
                            ? 'bg-[#b18bff] text-black'
                            : 'bg-white/10 text-white'
                        }`}
                      >
                        {Math.round(p * 100)}%
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setDebugOcbState('default')}
                    disabled={selections.length === 0}
                    className="mb-1.5 w-full rounded-md bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-30"
                  >
                    ▶ Transition: bet slip → One Click Bet
                  </button>
                  <button
                    onClick={() => setDebugOcbState('hidden')}
                    className="w-full rounded-md bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white"
                  >
                    ◀ Restore previous bet slip
                  </button>
                </div>
              )}

              {/* Action controls — Add / Remove / Reset (dev-only, same
                  gating as the amber debug box above; ?debug=true to use). */}
              {debug && (
                <div className="mx-3 mb-2 mt-3 flex gap-2">
                  <button
                    onClick={addRandom}
                    disabled={
                      selections.length >=
                      (activeContest?.maxSelections ??
                        buttonProgressionConfig.maxSelections)
                    }
                    className="flex-1 rounded-xl bg-gradient-to-r from-[#4b20ff] to-[#9730ff] px-3 py-2.5 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    + Añadir selección
                  </button>
                  <button
                    onClick={removeLast}
                    disabled={selections.length === 0}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[12px] font-bold text-white/90 disabled:opacity-30"
                  >
                    − Quitar
                  </button>
                  <button
                    onClick={reset}
                    disabled={selections.length === 0}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[12px] font-bold text-white/90 disabled:opacity-30"
                  >
                    Reset
                  </button>
                </div>
              )}
                </>
              )}
            </div>

            {/* Fixed bottom: gradient fade + button slot + navbar.
                PASS 3 — The bet slip is now conditionally mounted via
                AnimatePresence (mode="wait" queues the entry until any
                in-flight exit finishes). A reserved-height slot keeps the
                navbar pinned even when the button is unmounted.

                RESPONSIVE — pb-safe-bottom uses env(safe-area-inset-bottom)
                so on iOS phones with a home indicator the navbar floats
                above it instead of being half-obscured. No-op on desktop
                (the env value is 0) and on devices without a home
                indicator. */}
            <div
              className="absolute inset-x-0 bottom-0 z-20"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              {/* Upper fade above the bet-slip area.
                  T0-T3: full 0.8 → transparent to anchor the slip
                         visually against the markets above.
                  T4:    much softer (0.35 max) so the dark backdrop
                         doesn't compete with the Siri vignette's
                         colored perimeter bloom — at T4 the vignette
                         alone provides plenty of perimeter framing,
                         and pushing the dark backdrop to full strength
                         creates a visible rectangular "panel" on top
                         of the colored bloom. */}
              <div
                className="pointer-events-none absolute inset-x-0 -top-10 h-10"
                style={{
                  background:
                    tier === 4
                      ? 'linear-gradient(to top, rgba(0,0,0,0.35), transparent)'
                      : 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                }}
              />
              <div
                className="relative"
                style={{
                  // Same tier-conditional rule as the upper fade above
                  // — the lower gradient softens at T4 so it doesn't
                  // read as a rectangular panel against the rotating
                  // vignette colors. Start opacity matches the upper
                  // fade's end opacity so there's never a discontinuity
                  // at the boundary regardless of tier.
                  background:
                    tier === 4
                      ? 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 100%)'
                      : 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.95) 100%)',
                  // Smooth-fade the gradient swap during tier change so
                  // the dark backdrop fades up/down with the vignette
                  // rather than snapping.
                  transition: 'background 700ms ease-out',
                }}
              >
                {/* Reserved-height slot. The play button is anchored to its
                    BOTTOM (against the navbar), so this height only controls
                    how far the dark gradient extends ABOVE it. It reserves
                    the full height while the button is on screen — giving
                    the gradient enough reach to separate it from the content
                    — and collapses to 0 otherwise so the gradient shrinks to
                    just the navbar band. */}
                <div
                  className="relative transition-[height] duration-300 ease-out"
                  style={{
                    height:
                      contestPlayButtonVisible || oneClickBetPillVisible
                        ? buttonProgressionConfig.slotReservedHeightPx
                        : 0,
                  }}
                >
                  {/* CONTEST PLAY BUTTON — replaces the collapsed bet slip on
                      this screen (see the "Contest draft/review flow"
                      landmark). Visible only while the CURRENT selection
                      count is within the active contest's range
                      (`contestPlayButtonVisible`); tapping it creates the
                      entry directly — no review step, no swipe gesture.
                      Anchored to the slot's bottom baseline; the 8px gap
                      above the navbar comes from its own pb-2.

                      ONE CLICK BET VISIBILITY ARBITRATION — when the OCB
                      floating pill is visible (`oneClickBetPillVisible`),
                      this whole wrapper is hidden via `visibility:hidden`,
                      NOT unmounted, so restoring is just flipping visibility
                      back — never recreated from scratch. */}
                  <div
                    className="absolute inset-x-0 bottom-0 z-10"
                    style={
                      oneClickBetPillVisible
                        ? { visibility: 'hidden', pointerEvents: 'none' }
                        : undefined
                    }
                    aria-hidden={oneClickBetPillVisible}
                  >
                    <AnimatePresence>
                      {contestPlayButtonVisible && (
                        <ContestPlayButton
                          key="contest-play-button"
                          amount={activeContest!.entryCost}
                          onPlay={() => enterContest()}
                        />
                      )}
                    </AnimatePresence>
                  </div>

                  {/* ONE CLICK BET — floating progress pill. Occupies the
                      EXACT same slot as the play button above (same
                      px-4/pb-2/pt-2 padding, same z-10 stacking, same
                      bottom-anchored container) so it never introduces a new
                      position or extra layout height. Fed real
                      OneClickBetSession data whenever a hold is actually in
                      progress (see ocbPillState/ocbOdds/etc. above); falls
                      back to the `?debug=true` preview controls otherwise.
                      Still pointer-events-none — no tap/hold handlers live on
                      the pill itself, the gesture is bound to the pick
                      buttons via `bindPick`. */}
                  {oneClickBetPillVisible && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 w-full px-4 pb-2 pt-2">
                      <OneClickBetPill
                        odds={ocbOdds}
                        state={ocbPillState}
                        progress={ocbPillProgress}
                        reducedMotion={osReducedMotion}
                      />
                    </div>
                  )}
                </div>
                <Navbar
                  entryCount={entryCount}
                  bump={entryBump}
                  badgeVisible={badgeVisible}
                  compact={navCompact}
                />
              </div>
            </div>

            {/* Success — green "Entrada creada" card that flies into Mis
                entradas, then finishEntryCreated() pops the count badge,
                marks the contest "Participando", and returns to the feed.
                Also resets the OneClickBetSession (cancelOcbSession) so any
                lingering hold state is cleared — a no-op in practice, since
                a hold never sets `success` itself (see
                contestPlayButtonVisible's comment). */}
            {success && (
              <EntryCreatedOverlay
                onCatch={() => setEntryBump((n) => n + 1)}
                onDone={() => {
                  finishEntryCreated();
                  cancelOcbSession();
                }}
              />
            )}

            {/* Contest entry detail — read-only sheet for one of the
                player's own entries, opened by tapping it on the
                leaderboard screen (see ContestLeaderboard). Closing it
                (× or swipe-down) just clears `selectedEntryId`, returning
                to the same leaderboard scroll position underneath. */}
            <AnimatePresence>
              {selectedEntry && activeContest && (
                <ContestEntrySheet
                  key={selectedEntry.id}
                  entry={selectedEntry}
                  entryIndex={selectedEntryIndex}
                  contest={activeContest}
                  onClose={() => setSelectedEntryId(null)}
                />
              )}
            </AnimatePresence>

            {/* Quick Bet onboarding — first-visit info sheet for the
                long-press gesture (see the auto-open effect above). Mounted
                at the same level as EntryCreatedOverlay so it shares the
                phone-frame's clipping bounds and z-stack. */}
            <AnimatePresence>
              {onboardingOpen && (
                <OnboardingSheet
                  key="onboarding-sheet"
                  onClose={closeOnboarding}
                  onSetupComplete={handleOcbSetupComplete}
                />
              )}
            </AnimatePresence>

            {/* Debug overlay (tier badge + live ambient phases) */}
            {debug && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute left-2 bottom-[170px] z-40 w-[156px] rounded-lg border border-amber-400/40 bg-black/85 px-2.5 py-1.5 text-left"
              >
                <div className="text-[9px] font-bold uppercase tracking-widest text-amber-300">
                  Debug
                </div>
                <div className="text-[12px] font-black text-white">
                  Tier {tier} · {buttonProgressionConfig.tiers[tier].name}
                </div>
                <div className="text-[10px] font-medium text-white/70">
                  Odds {cumulativeOdds.toFixed(2)}x
                </div>
                <div className="text-[10px] font-medium text-white/70">
                  {selections.length} / {buttonProgressionConfig.maxSelections} picks
                </div>
                {/* Live phase readouts — driven by ButtonPreviewMomios useMotionValueEvent */}
                <div className="mt-1 flex items-center justify-between border-t border-amber-400/20 pt-1">
                  <span className="text-[9px] uppercase tracking-wider text-amber-300/80">
                    Tremor
                  </span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      live?.tremorActive ? 'bg-amber-300' : 'bg-white/20'
                    }`}
                  />
                </div>
                <PhaseBar label="Glow" value={live?.borderPhase ?? 0} />
                <PhaseBar label="Breath" value={live?.breathPhase ?? 0} />
                {/* T3 odds effect toggle — pinned here so it's always reachable */}
                <button
                  onClick={() =>
                    setTier3OddsEffect((e) =>
                      e === 'flames' ? 'smoke' : 'flames',
                    )
                  }
                  className="mt-1.5 w-full rounded-md bg-white/10 px-2 py-1 text-[10px] font-bold text-white"
                >
                  T3: {tier3OddsEffect === 'flames' ? '🔥 flames' : '💨 smoke'}
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
