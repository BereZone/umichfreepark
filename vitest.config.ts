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

    /**
     * The suite runs on a clock that is NOT Ann Arbor's, deliberately.
     *
     * Every engine function is supposed to compute in `America/Detroit`
     * regardless of the device zone — a student home in California over break
     * must still get Ann Arbor's answer. Running the tests in Detroit's own
     * zone would make that property invisible: a function that accidentally
     * read the device zone would pass every test and then hand a wrong "FREE"
     * to anyone outside Michigan.
     *
     * Los Angeles is three hours behind, which puts a zone bug on the wrong
     * side of midnight rather than merely an hour off, so it fails loudly.
     */
    env: { TZ: 'America/Los_Angeles' },
  },
});
