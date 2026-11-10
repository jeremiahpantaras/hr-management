import { zodResolver } from '@hookform/resolvers/zod';
import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * Resolves ISS-004: the installed @hookform/resolvers must work with the installed Zod 4,
 * end to end through react-hook-form (this is how every form in the app will validate).
 */
const schema = z.object({
  credits: z.number().positive('Days must be greater than 0.'),
  remarks: z.string().max(5, 'Too long.').optional(),
});

describe('react-hook-form + @hookform/resolvers + Zod 4', () => {
  // react-hook-form's formState is a subscription proxy: `errors` must be READ during render.
  function useDemoForm(defaultValues: z.input<typeof schema>) {
    const form = useForm({ resolver: zodResolver(schema), defaultValues });
    const { errors } = form.formState;
    return { form, errors };
  }

  it('surfaces schema messages as field errors', async () => {
    const { result } = renderHook(() => useDemoForm({ credits: -1, remarks: 'too long!' }));

    await act(async () => {
      await result.current.form.trigger();
    });

    expect(result.current.errors.credits?.message).toBe('Days must be greater than 0.');
    expect(result.current.errors.remarks?.message).toBe('Too long.');
  });

  it('accepts valid input and returns parsed values', async () => {
    const { result } = renderHook(() => useDemoForm({ credits: 2.5 }));

    let submitted: unknown;
    await act(async () => {
      await result.current.form.handleSubmit((values) => {
        submitted = values;
      })();
    });

    expect(result.current.errors.credits).toBeUndefined();
    expect(submitted).toEqual({ credits: 2.5 });
  });

  it('rejects invalid input on submit without calling the handler', async () => {
    const { result } = renderHook(() => useDemoForm({ credits: 0 }));

    let called = false;
    await act(async () => {
      await result.current.form.handleSubmit(() => {
        called = true;
      })();
    });

    expect(called).toBe(false);
    expect(result.current.errors.credits?.message).toBe('Days must be greater than 0.');
  });
});
