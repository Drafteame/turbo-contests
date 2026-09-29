/** ============================================================
 *  Contests feed — central mock configuration.
 *  Every contest shown on the feed is defined here: name, stable id,
 *  selection range, fixed entry cost, potential winnings, and a fake
 *  participant count. All figures are prototype data (not a real
 *  transaction or live count).
 *  ============================================================ */

/** Each accent reuses a gradient that already exists elsewhere in the app
    (never an invented hue), so the feed reads as one system:
      - brand:     the primary CTA gradient (Header's + button, TODOS pill).
      - duel:      the Más/Menos "selected" gradient — fits contests that
                    are themselves about picking/facing off.
      - risk:      OnboardingSheet's ERROR_COLOR (#ff6b6b) blended into the
                    brand violet — red already means "risk" in this app.
      - legendary: the T4 "Legendario" tier's vignette pair (#4e7bff →
                    #9730ff) — this app already has a "Legendario" concept
                    with a white-glow treatment; the top contest borrows it. */
export type ContestAccent = 'brand' | 'duel' | 'risk' | 'legendary';

export type Contest = {
  /** Stable, kebab-case id — used as the React key and to route back to
      the same contest (never reassign an existing id). */
  id: string;
  name: string;
  tagline: string;
  /** Short uppercase label shown as a corner tag, e.g. "POPULAR". Plain
      text — no emoji. */
  badge?: string;
  /** Pair `badge` with the existing "popular" flame icon (the same one the
      POPULARES filter pill uses) — reserved for the one contest where that
      icon's meaning actually applies. */
  badgeIcon?: boolean;
  accent: ContestAccent;
  /** Mock number of competing users. */
  participants: number;
  minSelections: number;
  maxSelections: number;
  /** Fixed entry cost in USD. */
  entryCost: number;
  /** Potential winnings in USD if the entry hits. */
  potentialWinnings: number;
};

export const CONTEST_ACCENTS: Record<
  ContestAccent,
  {
    gradient: string;
    /** Text color for the CTA fill — chosen for contrast against `gradient`. */
    ctaTextColor: string;
    /** Corner glow + card-border tint. */
    glow: string;
    ring: string;
    /** Tint for this accent's badge label + "Gana hasta" caption. */
    tint: string;
  }
> = {
  brand: {
    gradient: 'linear-gradient(75.11deg, #4b20ff 0%, #9730ff 100%)',
    ctaTextColor: '#fbfbfb',
    glow: 'rgba(151,48,255,0.32)',
    ring: 'rgba(151,48,255,0.4)',
    tint: '#c9b3ff',
  },
  duel: {
    gradient: 'linear-gradient(75.11deg, #d2ff72 0%, #56deea 100%)',
    ctaTextColor: '#0a0a0a',
    glow: 'rgba(86,222,234,0.28)',
    ring: 'rgba(210,255,114,0.4)',
    tint: '#d2ff72',
  },
  risk: {
    gradient: 'linear-gradient(75.11deg, #ff6b6b 0%, #9730ff 100%)',
    ctaTextColor: '#fbfbfb',
    glow: 'rgba(255,107,107,0.28)',
    ring: 'rgba(255,107,107,0.4)',
    tint: '#ff9b9b',
  },
  legendary: {
    gradient: 'linear-gradient(75.11deg, #4e7bff 0%, #9730ff 100%)',
    ctaTextColor: '#fbfbfb',
    glow: 'rgba(78,123,255,0.32)',
    ring: 'rgba(251,251,251,0.35)',
    tint: '#fbfbfb',
  },
};

/** Fixed entry amount + potential winnings for a contest — the source of
    truth for the draft/review bet-slip UI while a contest is active,
    replacing the global count-based `slipEntry` table (never derived from
    odds, and constant regardless of how many selections are made). */
export function getContestEntryValues(
  contest: Contest,
): { amount: number; potentialWin: number } {
  return { amount: contest.entryCost, potentialWin: contest.potentialWinnings };
}

/** A contest entry is confirmable only within its own selection range. */
export function canConfirmContestEntry(
  contest: Contest,
  selectionCount: number,
): boolean {
  return (
    selectionCount >= contest.minSelections &&
    selectionCount <= contest.maxSelections
  );
}

/** `contest.participants` is mock baseline data that never includes the
    current user. Add exactly one when the user has joined — regardless
    of how many entries they've created — so a repeat entry never double-
    counts them. */
export function getDisplayParticipants(
  contest: Contest,
  participating: boolean,
): number {
  return contest.participants + (participating ? 1 : 0);
}

export const CONTESTS: Contest[] = [
  {
    id: 'parlay-relampago',
    name: 'Parlay Relámpago',
    tagline: 'Combina selecciones rápidas y multiplica tu entrada.',
    badge: 'POPULAR',
    badgeIcon: true,
    accent: 'brand',
    participants: 3482,
    minSelections: 2,
    maxSelections: 4,
    entryCost: 10,
    potentialWinnings: 250,
  },
  {
    id: 'duelo-de-estrellas',
    name: 'Duelo de Estrellas',
    tagline: 'Cara a cara: elige a tus 2 favoritos y gana el doble.',
    badge: '1 VS 1',
    accent: 'duel',
    participants: 892,
    minSelections: 2,
    maxSelections: 2,
    entryCost: 25,
    potentialWinnings: 180,
  },
  {
    id: 'contest-semanal',
    name: 'Contest Semanal',
    tagline: 'Arma tu mejor combinación de la semana.',
    badge: 'NUEVO',
    accent: 'brand',
    participants: 12847,
    minSelections: 3,
    maxSelections: 6,
    entryCost: 15,
    potentialWinnings: 1200,
  },
  {
    id: 'sprint-goleador',
    name: 'Sprint Goleador',
    tagline: 'Entrada mínima, acción máxima.',
    accent: 'duel',
    participants: 5610,
    minSelections: 2,
    maxSelections: 3,
    entryCost: 5,
    potentialWinnings: 60,
  },
  {
    id: 'maxima-combinacion',
    name: 'Máxima Combinación',
    tagline: 'Alto riesgo, alta recompensa. Solo para expertos.',
    badge: 'ALTO RIESGO',
    accent: 'risk',
    participants: 214,
    minSelections: 5,
    maxSelections: 8,
    entryCost: 50,
    potentialWinnings: 5000,
  },
  {
    id: 'torneo-legendario',
    name: 'Torneo Legendario',
    tagline: 'El contest más exclusivo. Cupos limitados.',
    badge: 'ÉLITE',
    accent: 'legendary',
    participants: 76,
    minSelections: 6,
    maxSelections: 10,
    entryCost: 100,
    potentialWinnings: 25000,
  },
];
