import type { Context } from 'hono';
import type { z } from 'zod';

/**
 * Simple validation hook that formats Zod errors consistently
 * Returns errors as an array of strings: ["field: message", ...]
 */
export const validationHook = (
  result: { success: boolean; data?: any; error?: z.ZodError },
  c: Context
): Response | void => {
  if (!result.success && result.error) {
    const errors: string[] = [];

    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      const message = path ? `${path}: ${issue.message}` : issue.message;
      errors.push(message);
    }

    return c.json(
      {
        success: false,
        errors,
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }
  // On success, return nothing (undefined) to continue to the handler
  return;
};
