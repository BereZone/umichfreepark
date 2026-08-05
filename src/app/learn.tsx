/**
 * The Learn screen.
 *
 * This is what gets screenshotted and sent to a friend, so it has to survive
 * being read out of context: no "see above", no reliance on the map being
 * open, every number stated with its source.
 *
 * It is also where the app is honest about what it does not know. The "data as
 * of" date at the bottom is the user's only signal about how much to trust any
 * of this, and the unresolved items are listed rather than quietly omitted.
 */

import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AREAS,
  HOME_GAMES_2026,
  holidaysFor,
  permitIsPlausible,
  type ClassYear,
  type HeldPermit,
} from '../engine';
import { Callout, CalloutText } from '../components/Callout';
import { Chip } from '../components/Chip';
import { useTrip } from '../state/trip';
import { WIDE_LAYOUT_MIN_WIDTH, space, tabularNumbers, type } from '../theme';
import { colorsFor, type ColorScheme } from '../theme/colors';

/** The freshest verification date across everything we ship. */
const dataAsOf = AREAS.map((a) => a.provenance.lastVerified).sort().at(-1) ?? 'unknown';

export default function LearnScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const insets = useSafeAreaInsets();

  const cityHolidays = holidaysFor('city-meter', 2026) ?? [];
  const umichHolidays = holidaysFor('umich', 2026) ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.base, paddingBottom: insets.bottom + space.section },
      ]}
    >
      <Text style={[type.title, { color: colors.text }]}>How parking works here</Text>

      <ProfilePicker colors={colors} />

      <Section title="What a ticket costs" colors={colors}>
        <Text style={[type.body, { color: colors.text }]}>
          The escalation is the argument against guessing:
        </Text>
        <Bullet colors={colors}>$15 if you pay by the end of the next business day</Bullet>
        <Bullet colors={colors}>$25 within 14 days</Bullet>
        <Bullet colors={colors}>$60 after 14 days</Bullet>
        <Bullet colors={colors}>$70 after 30 days, plus $3.50 to pay online or by phone</Bullet>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          A whole day in a structure costs less than the cheapest ticket.
        </Text>
      </Section>

      <Section title="Three sets of rules, not one" colors={colors}>
        <Text style={[type.body, { color: colors.text }]}>
          This is the part that catches people out. The city and the university
          run separate systems, and the city runs two of its own.
        </Text>
        <Bullet colors={colors}>
          <Bold colors={colors}>City meters</Bold> — $2.60/hr, enforced Mon–Sat 8am–6pm.
          Free evenings, all day Sunday, and on {cityHolidays.length} city
          holidays. The metered surface lots follow the same clock, so they are
          free in the evening too — unlike the gated structures.
        </Bullet>
        <Bullet colors={colors}>
          <Bold colors={colors}>City structures</Bold> — $1.80/hr, free from{' '}
          <Bold colors={colors}>Sunday 4am to Monday 4am</Bold>. Not midnight to
          midnight: at 2am Sunday you are still paying.
        </Bullet>
        <Bullet colors={colors}>
          <Bold colors={colors}>U-M lots</Bold> — permit only during posted
          enforcement hours, and open to anyone outside them. The hours differ
          lot by lot and are not predictable from the permit color.
        </Bullet>
      </Section>

      <Section title="Permits you can actually get" colors={colors}>
        <Text style={[type.body, { color: colors.text }]}>
          U-M does not sell commuter permits to first-years or sophomores. Only
          juniors, seniors and grad students can buy one, and juniors and
          seniors are limited to Orange.
        </Text>
        <Text style={[type.body, { color: colors.text }]}>
          If you are in your first two years, your realistic options are city
          parking, a U-M lot outside its enforcement hours, or the bus.
        </Text>
      </Section>

      <Section title="Buses are free" colors={colors}>
        <Bullet colors={colors}>
          <Bold colors={colors}>U-M Blue Buses</Bold> — free and open to everyone.
          No ID, no fare.
        </Bullet>
        <Bullet colors={colors}>
          <Bold colors={colors}>TheRide</Bold> — free for active students, faculty
          and staff who swipe a valid Mcard. Not free to the general public.
        </Bullet>
        <Bullet colors={colors}>
          Park & Ride lots are free with no permit, and a bus runs from them to
          campus.
        </Bullet>
      </Section>

      <Section title="Holidays differ by authority" colors={colors}>
        <Text style={[type.body, { color: colors.text }]}>
          The city observes {cityHolidays.length} dates. U-M observes far fewer —
          notably <Bold colors={colors}>not</Bold> MLK Day or Presidents Day. So
          on MLK Day city meters are free while U-M is still enforcing.
        </Text>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          U-M also closes from Christmas through New Year’s Day.{' '}
          {umichHolidays.length} dates in 2026.
        </Text>
      </Section>

      <Section title="Home game Saturdays" colors={colors}>
        <Text style={[type.body, { color: colors.text }]}>
          On the {HOME_GAMES_2026.length} confirmed 2026 home games, lots near
          the stadium are given over to event parking. Anything on Ross Athletic
          campus must be out by 10pm the Friday before, or it is towed.
        </Text>
      </Section>

      <Callout tone="caution" title="What we don’t know" colors={colors}>
        <Bullet colors={colors}>
          Whether city structures are free on holidays. The DDA says they follow
          PCI’s list, and PCI does not publish one. We assume they are paid.
        </Bullet>
        <Bullet colors={colors}>
          Exactly which downtown blocks have meters. Nobody publishes that — not
          the city, not the DDA, not the meter operator. We show the district
          they are in and leave the block to the sign.
        </Bullet>
        <Bullet colors={colors}>
          Enforcement hours for a few U-M service lots, which U-M lists as “NA”.
          We assume a permit is needed.
        </Bullet>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          Where we are unsure, the app says so rather than guessing. The sign at
          the entrance always wins.
        </Text>
      </Callout>

      <Text style={[type.caption, tabularNumbers, styles.asOf, { color: colors.textMuted }]}>
        Data as of {dataAsOf}. Rates last raised 2026-07-01. Rules are re-checked
        each August, before the term starts.
      </Text>
    </ScrollView>
  );
}

