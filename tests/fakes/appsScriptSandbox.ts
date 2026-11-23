import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/**
 * The apps-script files are plain Apps Script (global declarations, no module syntax)
 * that share one global scope, so they are evaluated together in a sandbox with a
 * stand-in for Utilities. Only the pure files are loaded; Sync.js calls live services.
 */
export function loadAppsScript(): Record<string, any> {
  const sandbox: Record<string, any> = {
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      // Apps Script returns signed bytes; mirror that so bytesToHex is exercised.
      computeDigest: (_algorithm: string, value: string) =>
        [...createHash('sha256').update(value, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
    },
  };
  vm.createContext(sandbox);
  for (const file of ['Labels.js', 'Parse.js', 'CitySource.js']) {
    vm.runInContext(readFileSync(new URL(`../../apps-script/${file}`, import.meta.url), 'utf8'), sandbox);
  }
  // `var` declarations are reachable as properties; this exposes the `const`-free rest.
  sandbox.evaluate = (expression: string) => vm.runInContext(expression, sandbox);
  return sandbox;
}
