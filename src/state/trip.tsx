/**
 * The one piece of shared UI state: where you're going, for how long, and how
 * you want options ordered.
 *
 * Kept in context rather than passed down because the map and the list are
 * sibling routes that must agree — picking a destination on the map and then
 * switching to the list has to show the same ranking, not a reset one.
 *
 * Note what is NOT in here: anything the engine can derive. Current status,
 * cost and eligibility are computed from (areas, at, profile) wherever they are
 * needed. Caching them in state would create a second source of truth that can
 * go stale between ticks.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_PROFILE, type Profile, type RankingMode } from '../engine';
import { buildingById, type Building } from '../engine/search';

interface TripState {
  destination: Building | null;
  setDestination: (building: Building | null) => void;
  durationHours: number;
  setDurationHours: (hours: number) => void;
  mode: RankingMode;
  setMode: (mode: RankingMode) => void;
  profile: Profile;
  setProfile: (profile: Profile) => void;
}

const TripContext = createContext<TripState | null>(null);

/** The durations people actually park for. A free-text field would be worse. */
export const DURATION_OPTIONS = [1, 2, 3, 4, 8] as const;

export function TripProvider({ children }: { children: ReactNode }) {
  // Mason Hall is the default destination: it is on the Diag, it is where the
  // largest number of undergraduate classes happen, and having *a* destination
  // means the list is useful before the user has typed anything.
  const [destination, setDestination] = useState<Building | null>(
    () => buildingById.get('mason-hall') ?? null
  );
  const [durationHours, setDurationHours] = useState(2);
  const [mode, setMode] = useState<RankingMode>('balanced');
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);

  const value = useMemo(
    () => ({
      destination,
      setDestination,
      durationHours,
      setDurationHours,
      mode,
      setMode,
      profile,
      setProfile,
    }),
    [destination, durationHours, mode, profile]
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripState {
  const context = useContext(TripContext);
  if (!context) throw new Error('useTrip must be used inside a TripProvider');
  return context;
}
