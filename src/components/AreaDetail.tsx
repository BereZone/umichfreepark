/**
 * Everything MFreePark knows about one area, as a panel.
 *
 * Shared by the map's bottom sheet and, in the wide layout, its sidebar. The
 * order is the order of the questions people actually ask, most urgent first:
 * can I stop here right now, for how much longer, what does my stay cost, how
 * far is the walk, and only then the caveats.
 *
 * The countdown is the app's one raised voice. Everything else is quiet so that
 * it can be.
 */

import { StyleSheet, Text, View } from 'react-native';

import {
  costCents,
  eligibilityFor,
  gameDayWarning,
  nextTransitionOf,
  statusOf,
  walkSeconds,
  type ResolvedArea,
} from '../engine';
import { formatCountdown } from '../hooks/use-now';
import { useTrip } from '../state/trip';
import { space, tabularNumbers, type } from '../theme';
import type { ColorScheme } from '../theme/colors';
import { Callout, CalloutText } from './Callout';
import { priceFor, walkLabel } from './format';

export function AreaDetail({
  area,
  now,
  colors,
}: {
  area: ResolvedArea;
  now: Date;
  colors: ColorScheme;
}) {
  const { destination, durationHours, profile } = useTrip();

  const status = statusOf(area, now);
  const eligibility = eligibilityFor(area, profile, status);
  const next = nextTransitionOf(area, now);
  const countdown = next ? formatCountdown((next.at.getTime() - now.getTime()) / 1000) : null;
  const gameDay = gameDayWarning(area, now);

  const price = priceFor(costCents(area.rate, durationHours, !status.paid, now), area.rate.kind);
  const walk = destination ? walkLabel(walkSeconds(destination.id, area.id)) : null;

  return (
    <View style={styles.root}>
      {/*
       * Status and countdown are one block, because they are one fact: "free,
       * and paid in 41 minutes" is the answer, and splitting it across two
       * groups makes the user assemble it themselves.
       */}
      <View style={styles.status}>
        <Text
          style={[
            type.display,
            tabularNumbers,
            { color: status.paid ? colors.paid : colors.free },
          ]}
          accessibilityLiveRegion="polite"
        >
          {status.paid ? 'Paid' : 'Free'}
        </Text>
        {countdown && next ? (
          <Text style={[type.body, { color: colors.textMuted }]}>
            {next.paid ? 'Paid in ' : 'Free in '}
            <Text style={[type.bodyStrong, tabularNumbers, { color: colors.text }]}>
              {countdown}
            </Text>
          </Text>
        ) : (
          /*
           * Two different reasons for "no next change", and they are opposites.
           *
           * `nextTransitionOf` returns null both for a lot that is free at every
           * hour and for one that is enforced at every hour. Both used to print
           * "it's enforced around the clock", so a free park-and-ride displayed
           * the word Free in large green type and then told the reader it was
           * enforced around the clock. That is the exact contradiction this app
           * exists to remove.
           */
          <Text style={[type.body, { color: colors.textMuted }]}>
            {status.paid
              ? 'This one doesn’t change — it’s enforced around the clock.'
              : 'This one doesn’t change — it’s free at every hour.'}
          </Text>
        )}
      </View>

      <Text style={[type.body, { color: colors.text }]}>{status.reason}</Text>

      {/*
       * The two numbers the ranking was actually built on, restated here so the
       * panel answers the same question the list row did. Without them, tapping
       * a row to "see more" showed strictly less.
       */}
      <View style={[styles.facts, { borderColor: colors.border }]}>
        <Fact
          label={`${durationHours}H STAY`}
          value={price}
          colors={colors}
          emphasis={!status.paid ? colors.free : colors.text}
        />
        <Fact
          label={destination ? `TO ${destination.name.toUpperCase()}` : 'WALK'}
          value={walk ?? 'Not routed'}
          colors={colors}
          emphasis={colors.text}
        />
      </View>

      {!eligibility.eligible ? (
        <Callout tone="blocked" title="You can’t park here right now" colors={colors}>
          <CalloutText colors={colors}>{eligibility.reason}</CalloutText>
        </Callout>
      ) : null}

      {!status.certain ? (
        <Callout tone="caution" title="We couldn’t confirm this one" colors={colors}>
          <CalloutText colors={colors}>
            Holiday closures aren’t published for this area. Check the sign before you leave the
            car.
          </CalloutText>
        </Callout>
      ) : null}

      {gameDay ? (
        <Callout tone="caution" title="Home game Saturday" colors={colors}>
          <CalloutText colors={colors}>{gameDay}</CalloutText>
        </Callout>
      ) : null}

      {/*
       * A park-and-ride's walking time is true and, on its own, misleading.
       *
       * These lots are 70+ minutes on foot from central campus, so ranked by
       * cost they can win outright and then present "79 min walk" as the best
       * option available — technically the answer, practically nonsense,
       * because nobody walks it. A bus is the reason the lot exists, and the
       * walking figure has to be read next to that fact rather than instead of
       * it. Sourced the same place the Learn screen's claim is.
       */}
      {area.permitTier === 'Park & Ride' ? (
        <Text style={[type.caption, { color: colors.free }]}>
          A free bus runs from here to campus — you are not meant to walk it.
        </Text>
      ) : null}

      {area.note ? (
        <Text style={[type.caption, { color: colors.textMuted }]}>{area.note}</Text>
      ) : null}

      <Text style={[type.caption, { color: colors.textMuted }]}>
        {area.provenance.confidence === 'verified' ? 'Verified' : 'Community-reported'} · checked{' '}
        {area.provenance.lastVerified}
      </Text>
    </View>
  );
}

function Fact({
  label,
  value,
  colors,
  emphasis,
}: {
  label: string;
  value: string;
  colors: ColorScheme;
  emphasis: string;
}) {
  return (
    <View style={styles.fact}>
      <Text style={[type.label, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[type.heading, tabularNumbers, { color: emphasis }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.base },
  status: { gap: space.hair },
  facts: {
    flexDirection: 'row',
    gap: space.comfortable,
    paddingVertical: space.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fact: { flex: 1, gap: space.hair },
});
