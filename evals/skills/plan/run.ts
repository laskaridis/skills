#!/usr/bin/env -S node --experimental-strip-types
// Compatibility entry point: all historical options, including --skill, delegate.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../run.ts';

export { checkStructure } from './checks.ts';

export { capture, parseTrace } from '../../lib/execution.ts';

export { compareResults } from '../../lib/reporting.ts';

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main(['plan', ...process.argv.slice(2)]).catch((error) => {
    console.error(error.stack);
    process.exitCode = 2;
  });
}
