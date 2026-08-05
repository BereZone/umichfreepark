/**
 * The one piece of shared UI state: where you're going, for how long, how you
 * want options ordered, and who you are.
 *
 * Kept in context rather than passed down because the map and the list are
 * sibling routes that must agree — picking a destination on the map and then
 * switching to the list has to show the same ranking, not a reset one.
 *
 * Note what is NOT in here: anything the engine can derive. Current status,
 * cost and eligibility are computed from (areas, at, profile) wherever they are
 * needed. Caching them in state would create a second source of truth that can
 * go stale between ticks.
 *
 * WHY THIS PERSISTS
 *
 * Everything here is a slow-moving fact about the person, not about this
 * session: a student goes to the same three buildings all term and their class
 * year changes once a year. Asking again on every launch would make the app's
 * first screen useless until it had been re-configured, which is the opposite
 * of what it is for — you open this in a moving car outside a structure.
 *
 * AsyncStorage rather than a server, for the same reason nothing else here has
 * one: the app must work with no signal. It is also why every read is guarded —
 * storage failing has to cost the user their recents, never the app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { DEFAULT_PROFILE, type Profile, type RankingMode } from '../engine';
import { buildingById, type Building } from '../engine/search';

interface TripState {
  destination: Building | null;
  setDestination: (building: Building | null) => void;
  /** Destinations chosen before, most recent first. Never more than MAX_RECENTS. */
  recentDestinations: readonly Building[];
  durationHours: number;
  setDurationHours: (hours: number) => void;
  mode: RankingMode;
  setMode: (mode: RankingMode) => void;
  profile: Profile;
  setProfile: (profile: Profile) => void;
  /**
   * The area whose details are open, shared so the two views agree.
   *
   * This lives here rather than in the map screen because the list is the
   * accessible equivalent of the map, not a lesser copy of it. Tapping a row
   * has to do the same thing tapping a polygon does; with selection owned by
   * the map, a row could only ever be a label that announced itself as a
   * button. Sharing it also means switching tabs keeps your place.
   */
  selectedAreaId: string | null;
  setSelectedAreaId: (id: string | null) => void;
}

const TripContext = createContext<TripState | null>(null);

/** The durations people actually park for. A free-text field would be worse. */
export const DURATION_OPTIONS = [1, 2, 3, 4, 8] as const;

/**
 * How many previous destinations to offer.
 *
 * Five, because the list is shown above the keyboard on a phone and a sixth row
 * would push the first one off screen. A student's real set is smaller than
 * that anyway — the same lecture hall, the library, and wherever they work.
 */
const MAX_RECENTS = 5;

/**
 * Versioned, so a later shape change is a cache miss rather than a crash.
 *
 * Reading a stored object written by an older build and trusting its shape is
 * how a persistence layer turns into a startup failure the user cannot clear.
 * Bumping this key retires the old value instead.
 */
const STORAGE_KEY = 'curb.trip.v1';

/** What actually goes to disk. Ids, not objects — the datasets are the source of truth. */
interface StoredTrip {
  destinationId: string | null;
  recentIds: string[];
  durationHours: number;
  mode: RankingMode;
  profile: Profile;
}

/**
 * Mason Hall is the default destination: it is on the Diag, it is where the
 * largest number of undergraduate classes happen, and having *a* destination
 * means the list is useful before the user has typed anything.
 */
const DEFAULT_DESTINATION = buildingById.get('mason-hall') ?? null;

export function TripProvider({ children }: { children: ReactNode }) {
  const [destination, setDestinationState] = useState<Building | null>(DEFAULT_DESTINATION);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [durationHours, setDurationHours] = useState(2);
  const [mode, setMode] = useState<RankingMode>('balanced');
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  /**
   * Nothing is written until the first read has finished.
   *
   * Without this the very first render's defaults are saved over whatever the
   * user had, and the restore is destroyed by the thing that was supposed to
   * perform it — every launch would look like it worked and every relaunch
   * would be back to Mason Hall.
   */
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const stored = JSON.parse(raw) as Partial<StoredTrip>;
        // Each field is restored only if it still resolves against today's
        // data. A building that was renamed out of the dataset must not leave
        // the app pointing at an id nothing can look up.
        const restored = stored.destinationId
          ? buildingById.get(stored.destinationId)
          : undefined;
        if (restored) setDestinationState(restored);
        if (Array.isArray(stored.recentIds)) {
          setRecentIds(stored.recentIds.filter((id) => buildingById.has(id)).slice(0, MAX_RECENTS));
        }
        if (
          typeof stored.durationHours === 'number' &&
          (DURATION_OPTIONS as readonly number[]).includes(stored.durationHours)
        ) {
          setDurationHours(stored.durationHours);
        }
        if (stored.mode === 'cheapest' || stored.mode === 'closest' || stored.mode === 'balanced') {
          setMode(stored.mode);
        }
        if (stored.profile?.classYear && stored.profile?.permit) setProfile(stored.profile);
      })
      .catch(() => {
        // Corrupt or unavailable storage costs the user their recents, nothing
        // more. Defaults are already in state.
      })
      .finally(() => {
        if (!cancelled) hydrated.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const payload: StoredTrip = {
      destinationId: destination?.id ?? null,
      recentIds,
      durationHours,
      mode,
      profile,
    };
    // Fire and forget. A failed write must never block a tap, and the next
    // change tries again anyway.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
  }, [destination, recentIds, durationHours, mode, profile]);

  /**
   * Choosing a destination is also what records it as recent.
   *
   * Wrapping the setter rather than exposing a separate `addRecent` means the
   * two cannot disagree: there is no way to change the destination without the
   * history knowing, and no way to write history for a place you never went.
   */
  const setDestination = useCallback((building: Building | null) => {
    setDestinationState(building);
    if (!building) return;
    setRecentIds((previous) =>
      [building.id, ...previous.filter((id) => id !== building.id)].slice(0, MAX_RECENTS)
    );
  }, []);

  /** Resolved late, so a recent id always renders today's name for that building. */
  const recentDestinations = useMemo(
    () =>
      recentIds
        .map((id) => buildingById.get(id))
        .filter((building): building is Building => building !== undefined),
    [recentIds]
  );

  const value = useMemo(
    () => ({
      destination,
      setDestination,
      recentDestinations,
      durationHours,
      setDurationHours,
      mode,
      setMode,
      profile,
      setProfile,
      selectedAreaId,
      setSelectedAreaId,
    }),
    [destination, setDestination, recentDestinations, durationHours, mode, profile, selectedAreaId]
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripState {
  const context = useContext(TripContext);
  if (!context) throw new Error('useTrip must be used inside a TripProvider');
  return context;
}
