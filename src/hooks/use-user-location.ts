/**
 * Where the user is, but only if they ask.
 *
 * NOTHING HERE RUNS ON MOUNT. The permission prompt fires from a tap on a
 * control that says what it is for, never as a side effect of opening the app.
 * A map that asks for your location the instant it appears is the pattern
 * people deny by reflex, and a denial is permanent until they go into Settings
 * — so the one chance to ask well is worth spending a tap on.
 *
 * WHEN IN USE ONLY. `requestForegroundPermissionsAsync` is the only request
 * made anywhere in the app, and `plugins/with-lean-ios-permissions.js` fails
 * the build if an Always key ever reappears in Info.plist. This hook is the
 * other half of that guarantee: the permission the app declares is the
 * permission the app actually asks for.
 *
 * The result is a coordinate, and the caller decides what it means. Turning a
 * fix into a destination is `nearestBuilding`'s job, in the engine, where it is
 * testable without a device.
 */

import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

export type LocationStatus =
  /** Never asked. The control is offered and nothing has happened. */
  | 'idle'
  /** The prompt is up, or a fix is being taken. */
  | 'locating'
  | 'granted'
  /** Refused, or Location Services are off device-wide. */
  | 'denied'
  /** Allowed, but no fix came back — indoors, or a cold GPS. */
  | 'unavailable';

export interface UserLocation {
  status: LocationStatus;
  coords: { lat: number; lon: number } | null;
  request: () => Promise<{ lat: number; lon: number } | null>;
}

export function useUserLocation(): UserLocation {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  const request = useCallback(async () => {
    setStatus('locating');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setStatus('denied');
        return null;
      }

      /*
       * Balanced accuracy, not Highest.
       *
       * The fix is used to pick which building you are standing next to, and
       * the buildings are tens of metres apart. Highest costs a longer wait and
       * more battery to resolve a difference that changes no answer — and this
       * is asked for in a car with the engine running.
       */
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point = { lat: fix.coords.latitude, lon: fix.coords.longitude };
      setCoords(point);
      setStatus('granted');
      return point;
    } catch {
      // Permission held but no fix: inside a structure, which is exactly where
      // this app gets used. Not an error to report as a failure of the app.
      setStatus('unavailable');
      return null;
    }
  }, []);

  return { status, coords, request };
}
