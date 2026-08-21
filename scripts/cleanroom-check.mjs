// Fails the build if any tracked file carries an identifier that would tie this
// repository to a client codebase. Runs against the git index, so it gates what
// is about to be committed rather than what happens to be on disk.
import { execFileSync } from 'node:child_process';

const FORBIDDEN = [
  'Himchan',
  'jdhimchan',
  'HCHGW',
  'SYUSW',
  'SYUGW',
  'SYU',
  'Suwings',
  'Nexmotion',
  'SDA_LANG',
];

const SELF = 'scripts/cleanroom-check.mjs';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

let bad = 0;
for (const file of tracked) {
  if (file === SELF) continue;

  let body;
  try {
    body = execFileSync('git', ['show', `:${file}`], {
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    });
  } catch {
    continue; // unmerged or unreadable blob -- nothing to scan
  }

  const haystack = body.toLowerCase();
  for (const term of FORBIDDEN) {
    if (haystack.includes(term.toLowerCase())) {
      console.error(`x ${file}: forbidden term "${term}"`);
      bad++;
    }
  }
}

if (bad) {
  console.error(`\n${bad} clean-room violation(s).`);
  process.exit(1);
}
console.log('clean-room check passed');
