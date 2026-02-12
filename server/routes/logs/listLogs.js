export const registerListLogsRoute = (app, { repo }) => {
    app.get('/api/logs', async (req, res) => {
        try {
            const sessionUid = req.query.sessionUid || null;
            const limit = Math.min(Number(req.query.limit || 100), 500);
            const cursor = req.query.cursor || null;
            const cursorCreatedAt = req.query.cursorCreatedAt || null;
            const orderBy = req.query.orderBy || 'createdAt';
            const direction = req.query.direction || 'desc';
            const offset = Number(req.query.offset || 0);

            const result = await repo.listLogs({ sessionUid, limit, cursor: cursorCreatedAt || cursor, orderBy, direction });
            const logs = result.items || result;
            const hasMore = result.hasMore || false;
            const nextCursorCreatedAt = result.nextCursor || null;

            res.json({ logs, hasMore, nextCursorCreatedAt });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
};
