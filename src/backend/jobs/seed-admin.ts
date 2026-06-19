import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import { container } from 'tsyringe';
import { bootstrapAppContainer } from '../domain/appContainer.js';
import UserRepository from '../domain/repository/auth/UserRepository.js';

/**
 * Seed do usuário admin do login simples. Espelha `jobs/ingest-permutas.ts`:
 *   reflect-metadata → bootstrapAppContainer() → resolve UserRepository →
 *   upsertAdmin() → exit 0/1.
 *
 * Credenciais via env (com defaults para dev):
 *   ADMIN_USERNAME (default 'admin') / ADMIN_PASSWORD (default 'columbia2026').
 *
 * Idempotente (UPSERT por username): re-rodar atualiza a senha. Rodar como
 * pre-deploy (após `npm run migrate`) ou sob demanda. NÃO roda dentro do app.
 */
const BCRYPT_ROUNDS = 10;

const main = async (): Promise<void> => {
    await bootstrapAppContainer();
    const username = process.env.ADMIN_USERNAME ?? 'admin';
    const password = process.env.ADMIN_PASSWORD ?? 'columbia2026';
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const repository = container.resolve(UserRepository);
    await repository.upsertAdmin(username, passwordHash, 'admin');

    console.log(`[seed-admin] admin user ready: username="${username}" role="admin"`);
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(
            '[seed-admin] seed FAILED:',
            error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
    });
