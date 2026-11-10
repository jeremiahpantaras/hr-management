import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useYearParam } from '@/hooks/useYearParam';

describe('useSubmitGuard (D-05: no duplicate submissions)', () => {
  it('runs the action once when called twice in the same tick, and reports pending', async () => {
    let finish: (value: string) => void = () => undefined;
    const action = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useSubmitGuard(action));

    let first: Promise<string | undefined> = Promise.resolve(undefined);
    let second: Promise<string | undefined> = Promise.resolve('unset');
    act(() => {
      first = result.current.run();
      second = result.current.run(); // double-click
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    await expect(second).resolves.toBeUndefined();

    await act(async () => {
      finish('saved');
      await first;
    });
    await expect(first).resolves.toBe('saved');
    expect(result.current.pending).toBe(false);
  });

  it('allows a new submission after the previous one settles, even if it failed', async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useSubmitGuard(action));

    await act(async () => {
      await expect(result.current.run()).rejects.toThrow('boom');
    });
    expect(result.current.pending).toBe(false);

    await act(async () => {
      await expect(result.current.run()).resolves.toBe('ok');
    });
    expect(action).toHaveBeenCalledTimes(2);
  });
});

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('only updates after the value has been stable for the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'ab' });
    rerender({ value: 'abc' });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('abc');
  });
});

describe('useDocumentTitle', () => {
  it('formats "{title} · HR Leave Monitor" and handles an empty title', () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: 'Employees' },
    });
    expect(document.title).toBe('Employees · HR Leave Monitor');
    rerender({ title: '' });
    expect(document.title).toBe('HR Leave Monitor');
  });
});

describe('useOnlineStatus', () => {
  it('follows the browser online / offline events', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});

describe('useYearParam (Architecture §4.3: year lives in the URL)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 9));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const wrapperFor =
    (url: string) =>
    ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    );

  it('reads a valid ?year=', () => {
    const { result } = renderHook(() => useYearParam(), { wrapper: wrapperFor('/?year=2025') });
    expect(result.current[0]).toBe(2025);
  });

  it.each(['/', '/?year=abc', '/?year=2019', '/?year=2099'])(
    'falls back to the current year for %s',
    (url) => {
      const { result } = renderHook(() => useYearParam(), { wrapper: wrapperFor(url) });
      expect(result.current[0]).toBe(2026);
    },
  );

  it('writes the selected year back to the URL, preserving other params', async () => {
    const { result } = renderHook(() => useYearParam(), {
      wrapper: wrapperFor('/?q=juan&year=2025'),
    });
    act(() => {
      result.current[1](2024);
    });
    await waitFor(() => {
      expect(result.current[0]).toBe(2024);
    });
  });
});
