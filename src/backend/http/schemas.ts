import { z } from 'zod';

/**
 * Zod schemas for Express route inputs (arch-review card security-4 /
 * F-security-6). Every Express handler validates `req.params` / `req.query` /
 * `req.body` against one of these before touching a service or client.
 *
 * The skeleton ships one generic example (`PaginationQuerySchema`). Domain
 * feature routers (financeiro) add their own schemas alongside it.
 */

/** Generic list/pagination query string (`?search=&page=`). */
export const PaginationQuerySchema = z.object({
    search: z.string().trim().min(1).max(200).optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
