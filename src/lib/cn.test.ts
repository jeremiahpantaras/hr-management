import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/cn';

describe('cn', () => {
  it('joins truthy class names and skips falsy ones', () => {
    const off = false as boolean;
    expect(cn('a', off && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('lets the last conflicting utility win', () => {
    expect(cn('px-2 px-4')).toBe('px-4');
    expect(cn('bg-primary', 'bg-danger-solid')).toBe('bg-danger-solid');
  });

  it('keeps custom type-scale tokens alongside a text colour', () => {
    expect(cn('text-page-title', 'text-fg')).toBe('text-page-title text-fg');
    expect(cn('text-sm', 'text-page-title')).toBe('text-page-title');
  });

  it('resolves conflicts between custom radius and shadow tokens and built-ins', () => {
    expect(cn('rounded-lg', 'rounded-card')).toBe('rounded-card');
    expect(cn('shadow-sm', 'shadow-card')).toBe('shadow-card');
  });
});
