import { defineConfig } from 'vitest/config';

/**
 * Vitest covers `src/engine/` only — the pure rules engine, which imports nothing
 * from React, React Native, Expo, or any map library. That purity is what lets this
 * config stay empty: no jsdom, no transform pipeline, no module mocking.
 *
 * Component tests run separately under jest-expo, which understands React Native's
 * platform-suffix resolution. Keeping the two runners apart is deliberate — the
 * engine tests must stay fast enough to run on every save.
 */
export default defineConfig({
  test: {
    include: ['src/engine/**/*.test.ts', 'src/geo/**/*.test.ts'],
    environment: 'node',

    // TEMPORARY, remove in phase 1 when the first engine tests land.
    // Phase 0 commits data and automation only, and vitest exits 1 on an empty
    // run, which would keep CI red for the whole phase. Leaving this on past
    // phase 1 would be a real footgun: a typo'd `include` glob would then pass
    // silently forever instead of failing loudly.
    passWithNoTests: true,
  },
});
