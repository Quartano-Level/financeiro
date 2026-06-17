import 'reflect-metadata';
import { container } from 'tsyringe';
import { buildLegacyConexosAdapter } from './client/legacyConexosAdapter.js';
import ConexosClient, { LEGACY_CONEXOS_TOKEN } from './client/ConexosClient.js';
import EnvironmentProvider from './libs/environment/EnvironmentProvider.js';

let bootstrapped = false;

/**
 * Lazy bootstrap that wires the legacy Conexos adapter into the tsyringe
 * container. Called once before resolving any service/client that depends on
 * the Conexos ERP (e.g. the example `/conexos/filiais` route).
 *
 * No-op on subsequent calls.
 */
export const bootstrapAppContainer = async (): Promise<void> => {
    if (bootstrapped) return;
    const env = await container.resolve(EnvironmentProvider).getEnvironmentVars();

    const adapter = await buildLegacyConexosAdapter({
        conexosBaseUrl: env.conexosApiUrl,
        conexosUsername: env.conexosLogin,
        conexosPassword: env.conexosPassword,
        filCod: env.conexosFilCod,
    });

    container.register(LEGACY_CONEXOS_TOKEN, { useValue: adapter });
    container.resolve(ConexosClient); // eager warm
    bootstrapped = true;
};
