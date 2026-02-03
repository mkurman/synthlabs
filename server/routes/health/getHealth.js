export const registerHealthRoutes = (app) => {
    app.get('/health', (_req, res) => {
        res.json({ ok: true });
    });
};
