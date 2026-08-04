# Accessibility

Accessibility is a build requirement here, not a pass at the end. The list view
is the accessible equivalent of the map — every area selectable by tapping a
polygon is reachable, selectable, and readable there — and the free/paid
distinction never rides on colour.

This document is the audit: what is enforced automatically, what was checked by
hand, and what is still open.

## Enforced by tests

Run with `npm test`. These fail in CI rather than expiring quietly.

| Property | Where |
|---|---|
| 4.5:1 contrast on all 19 text/background pairs the screens actually render, both themes | `src/theme/accessibility.test.ts` |
| 3:1 contrast on hues that carry meaning without text — permit tiers, city neutral, focus ring, `borderStrong` | same |
| 44pt minimum touch target | same |
| Every animation has an instant duration to collapse to | same |
| Free vs paid differs in border style, border width, dash pattern, and label text — not only in hue | `src/components/Map/encoding.test.ts` |
| Free vs paid stays distinguishable with hue removed entirely | same |
| Every drawable area has a label point that falls inside its own polygon | `src/components/Map/geometry.test.ts` |

The contrast test lists pairs traced from the components, not a plausible
sample. `textMuted` passing on `background` says nothing about `textMuted` on
`surfaceRaised`, which is where the detail panel puts it — in dark mode those
differ by a full point of ratio, so both are listed.

### One thing deliberately not tested

`border` fails 3:1 against the background in both themes, and that is correct.
It is a hairline between list rows and the outline of a card whose contents are
already visible — it identifies no control and no state, so WCAG 1.4.11 does not
apply. Darkening it would make every screen heavier for nobody's benefit.
`borderStrong` exists for boundaries that do carry meaning and *is* asserted.

There is a test that pins this, so the next person to run a contrast checker
finds the reasoning instead of "fixing" it.

Similarly, no test requires `free` and `paid` to be far apart in luminance. In
dark mode they sit 0.04 apart. That is fine, because the app never asks colour
to carry that bit: the map uses border style, and every surface showing the
state also writes the word *Free* or *Paid*.

## Checked by hand

- **Every interactive element has a role and a label.** Chips are `radio` inside
  a `radiogroup` with `accessibilityState.selected`. The search field is
  `search` with a hint naming the nickname behaviour. The detail panel's close
  button is a labelled `button` with a 44pt target and `hitSlop`.
- **List rows are real buttons.** They were `Pressable` with an
  `accessibilityRole="button"` and no `onPress` — announced as actionable,
  inert when activated. Selection now lives in shared trip state, so a row tap
  does exactly what a polygon tap does, and carries `accessibilityState.selected`
  plus a hint that says which way the toggle goes.
- **Tab glyphs are silent.** `◈`, `≡` and `?` sit next to their own titles;
  they are marked `accessibilityElementsHidden` so VoiceOver says "Map" rather
  than "black diamond, Map".
- **The live region is on the status, not the countdown.** The free-count and
  the Free/Paid word announce politely. The ticking countdown deliberately does
  not — a polite region updating every second is unusable, and the number is
  readable on demand.
- **Safe areas come from `react-native-safe-area-context`,** never hardcoded
  notch padding, on all three screens.
- **Reduce-motion** is read via `AccessibilityInfo` and passed into both
  renderers. It must produce an instant state change, not a faster one.
- **Unhappy paths say what to do next.** Tiles failing points at the list view
  and notes it works offline. No search match suggests nicknames. No destination
  explains what to do.

## Permission strings

CURB requests **location When In Use and nothing else**. It never asks for
background location and never reads motion.

That takes active effort, because `expo-location` adds three usage descriptions
to `Info.plist` by default and two of them arrive with Expo's placeholder text,
`"Allow $(PRODUCT_NAME) to access your location"` — the vague purpose string
App Review rejects by name, attached to a permission the app does not use.

The two location keys are suppressed through the plugin's own options in
`app.json`. `NSMotionUsageDescription` has no such option and is deleted by
`plugins/with-lean-ios-permissions.js`, which also **fails the build** if either
Always key reappears or if the When In Use string is missing or still the
placeholder. A dependency reintroducing them is silent otherwise: nothing
breaks, the app simply starts declaring permissions nobody chose.

Verified against the generated `ios/CURB/Info.plist`, not assumed from config.

## Verified on the Simulator

iOS 26.0, iPhone 17 Pro, 2026-08-04. The app builds natively, launches, and
renders: Apple Maps underneath, the free-count reading 64 of 101, free areas
drawn with a heavy solid green outline and a `FREE` pill, paid ones with a
dashed outline, and the downtown meter district as a large dashed boundary.
Safe areas are respected at the notch and the home indicator, and the tab bar
shows Map / List / Learn.

That is the encoding contract holding on the platform that does not run any of
the unit tests — worth confirming by eye at least once, because `encoding.ts`
being correct and `Map.native.tsx` translating it correctly are two different
claims.

## Still open — needs a physical device

These cannot be validated in the Simulator or by any test, and are the
outstanding part of the phase 6 and phase 8 work:

- **VoiceOver rotor order** on the map screen, particularly whether the detail
  panel takes focus when it opens and returns it sensibly on close.
- **Whether the map itself is usable under VoiceOver at all**, or whether the
  correct behaviour is to direct screen-reader users to the list. The list is
  built to be sufficient either way; what is unknown is which one feels right.
- **One-handed reach.** Primary controls belong in the lower half. A full-bleed
  map pushes chrome to the edges, and the Simulator cannot tell you that the
  close button is a stretch.
- **Haptics** on selection — `expo-haptics` is wired and fails silently where
  unavailable, but the intensity has never been felt.
- **Dynamic Type at accessibility sizes.** Type tokens scale, but the chip rows
  and the status bar have not been seen at the largest settings, where they are
  most likely to wrap badly.
- **Keyboard navigation on web** — tab order through search, chips, and rows,
  and whether the focus ring is visible against every surface.

## Reporting a problem

Accessibility bugs are data bugs' equal here. Open an issue; a description of
what your screen reader said, or a photo of what you saw, is enough.
