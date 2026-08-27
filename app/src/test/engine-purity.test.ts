// @vitest-environment node
/**
 * Tripwire for the engine-purity ESLint rule (CLAUDE.md app rule 4).
 *
 * Lints the same impure snippet twice: once as if it lived in src/engine/
 * (must fail) and once as if it lived in src/components/ (must not trip the
 * purity rule). If someone loosens or misconfigures the rule, this test fails
 * before the impurity ever reaches main.
 */
import { ESLint } from 'eslint';

// Vitest runs with cwd = app/, and ESLint resolves relative filePaths against
// its cwd, so no Node path helpers are needed here.

const IMPURE_SNIPPET = `
import { useState } from 'react';
import { create } from 'zustand';
import { App } from '../App';
export function bad() {
  const el = document.getElementById('root');
  requestAnimationFrame(() => undefined);
  return [useState, create, App, el, window.innerWidth];
}
`;

async function lintAs(filePath: string) {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(IMPURE_SNIPPET, { filePath });
  if (!result) throw new Error('ESLint returned no result');
  return result.messages.map((m) => m.ruleId);
}

describe('engine purity rule', () => {
  it('rejects React, store, component imports and DOM globals inside src/engine/', async () => {
    const rules = await lintAs('src/engine/__purity_fixture__.ts');
    const imports = rules.filter((r) => r === 'no-restricted-imports');
    const globalsHit = rules.filter((r) => r === 'no-restricted-globals');
    expect(imports).toHaveLength(3); // react, zustand, ../App
    expect(globalsHit).toHaveLength(3); // document, requestAnimationFrame, window
  });

  it('does not apply the purity rule outside src/engine/', async () => {
    const rules = await lintAs('src/components/__purity_fixture__.ts');
    expect(rules).not.toContain('no-restricted-imports');
    expect(rules).not.toContain('no-restricted-globals');
  });
});
