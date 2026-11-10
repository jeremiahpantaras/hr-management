/**
 * Where to send a user after sign-in. `from` comes from router state set by `RequireAuth`
 * (an in-app location), but it is still validated: only same-origin absolute paths, never
 * protocol-relative (`//evil.test`), and never an auth screen (which would loop).
 */
export function postLoginTarget(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) return '/';
  const { from } = state;
  if (typeof from !== 'object' || from === null || !('pathname' in from)) return '/';

  const pathname = typeof from.pathname === 'string' ? from.pathname : '';
  const search = 'search' in from && typeof from.search === 'string' ? from.search : '';
  const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : '';

  const safe =
    pathname.startsWith('/') &&
    !pathname.startsWith('//') &&
    !pathname.includes('\\') &&
    !['/login', '/forgot-password', '/access-denied'].includes(pathname);

  return safe ? `${pathname}${search}${hash}` : '/';
}
