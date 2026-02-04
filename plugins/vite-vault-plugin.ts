import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

export function backendVaultPlugin(): Plugin {
    return {
        name: 'backend-vault',
        configureServer(server) {
            server.middlewares.use('/__vault__', (_req, res) => {
                const vaultPath = path.join(process.cwd(), '.backend-vault.json');
                try {
                    if (fs.existsSync(vaultPath)) {
                        const content = fs.readFileSync(vaultPath, 'utf8');
                        const vault = JSON.parse(content);

                        // Check if the backend process is still alive
                        let alive = false;
                        try {
                            process.kill(vault.pid, 0);
                            alive = true;
                        } catch {
                            alive = false;
                        }

                        if (alive) {
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify(vault));
                            return;
                        }
                    }
                } catch { /* fall through */ }

                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'vault not found' }));
            });
        }
    };
}
