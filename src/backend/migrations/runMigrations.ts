import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient from '../domain/client/database/PostgreeDatabaseClient.js';

const MIGRATIONS_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * MigrationRunner — runner simples (convenção inaugurada pela Fatia 1 de
 * Permutas). Aplica os arquivos `migrations/NNNN_*.sql` em ordem lexicográfica,
 * registrando os já aplicados em `schema_migrations` (idempotente).
 *
 * Sem framework de migration externo nesta fatia — só `fs` + o
 * `PostgreeDatabaseClient` existente. SQL DDL é estático (não há input externo),
 * por isso roda como statement cru (não passa pelo SqlBuilder de `$nome`).
 */
@injectable()
export default class MigrationRunner {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    public run = async (): Promise<string[]> => {
        await this.databaseClient.insert(
            `CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )`,
        );

        const appliedRows = await this.databaseClient.selectMany(
            'SELECT name FROM schema_migrations',
        );
        const applied = new Set(appliedRows.map((r) => String(r.name)));

        const files = readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql'))
            .sort();

        const newlyApplied: string[] = [];
        for (const file of files) {
            if (applied.has(file)) continue;
            const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
            await this.databaseClient.insert(sql);
            await this.databaseClient.insert(
                'INSERT INTO schema_migrations (name) VALUES ($name)',
                { name: file },
            );
            newlyApplied.push(file);
        }
        return newlyApplied;
    };
}
