import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  usePresence,
  type PanInfo,
} from 'framer-motion';
import { useEffect } from 'react';
import closeIcon from './assets/close.svg';
import playerIcon from './assets/player.svg';
import { formatEntryDate, formatEntrySelectionLabel, type ContestEntry } from './contestEntries';
import type { Contest } from './contests';

/**
 * ContestEntrySheet — read-only "look at one of my entries" bottom sheet,
 * opened by tapping an entry card in ContestLeaderboard. Deliberately
 * reuses BetSlipFullSheet's row layout (player placeholder + market/pick/
 * time) and overall shell (rounded-28 card, grabber handle, header + ×,
 * capped below the app header, internal scroll) so it reads as the same
 * family of surface — but strips every editing/action affordance: no
 * remove ×, no odds, no swipe-to-play, no promos. Just the entry's own
 * selections plus which contest/when it was created.
 *
 * Simpler open/close than BetSlipFullSheet's shape-morph (there's no pill
 * to morph into/out of here) — a plain slide-up/fade, with the same
 * drag-to-dismiss pattern (chrome-only drag start so the scrollable list
 * keeps its own gesture).
 */

const CLOSE_OFFSET_PX = 120;
const CLOSE_VELOCITY = 550;
const TOP_INSET_PX = 96;
const BOTTOM_GAP_PX = 16;
const OPEN_SPRING = { type: 'spring', stiffness: 340, damping: 36 } as const;

type Props = {
  entry: ContestEntry;
  entryIndex: number;
  contest: Contest;
  onClose: () => void;
};

