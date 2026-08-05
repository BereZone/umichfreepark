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
  explains what to do. "Nothing open to you nearby" is worded differently from
  "pick a destination", because the user's next action differs — one is a thing
  to do, the other is a fact about Ann Arbor — and an app that says "No results"
  to both leaves the second user thinking they broke it.
- **Callouts carry tone as a tinted surface, not an edge stripe.** A 3pt
  coloured `border-left` puts the signal beside one line of a block that wraps
  to five at accessibility sizes. Every callout also leads with a sentence
  stating the same thing in words, so the tone is never the only carrier.
- **Selection is visible, not merely recorded.** Selecting an area from the list
  moves the map to it when it is off screen *or* when the map is zoomed too far
  out to identify it. The second case is easy to miss: at city scale a selected
  lot changed by two points of border on a six-pixel shape, so the row appeared
  to do nothing. The rule is shared by both renderers and tested in
  `src/components/Map/camera.test.ts`.

## Permission strings

MFreePark requests **location When In Use and nothing else**. It never asks for
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

Verified against the generated `ios/MFreePark/Info.plist`, not assumed from config.

The other half of that guarantee is that the app now actually *requests* what it
declares. Until the location control shipped, `NSLocationWhenInUseUsageDescription`
sat in the plist against a permission no code ever asked for — a purpose string
for a feature that did not exist. `src/hooks/use-user-location.ts` holds the
only permission request in the codebase, and it fires from a press on a control
labelled "use my location", never on mount. A map that prompts the moment it
opens is the pattern people deny by reflex, and on iOS that denial is permanent
until they go into Settings.

All three refusal paths say what to do instead rather than failing silently:
denied, no fix available (normal inside a structure — which is exactly where
this app is used), and a fix that lands nowhere near a building MFreePark knows.

## Verified on the Simulator

iOS 26.0, iPhone 17 Pro, 2026-08-05. The app builds natively, launches, and
renders: Apple Maps underneath, the free-count reading 129 of 262, free areas
drawn with a heavy solid green outline and a `FREE` pill, paid ones with a
dashed outline, and the downtown meter district as a large dashed boundary.
Safe areas are respected at the notch and the home indicator, and the tab bar
shows Map / List / Learn.

That is the encoding contract holding on the platform that does not run any of
the unit tests — worth confirming by eye at least once, because `encoding.ts`
being correct and `Map.native.tsx` translating it correctly are two different
claims.

## Dynamic Type — three real bugs, found by looking

Checked at every content size with `xcrun simctl ui <device> content_size …`.
All three passed typecheck, lint and the whole unit suite, and each made the app
unusable at accessibility text sizes. None was findable without running it.

**1. Hardcoded `lineHeight` in the type scale.** Entries read
`{ fontSize: 28, lineHeight: 34 }`. A constant line height cannot know the scale
factor the user chose, so at large settings the line boxes grew out of all
proportion to the glyphs: headings gained enormous gaps, chips became tall boxes
with the label pinned to the top, and the duration row spilled off screen.
Removed — the platform derives line height from the already-scaled font size and
is correct at every setting. `typography.ts` says not to add it back and why.

**2. The list header was outside the scroll container.** Title, destination,
search field and two chip rows sat in a fixed `View` above the `FlatList`. At
large type they filled the viewport and squeezed the list to nothing, so **a
user at an accessibility text size saw zero parking results** — on the view that
is the accessible equivalent of the map. Now passed as `ListHeaderComponent`, so
everything shares one scroll container and large type makes the page longer
rather than making the content unreachable.

Verified after the fix at `medium`, `extra-extra-extra-large` and
`accessibility-extra-extra-extra-large`: seven results visible at the size that
previously showed none, chips correctly sized, and no regression at default.

**3. Map chrome grew until it covered the map.** Found the same way, on the
rebuilt map screen. At `accessibility-extra-extra-extra-large` the price pills
rendered at roughly 30pt and a dozen of them buried central campus, and the
free-count card swelled until the key beside it was a sliver with every label
clipped — the map's legend made unreadable for exactly the users most likely to
need one.

The fix is `maxFontSizeMultiplier={MAX_MAP_TEXT_SCALE}` (1.6) on text pinned
over the map, and nowhere else. This is a deliberate exception to the
no-clamping rule above, and the reasoning is written where the constant lives:

- A pill is anchored to a geographic point and *cannot reflow*. Growth has no
  outlet, so past a certain size the labels destroy the thing they label.
- The bound is generous — a 12pt pill becomes 19pt.
- It applies only to map chrome. Body copy, list rows, the detail panel, the
  trip controls and every screen's prose still scale without limit, and the list
  view carries all 262 areas at unbounded size. That is what makes the list the
  accessible equivalent rather than a convenience.

A second, layout-only fix went with it: the count card and the key sat in a row
that shrank both. It now shrinks in one direction only — the key keeps its
intrinsic width and the count wraps its text inside whatever is left. Wrapping
the row instead was tried first and was worse: the key dropped to a second line
and disappeared behind the sheet, gone rather than merely cramped.

Verified at `accessibility-extra-extra-extra-large`: the count reads
`129 / 262` in full, the key shows both border styles with their labels, no text
is clipped, and the sheet scrolls to reach every control.

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
- **Keyboard navigation on web** — tab order through search, chips, and rows,
  and whether the focus ring is visible against every surface.

## Reporting a problem

Accessibility bugs are data bugs' equal here. Open an issue; a description of
what your screen reader said, or a photo of what you saw, is enough.
