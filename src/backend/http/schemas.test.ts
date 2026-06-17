import { PaginationQuerySchema } from './schemas.js';
import { validateInput } from './validate.js';

describe('PaginationQuerySchema', () => {
    it('accepts an empty query and defaults page to 1', () => {
        const result = validateInput(PaginationQuerySchema, {});
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.page).toBe(1);
    });

    it('coerces a numeric string page', () => {
        const result = validateInput(PaginationQuerySchema, { page: '3', search: 'ABC' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.page).toBe(3);
            expect(result.data.search).toBe('ABC');
        }
    });

    it('rejects a non-numeric page with HTTP 400', () => {
        const result = validateInput(PaginationQuerySchema, { page: 'abc' });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.status).toBe(400);
    });

    it('rejects a page below 1', () => {
        const result = validateInput(PaginationQuerySchema, { page: '0' });
        expect(result.success).toBe(false);
    });

    it('rejects a page above the 500 cap', () => {
        const result = validateInput(PaginationQuerySchema, { page: '999' });
        expect(result.success).toBe(false);
    });
});
