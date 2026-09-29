import { animate, motion, useMotionValue, usePresence } from 'framer-motion';
import { useEffect } from 'react';

/**
 * ContestPlayButton — replaces the collapsed bet slip on the contest
 * draft screen. A single primary CTA, visible only while the current
 * selection count is within the active contest's allowed range (inclusive
 * of both ends) — App.tsx mounts/unmounts it via AnimatePresence for
 * exactly that condition, so by the time this is on screen tapping it is
 * always a valid entry. There is no review step or swipe gesture: tapping
 * creates the entry directly (see App.tsx's `enterContest`).
 *
 * Mount/unmount slide mirrors BetSlipSheet's own simple y/opacity motion
 * (declarative `initial`/`animate` on an AnimatePresence child is flaky
 * under React 18 StrictMode's double-invoked effects — see BetSlipSheet's
 * own comment — so this animates by hand via `usePresence`, the same
 * proven pattern).
 */
type Props = {
  /** The active contest's fixed entry cost. */
  amount: number;
  onPlay: () => void;
};

export function ContestPlayButton({ amount, onPlay }: Props) {
  const [isPresent, safeToRemove] = usePresence();
  const y = useMotionValue<number>(40);
  const opacity = useMotionValue<number>(0);

  useEffect(() => {
    if (isPresent) {
      const a1 = animate(y, 0, { type: 'spring', stiffness: 420, damping: 34 });
      const a2 = animate(opacity, 1, { duration: 0.2 });
      return () => {
        a1.stop();
        a2.stop();
      };
    }
    const a1 = animate(y, 40, { duration: 0.2, ease: [0.7, 0, 0.84, 0] });
    const a2 = animate(opacity, 0, { duration: 0.15 });
    let done = false;
    Promise.all([a1.then(() => {}), a2.then(() => {})]).then(() => {
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

  return (
    <motion.div className="relative w-full px-4 pb-2 pt-2" style={{ y, opacity }}>
      <motion.button
        type="button"
        onClick={onPlay}
        whileTap={{ scale: 0.97 }}
        className="relative flex h-[56px] w-full items-center justify-center rounded-[56px] border border-[#4b20ff]"
        style={{
          backgroundImage: 'linear-gradient(58.9deg, #4b20ff 0%, #9730ff 100%)',
          boxShadow: 'inset 0 0 12px rgba(0,0,0,0.24), 0 2px 6px rgba(29,11,68,0.3)',
        }}
      >
        <span
          className="text-[16px] font-black not-italic"
          style={{
            fontFamily: 'Red Hat Display, sans-serif',
            color: '#fbfbfb',
          }}
        >
          Jugar por: ${amount}
        </span>
      </motion.button>
    </motion.div>
  );
}