export function ContestEntrySheet({ entry, entryIndex, contest, onClose }: Props) {
  const [isPresent, safeToRemove] = usePresence();
  const y = useMotionValue(40);
  const opacity = useMotionValue(0);

  useEffect(() => {
    if (isPresent) {
      const a1 = animate(y, 0, OPEN_SPRING);
      const a2 = animate(opacity, 1, { duration: 0.2 });
      return () => {
        a1.stop();
        a2.stop();
      };
    }
    const a1 = animate(y, 40, { duration: 0.18, ease: [0.4, 0, 1, 1] });
    const a2 = animate(opacity, 0, { duration: 0.15 });
    let done = false;
    Promise.all([a1, a2]).then(() => {
      if (done) return;
      done = true;
      safeToRemove?.();
    });
    return () => {
      done = true;
      a1.stop();
      a2.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  const dragControls = useDragControls();
  const onSheetDragMove = (_e: unknown, info: PanInfo) => {
    if (info.offset.y > 0) y.set(info.offset.y);
  };
  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.y > CLOSE_OFFSET_PX || info.velocity.y > CLOSE_VELOCITY) {
      onClose();
    } else {
      animate(y, 0, OPEN_SPRING);
    }
  };

  return (
    <div
      className={`absolute inset-0 z-50 ${!isPresent ? 'pointer-events-none' : ''}`}
      style={{ fontFamily: "'Red Hat Display', sans-serif" }}
    >
      <motion.div
        className="absolute inset-0 bg-black/70"
        style={{ opacity }}
        onClick={onClose}
        aria-hidden
      />

      <div
        className="absolute left-4 right-4 flex flex-col justify-end"
        style={{
          top: TOP_INSET_PX,
          bottom: 0,
          paddingBottom: `calc(env(safe-area-inset-bottom) + ${BOTTOM_GAP_PX}px)`,
        }}
      >
        <motion.div
          className="relative flex max-h-full w-full flex-col overflow-hidden rounded-[28px] border border-[rgba(251,251,251,0.12)]"
          style={{
            y,
            opacity,
            backgroundImage: 'linear-gradient(to bottom, #191919 0%, #0f0f0f 100%)',
          }}
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0}
          onDrag={onSheetDragMove}
          onDragEnd={handleDragEnd}
          onPointerDown={(e) => {
            const el = e.target as HTMLElement;
            if (el.closest('button') || el.closest('[data-scroll]')) return;
            dragControls.start(e);
          }}
        >
          {/* HANDLE */}
          <div className="flex shrink-0 items-center justify-center px-3 pt-3 pb-2">
            <div className="h-1 w-8 rounded-full bg-[rgba(251,251,251,0.32)]" />
          </div>

          {/* HEADER */}
          <div className="relative flex h-14 shrink-0 items-center border-b border-[rgba(240,242,244,0.08)]">
            <div className="flex min-w-px flex-1 flex-col items-center justify-center px-3">
              <div className="flex items-center justify-center gap-1.5">
                <p className="text-[14px] font-bold leading-[21px] text-[#f0f2f4]">
                  Entrada #{entryIndex + 1}
                </p>
                <span
                  className="inline-flex items-center rounded-[6px] border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                  style={{
                    color: '#ffd166',
                    borderColor: 'rgba(255,209,102,0.4)',
                    backgroundColor: 'rgba(255,209,102,0.1)',
                  }}
                >
                  Pendiente
                </span>
              </div>
              <p className="w-full truncate text-center text-[12px] font-medium leading-4 text-[rgba(251,251,251,0.5)]">
                {contest.name} · {formatEntryDate(entry.createdAt)}
              </p>
            </div>
            <div className="flex w-12 shrink-0 justify-end pr-1">
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onClose}
                onPointerDownCapture={(e) => e.stopPropagation()}
                className="flex size-10 items-center justify-center rounded-full active:scale-95"
              >
                <img src={closeIcon} alt="" className="size-5" />
              </button>
            </div>
          </div>

          {/* CONTENT — read-only selections list. Same row shape as the
              former expanded bet slip (player placeholder + market/pick/
              time), minus the remove control and odds. */}
          <div
            data-scroll
            className="no-scrollbar relative min-h-px flex-1 overflow-y-auto"
          >
            {entry.selections.map((sel, i) => (
              <div key={i} className="flex w-full items-stretch px-3">
                <div className="flex size-11 shrink-0 items-center justify-center">
                  <div className="size-9 overflow-hidden rounded-[8px] backdrop-blur-[2px]">
                    <img src={playerIcon} alt="" className="size-full object-contain p-[3px]" />
                  </div>
                </div>
                <div className="flex min-w-px flex-1 items-center gap-[6px] border-b border-[rgba(251,251,251,0.06)] px-[6px] py-2 last:border-b-0">
                  <div className="flex min-w-px flex-1 flex-col justify-center">
                    <p className="max-w-[200px] truncate text-[10px] font-bold uppercase leading-[15px] text-[rgba(251,251,251,0.5)]">
                      {sel.market}
                    </p>
                    <p className="truncate text-[14px] font-medium leading-[21px] text-[#fbfbfb]">
                      {sel.pick} · {formatEntrySelectionLabel(sel)}
                    </p>
                    <p className="truncate text-[12px] font-medium leading-4 text-[rgba(251,251,251,0.5)]">
                      {sel.homeAbbrev} vs {sel.awayAbbrev} · {sel.matchTime}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* FOOTER — the entry's fixed contest terms, read-only. */}
          <div className="flex shrink-0 items-stretch gap-3 border-t border-[rgba(251,251,251,0.16)] px-4 py-3">
            <div className="flex min-w-px flex-1 flex-col">
              <span className="text-[10px] font-bold uppercase leading-[13px] tracking-wide text-[rgba(251,251,251,0.44)]">
                Entrada
              </span>
              <span className="text-[16px] font-black leading-[21px] text-[#fbfbfb]">
                ${contest.entryCost}
              </span>
            </div>
            <div aria-hidden className="my-1 w-px bg-[rgba(251,251,251,0.12)]" />
            <div className="flex min-w-px flex-1 flex-col items-end text-right">
              <span className="text-[10px] font-bold uppercase leading-[13px] tracking-wide text-[rgba(251,251,251,0.44)]">
                Gana hasta
              </span>
              <span className="text-[16px] font-black leading-[21px] text-[#fbbf24]">
                ${contest.potentialWinnings}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
