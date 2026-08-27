/**
 * `engine/` — pure, headless domain logic for the app.
 *
 * Nothing in this directory may import React, the DOM, canvas, the store, or
 * any component. That is enforced by ESLint (`no-restricted-imports` and
 * `no-restricted-globals` overrides in eslint.config.js) and tripwired by
 * `src/test/engine-purity.test.ts`, which lints an impure snippet and asserts
 * the rule fires.
 *
 * ## Coordinate conventions (SPEC §3.3 — locked, stated once)
 *
 * - x right, y up. World space, meters.
 * - Heading in radians, counterclockwise from +x.
 * - Angles wrapped to (-π, π]  → see {@link wrapAngle}.
 * - Track arc-length `s` in meters from the start line; speeds in m/s.
 * - The canvas layer owns the y-flip into screen space. Nothing in `engine/`
 *   knows screens exist.
 */
export { TAU, wrapAngle } from './angle';