const CLASS_YEARS: { key: ClassYear; label: string }[] = [
  { key: 'first-year', label: 'First-year' },
  { key: 'sophomore', label: 'Sophomore' },
  { key: 'junior', label: 'Junior' },
  { key: 'senior', label: 'Senior' },
  { key: 'graduate', label: 'Grad' },
];

const PERMITS: { key: HeldPermit; label: string }[] = [
  { key: 'none', label: 'No permit' },
  { key: 'orange', label: 'Orange' },
  { key: 'yellow-after-hours', label: 'Yellow' },
  { key: 'after-hours', label: 'After Hours' },
  { key: 'blue', label: 'Blue' },
];

/**
 * Who the app should assume you are.
 *
 * This is the first thing on the Learn screen because it silently rewrites
 * every other screen. The default is a first-year with no permit — the most
 * restrictive case, chosen so an unconfigured app never tells someone they can
 * park where they cannot — and a senior with a Blue permit who never finds this
 * control sees half of campus greyed out for no reason they can see.
 *
 * The permit row disappears for first-years and sophomores rather than being
 * The permit row is always visible, including for the first-years and
 * sophomores who cannot buy one. Hiding it was the first attempt and it was
 * wrong: the app ships defaulted to a first-year, so the setting simply did not
 * exist on the screen it lives on, and there was no way to discover that
 * choosing a later year would reveal it. The options are shown and disabled
 * instead, which makes the setting findable and states the rule where someone
 * is looking for it.
 */
function ProfilePicker({ colors }: { colors: ColorScheme }) {
  const { profile, setProfile } = useTrip();
  const canHoldPermit = permitIsPlausible({ ...profile, permit: 'blue' });

  return (
    <View style={styles.section}>
      <Text style={[type.heading, { color: colors.text }]}>Your situation</Text>
      <Text style={[type.body, { color: colors.textMuted }]}>
        Everything else in UMichFreePark is answered for this. Change it and the map and
        the list change with it.
      </Text>

      <Text style={[type.label, styles.pickerLabel, { color: colors.textMuted }]}>YEAR</Text>
      <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel="Your year">
        {CLASS_YEARS.map((year) => (
          <Chip
            key={year.key}
            label={year.label}
            selected={profile.classYear === year.key}
            colors={colors}
            onPress={() =>
              setProfile({
                classYear: year.key,
                // Moving back to a year that cannot hold a permit drops the
                // one you had, rather than leaving state the engine would
                // reject on every call.
                permit: permitIsPlausible({ classYear: year.key, permit: profile.permit })
                  ? profile.permit
                  : 'none',
              })
            }
          />
        ))}
      </View>

      <Text style={[type.label, styles.pickerLabel, { color: colors.textMuted }]}>PERMIT</Text>
      <View
        style={styles.chipRow}
        accessibilityRole="radiogroup"
        accessibilityLabel="Permit you hold"
      >
        {PERMITS.map((permit) => {
          // Whether this profile could legally hold it. The engine owns the
          // rule; this only reflects it.
          const holdable =
            permit.key === 'none' ||
            permitIsPlausible({ classYear: profile.classYear, permit: permit.key });
          return (
            <Chip
              key={permit.key}
              label={permit.label}
              selected={profile.permit === permit.key}
              disabled={!holdable}
              colors={colors}
              accessibilityLabel={
                holdable
                  ? permit.label
                  : `${permit.label} — U-M does not sell this to first-years or sophomores`
              }
              onPress={() => setProfile({ ...profile, permit: permit.key })}
            />
          );
        })}
      </View>

      {!canHoldPermit ? (
        <Callout tone="caution" colors={colors}>
          <CalloutText colors={colors}>
            U-M does not sell commuter permits to first-years or sophomores, so the options above
            are greyed out. City parking and U-M lots outside their enforcement hours are still
            open to you.
          </CalloutText>
        </Callout>
      ) : null}
    </View>
  );
}

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: ReturnType<typeof colorsFor>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section} accessibilityRole="summary">
      <Text style={[type.heading, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({
  colors,
  children,
}: {
  colors: ReturnType<typeof colorsFor>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.bullet}>
      <Text style={[type.body, { color: colors.textMuted }]}>•</Text>
      <Text style={[type.body, styles.bulletText, { color: colors.text }]}>{children}</Text>
    </View>
  );
}

function Bold({
  colors,
  children,
}: {
  colors: ReturnType<typeof colorsFor>;
  children: React.ReactNode;
}) {
  return <Text style={[type.bodyStrong, { color: colors.text }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  // Capped and centred so the prose keeps a readable measure on a wide browser
  // window. This is the screen people screenshot; a 1440pt line of body copy is
  // the one thing that would make it look unconsidered.
  content: {
    paddingHorizontal: space.comfortable,
    gap: space.roomy,
    width: '100%',
    maxWidth: WIDE_LAYOUT_MIN_WIDTH,
    alignSelf: 'center',
  },
  section: { gap: space.snug },
  bullet: { flexDirection: 'row', gap: space.snug },
  bulletText: { flex: 1 },
  pickerLabel: { paddingTop: space.snug },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.snug },
  asOf: { paddingTop: space.base },
});
