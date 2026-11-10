/** One breadcrumb. Omit `to` on the last crumb: it is the current page. */
export interface Crumb {
  readonly label: string;
  readonly to?: string;
}

/**
 * Metadata a route declares through React Router's `handle`; the shell reads it for the
 * header title / breadcrumbs and the document title.
 */
export interface RouteHandle {
  readonly title: string;
  readonly crumbs?: readonly Crumb[];
}

export function isRouteHandle(value: unknown): value is RouteHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'title' in value &&
    typeof value.title === 'string'
  );
}
