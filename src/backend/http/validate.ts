import type { ZodSchema, ZodTypeDef } from 'zod';

/**
 * Result of validating an Express request part against a Zod schema.
 * Discriminated on `success` so callers can narrow without `!` assertions.
 */
export type ValidationResult<T> =
    | { success: true; data: T }
    | { success: false; status: 400; body: { error: string; details: unknown } };

/**
 * Validates an arbitrary request input (`req.params`, `req.query`, `req.body`)
 * against a Zod schema. Mirrors the `safeParse` pattern used by the Lambda
 * handlers in `lambda/api/closing-reports/` (arch-review card security-4 /
 * F-security-6). On failure returns a ready-to-send HTTP 400 payload.
 */
export const validateInput = <T, D extends ZodTypeDef, I>(
    schema: ZodSchema<T, D, I>,
    input: unknown,
): ValidationResult<T> => {
    const parsed = schema.safeParse(input);
    if (parsed.success) {
        return { success: true, data: parsed.data };
    }
    return {
        success: false,
        status: 400,
        body: {
            error: 'Invalid request input',
            details: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        },
    };
};
