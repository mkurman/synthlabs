import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'server-bundle');

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

// Plugin to replace dotenv/config import with a no-op (env vars handled differently in Electron)
const ignoreDotenvPlugin = {
    name: 'ignore-dotenv',
    setup(build) {
        build.onResolve({ filter: /^dotenv\/config$/ }, () => ({
            path: 'dotenv/config',
            namespace: 'ignore-dotenv'
        }));
        build.onLoad({ filter: /.*/, namespace: 'ignore-dotenv' }, () => ({
            contents: '// dotenv disabled in bundled version',
            loader: 'js'
        }));
    }
};

await esbuild.build({
    entryPoints: [path.join(rootDir, 'server/index.js')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: path.join(outDir, 'index.cjs'),
    format: 'cjs',
    external: [],
    minify: true,
    plugins: [ignoreDotenvPlugin],
    // Banner to prevent auto-start when required as module
    banner: {
        js: '// Bundled server for Electron\nconst __BUNDLED_FOR_ELECTRON__ = true;'
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        // Prevent auto-start when imported - this replaces the isDirectRun check
        'import.meta.url': JSON.stringify('file:///bundled-server.js')
    }
});

console.log('Server bundled successfully to server-bundle/index.cjs');
