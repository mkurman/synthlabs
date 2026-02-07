import { FirestoreRepository } from './firestoreRepository.js';

/** @type {import('./repository.js').DbRepository|null} */
let activeRepo = null;
let activeProvider = process.env.DB_PROVIDER || 'firestore';

/**
 * Create a repository for the given provider.
 * Does NOT set it as active — use initRepository() or switchProvider() for that.
 */
export async function createRepository(provider, config = {}) {
    if (provider === 'cockroachdb') {
        // Dynamic import to avoid loading pg when not needed
        const { CockroachRepository } = await import('./cockroachRepository.js');
        const connectionString = config.connectionString || process.env.COCKROACH_CONNECTION_STRING;
        const caCert = config.caCert;
        const caCertPath = config.caCertPath || process.env.COCKROACH_CA_CERT_PATH;
        if (!connectionString) {
            throw new Error('COCKROACH_CONNECTION_STRING is required for CockroachDB provider');
        }
        return new CockroachRepository({ connectionString, caCert, caCertPath });
    }

    // Default: Firestore
    if (!config.getDb) {
        throw new Error('getDb function is required for Firestore provider');
    }
    return new FirestoreRepository(config.getDb);
}

/**
 * A proxy that always delegates to the current active repo.
 * Routes receive this proxy at startup, so provider switches are transparent.
 */
const repoProxy = new Proxy({}, {
    get(_target, prop) {
        const current = getRepository();
        const value = current[prop];
        return typeof value === 'function' ? value.bind(current) : value;
    }
});

/**
 * Initialize the active repository on startup.
 * Returns a proxy that always delegates to the current active repo,
 * so provider switches via switchProvider() are transparent to route handlers.
 * @param {Object} config - { getDb, connectionString, caCert, caCertPath }
 */
export async function initRepository(config = {}) {
    activeProvider = process.env.DB_PROVIDER || 'firestore';
    activeRepo = await createRepository(activeProvider, config);

    if (activeProvider === 'cockroachdb') {
        try {
            await activeRepo.runMigrations();
        } catch (error) {
            console.error('[repositoryFactory] Failed to run migrations:', error.message);
        }
    }

    console.log(`[repositoryFactory] Initialized with provider: ${activeProvider}`);
    return repoProxy;
}

/**
 * Get the active repository instance.
 * @returns {import('./repository.js').DbRepository}
 */
export function getRepository() {
    if (!activeRepo) {
        throw new Error('Repository not initialized. Call initRepository() first.');
    }
    return activeRepo;
}

/**
 * Switch the active provider at runtime.
 * Closes the old repo if needed.
 */
export async function switchProvider(provider, config = {}) {
    const newRepo = await createRepository(provider, config);

    // Test the new connection
    const test = await newRepo.testConnection();
    if (!test.ok) {
        await newRepo.close();
        throw new Error(`Connection test failed: ${test.error}`);
    }

    // Run migrations for CockroachDB
    if (provider === 'cockroachdb') {
        await newRepo.runMigrations();
    }

    // Close old repo
    if (activeRepo) {
        try {
            await activeRepo.close();
        } catch { /* ignore */ }
    }

    activeRepo = newRepo;
    activeProvider = provider;
    console.log(`[repositoryFactory] Switched to provider: ${provider}`);
    return activeRepo;
}

/**
 * Get the current active provider name.
 */
export function getCurrentProvider() {
    return activeProvider;
}
