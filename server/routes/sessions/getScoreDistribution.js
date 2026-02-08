/**
 * Get score distribution for a session
 * GET /api/sessions/:sessionId/score-distribution
 */

export const registerGetScoreDistributionRoute = (app, { repo }) => {
    app.get('/api/sessions/:sessionId/score-distribution', async (req, res) => {
        // Prevent caching - always return fresh data
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');

        try {
            const { sessionId } = req.params;
            const { scoreField = 'score' } = req.query;

            if (!sessionId) {
                res.status(400).json({ error: 'sessionId is required' });
                return;
            }

            // Validate scoreField
            const validFields = ['score'];
            if (!validFields.includes(scoreField)) {
                res.status(400).json({ error: `Invalid scoreField. Must be one of: ${validFields.join(', ')}` });
                return;
            }

            console.log(`[getScoreDistribution] Fetching distribution for session ${sessionId}, field: ${scoreField}`);

            const dist = await repo.getScoreDistribution(sessionId, scoreField);

            if (dist.scoredCount === 0) {
                res.json({
                    sessionId,
                    totalItems: dist.totalCount,
                    scoredItems: 0,
                    unscoredItems: dist.unscoredCount,
                    scoreField: dist.scoreField,
                    message: `No items have ${scoreField} set.`
                });
                return;
            }

            console.log(`[getScoreDistribution] Found ${dist.scoredCount} scored, ${dist.unscoredCount} unscored items`);

            res.json({
                sessionId,
                totalItems: dist.totalCount,
                scoredItems: dist.scoredCount,
                unscoredItems: dist.unscoredCount,
                scoreField: dist.scoreField,
                statistics: dist.statistics,
                distribution: dist.distribution,
                thresholdPreview: dist.thresholdPreview
            });
        } catch (error) {
            console.error('[getScoreDistribution] Error:', error);
            res.status(500).json({ error: String(error) });
        }
    });
};
