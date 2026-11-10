#!/usr/bin/env node
/**
 * Verifies that the development configuration resolves to the emulator-only DEMO project, and
 * that no local file can silently override it. Prints names and PASS/FAIL only — never values
 * other than the demo ones.
 *
 *   npm run verify:env
 *
 * Vite precedence in dev (highest first): shell variables, .env.development.local, .env.development,
 * .env.local, .env. NOTE: .env.development beats .env.local, so a real config belongs in
 * .env.development.local. This fails if a file that could override the demo file defines a
 * VITE_FIREBASE_* / emulator variable.
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadEnv } from 'vite';

const DEMO = {
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-hr-leave.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-hr-leave',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:demo',
  VITE_USE_FIREBASE_EMULATORS: 'true',
};
const OVERRIDING_FILES = ['.env', '.env.local', '.env.development.local'];

let failures = 0;
const report = (ok, message) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
};

const effective = loadEnv('development', process.cwd(), 'VITE_');
for (const [key, demoValue] of Object.entries(DEMO)) {
  report(
    effective[key] === demoValue,
    `${key} resolves to the demo value for \`vite\` (development mode)`,
  );
}

for (const file of OVERRIDING_FILES) {
  if (!existsSync(file)) {
    report(true, `${file} does not exist`);
    continue;
  }
  const defined = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => /^(VITE_[A-Z_]+)=/.exec(line)?.[1])
    .filter(
      (name) =>
        name && (name.startsWith('VITE_FIREBASE_') || name === 'VITE_USE_FIREBASE_EMULATORS'),
    );
  report(
    defined.length === 0,
    `${file} exists and ${defined.length === 0 ? 'defines no Firebase variables' : `OVERRIDES: ${defined.join(', ')}`}`,
  );
}

const shellOverrides = Object.keys(process.env).filter(
  (k) => k.startsWith('VITE_FIREBASE_') || k === 'VITE_USE_FIREBASE_EMULATORS',
);
report(
  shellOverrides.length === 0,
  shellOverrides.length === 0
    ? 'no VITE_FIREBASE_* variables set in this shell'
    : `shell sets: ${shellOverrides.join(', ')}`,
);

console.log(
  failures === 0
    ? '\nDevelopment is emulator-only (demo project).'
    : `\n${failures} problem(s): development might NOT be emulator-only.`,
);
process.exit(failures === 0 ? 0 : 1);
