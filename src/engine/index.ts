/**
 * The engine's public API.
 *
 * Everything exported here is pure and synchronous, takes an explicit `at:
 * Date`, and computes in `America/Detroit`. Nothing here imports React, React
 * Native, Expo, or any map library — that constraint is what makes the iOS
 * port nearly free and lets all of this be tested without rendering anything.
 *
 * UI code should import from here rather than reaching into individual
 * modules, so the surface stays something we can change behind.
 */

export type {
  Authority,
  AreaKind,
  Confidence,
  ParkingArea,
  Provenance,
  Rate,
} from './types';

export {
  ZONE,
  calendarDate,
  dayOfWeek,
  holidayAt,
  holidaysFor,
  isHoliday,
  minutesIntoDay,
  type CalendarDate,
  type Holiday,
  type HolidayLookup,
} from './calendar';

export {
  isEnforced,
  parseEnforcementHours,
  type EnforcementSchedule,
} from './enforcement';

export {
  CITY_METER_SCHEDULE,
  CITY_STRUCTURE_SCHEDULE,
  nextTransition,
  nextTransitionOf,
  statusAt,
  statusOf,
  type ParkingStatus,
  type SchedulableArea,
} from './rules';

export { AREAS, MAPPABLE_AREAS, areaById, type ResolvedArea } from './data/areas';

export {
  FALLBACK_COUNT,
  KNOWN_BUILDING_IDS,
  ROUTED_AREA_IDS,
  walkMinutes,
  walkSeconds,
} from './walk';

export {
  DEFAULT_PROFILE,
  costCents,
  eligibilityFor,
  permitIsPlausible,
  rank,
  tradeOff,
  type ClassYear,
  type Eligibility,
  type HeldPermit,
  type Profile,
  type RankedOption,
  type RankingMode,
} from './ranking';

export {
  BUILDINGS,
  buildingById,
  nearestBuilding,
  searchBuildings,
  type Building,
  type BuildingMatch,
} from './search';

export {
  HOME_GAMES_2026,
  gameDayAt,
  gameDayWarning,
  type GameDayLookup,
} from './gamedays';
