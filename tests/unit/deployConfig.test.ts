import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Deployment-readiness guards (Vercel / Firebase Hosting): secrets can never be committed, the SPA
 * rewrite and security headers exist, and both hosts ship the SAME Content-Security-Policy.
 */
const ROOT = process.cwd();
interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}
interface HostingConfig {
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  installCommand?: string;
  rewrites?: { source: string; destination: string }[];
  headers?: HeaderRule[];
  hosting?: { headers: HeaderRule[] };
}
const json = (file: string) => JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as HostingConfig;
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const isIgnored = (path: string): boolean => {
  try {
    git('check-ignore', '-q', path);
    return true;
  } catch {
    return false;
  }
};

describe('.gitignore keeps credentials out of Git', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.production',
    '.env.development.local',
    '.env.staging',
    '.env.test',
    '.vercel',
    '.netlify',
    'service-account.json',
    'serviceAccountKey.json',
    'my-project-firebase-adminsdk-abc12.json',
    'google-credentials.json',
    'private.pem',
    'signing.key',
    '.npmrc',
    'firebase-debug.log',
  ])('%s is ignored', (file) => {
    expect(isIgnored(file)).toBe(true);
  });

  it.each(['.env.example', '.env.development', 'vercel.json', 'firebase.json', 'firestore.rules'])(
    '%s is NOT ignored (it is meant to be committed)',
    (file) => {
      expect(isIgnored(file)).toBe(false);
    },
  );

  it('the committed demo env file holds demo values only', () => {
    const env = readFileSync(join(ROOT, '.env.development'), 'utf8');
    expect(env).toContain('VITE_FIREBASE_API_KEY=demo-api-key');
    expect(env).toContain('VITE_FIREBASE_PROJECT_ID=demo-hr-leave');
    expect(env).toContain('VITE_USE_FIREBASE_EMULATORS=true');
  });

  it('no file Git would commit contains a Firebase web API key or a real *.firebaseapp.com domain', () => {
    const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
      .split('\0')
      .filter((file) => file !== '' && existsSync(join(ROOT, file)));
    const apiKey = /AIza[0-9A-Za-z_-]{30,}/;
    const domain = /([a-z0-9-]+)\.firebaseapp\.com/g;
    const offenders: string[] = [];
    for (const file of files) {
      if (/\.(png|jpe?g|ico|woff2?|xlsx|tgz)$/i.test(file)) continue;
      const text = readFileSync(join(ROOT, file), 'utf8');
      if (apiKey.test(text)) offenders.push(`${file}: API key`);
      for (const match of text.matchAll(domain)) {
        // demo + documented placeholders are fine; anything else could be a real project
        if (!['demo-hr-leave', 'your-project', 'my-project', 'yourapp'].includes(match[1] ?? '')) {
          offenders.push(`${file}: ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('vercel.json', () => {
  const vercel = json('vercel.json');
  const headerFor = (source: string, key: string): string | undefined =>
    vercel.headers
      ?.find((rule) => rule.source === source)
      ?.headers.find((header) => header.key === key)?.value;

  it('builds the Vite app into dist with a clean install', () => {
    expect(vercel.framework).toBe('vite');
    expect(vercel.buildCommand).toBe('npm run build');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.installCommand).toBe('npm ci');
  });

  it('rewrites every path to index.html so reloading /employees works (SPA)', () => {
    expect(vercel.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });

  it('the HTML is never cached, but hashed assets are cached for a year', () => {
    expect(headerFor('/((?!assets/).*)', 'Cache-Control')).toBe('no-store');
    expect(headerFor('/assets/(.*)', 'Cache-Control')).toContain('immutable');
  });

  it('sends the security headers on every response', () => {
    for (const key of [
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'X-Frame-Options',
      'Permissions-Policy',
      'Strict-Transport-Security',
      'Cross-Origin-Opener-Policy',
    ]) {
      expect(headerFor('/(.*)', key), key).toBeTruthy();
    }
  });

  it('the CSP is strict: no eval, no inline scripts, no framing, and allows what Firebase + Google sign-in need', () => {
    const csp = headerFor('/(.*)', 'Content-Security-Policy') ?? '';
    const directive = (name: string) =>
      csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith(`${name} `)) ?? '';
    expect(directive('script-src')).toBe("script-src 'self' https://apis.google.com");
    expect(csp).not.toContain('unsafe-eval');
    expect(directive('script-src')).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(directive('connect-src')).toContain('https://*.googleapis.com'); // Auth + Firestore REST
    expect(directive('connect-src')).toContain('https://*.firebaseio.com');
    expect(directive('frame-src')).toContain('https://*.firebaseapp.com'); // sign-in handler
  });

  it("the pop-up sign-in needs a COOP that allows pop-ups ('same-origin' would break Google sign-in)", () => {
    expect(headerFor('/(.*)', 'Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
  });

  it('Firebase Hosting ships exactly the same security headers (one policy, two hosts)', () => {
    const firebaseHeaders = json('firebase.json').hosting?.headers[0]?.headers;
    const vercelHeaders = vercel.headers?.[0]?.headers;
    expect(firebaseHeaders).toBeDefined();
    expect(firebaseHeaders).toEqual(vercelHeaders);
  });
});
