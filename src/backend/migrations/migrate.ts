import 'reflect-metadata';
import { container } from 'tsyringe';
import MigrationRunner from './runMigrations.js';

/**
 * Standalone migration entrypoint (`npm run migrate`). Runs the SQL migrations
 * in `migrations/*.sql` against the configured database and exits.
 *
 * Used by:
 *   - CI/CD: a dedicated step BEFORE the deploy (closes the deploy ring P0-1 —
 *     a fresh environment gets `permuta_eleicao_run`/`schema_migrations` created
 *     before any traffic, instead of `relation does not exist` at first request).
 *   - Local/ops: `npm run migrate` to apply pending migrations on demand.
 *
 * Exits non-zero on failure so the pipeline stops (fail-fast) instead of
 * deploying against an un-migrated schema.
 */
const main = async (): Promise<void> => {
    const runner = container.resolve(MigrationRunner);
    const applied = await runner.run();
    if (applied.length === 0) {
        console.log('[migrate] no pending migrations — schema is up to date');
    } else {
        console.log(`[migrate] applied ${applied.length} migration(s): ${applied.join(', ')}`);
    }
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(
            '[migrate] migration run FAILED:',
            error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
    });
