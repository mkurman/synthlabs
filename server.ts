/**
 * Standalone server for SynthLabs Reasoning Generator
 * Build with: bun build --compile --minify server.ts --outfile synthlabs
 */

export { }; // Make this a module

declare const Bun: any;

const port = process.env.PORT || 3000;
const distPath = "./dist";

// Check if dist exists
const distDir = Bun.file(`${distPath}/index.html`);
if (!(await distDir.exists())) {
    console.error("❌ Error: dist/ folder not found. Run 'bun run build' first.");
    process.exit(1);
}

console.log(`
╔════════════════════════════════════════════════╗
║   SynthLabs Reasoning Generator                ║
║   http://localhost:${port}                         ║
╚════════════════════════════════════════════════╝
`);

Bun.serve({
    port: Number(port),
    async fetch(req: Request) {
        const url = new URL(req.url);
        let path = url.pathname;

        // Default to index.html for SPA routing
        if (path === "/" || !path.includes(".")) {
            path = "/index.html";
        }

        const filePath = `${distPath}${path}`;
        const file = Bun.file(filePath);

        if (await file.exists()) {
            return new Response(file);
        }

        // Fallback to index.html for client-side routing
        return new Response(Bun.file(`${distPath}/index.html`));
    },
});
