import { describe, expect, it } from 'vitest';

import { postLoginTarget } from '@/app/guards/redirect';

const from = (pathname: string, search = '', hash = '') => ({ from: { pathname, search, hash } });

describe('postLoginTarget — where to go after sign-in', () => {
  it('returns the remembered page, with its query and hash', () => {
    expect(postLoginTarget(from('/employees', '?q=juan&page=2', '#top'))).toBe(
      '/employees?q=juan&page=2#top',
    );
    expect(postLoginTarget(from('/reports'))).toBe('/reports');
  });

  it.each([
    undefined,
    null,
    {},
    'x',
    42,
    { from: null },
    { from: 'x' },
    { from: {} },
    { from: { pathname: 5 } },
  ])('falls back to the dashboard for missing/invalid state %j', (state) => {
    expect(postLoginTarget(state)).toBe('/');
  });

  it.each(['//evil.test', '//evil.test/path', 'https://evil.test', 'evil', '/\\evil.test'])(
    'refuses the unsafe target %j (open-redirect guard)',
    (pathname) => {
      expect(postLoginTarget(from(pathname))).toBe('/');
    },
  );

  it.each(['/login', '/forgot-password', '/access-denied'])(
    'never loops back to %s',
    (pathname) => {
      expect(postLoginTarget(from(pathname))).toBe('/');
    },
  );
});
