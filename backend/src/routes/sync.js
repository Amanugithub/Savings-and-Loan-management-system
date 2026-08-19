import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { runSync } from '../sync/pushToRemote.js';

const router = Router();

router.use(requireAuth);

// POST /api/sync — manually triggered. Pushes every locally pending
// row (synced_at IS NULL, across all tables) to the remote database.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const results = await runSync();

    const totalPushed = results.reduce((sum, r) => sum + r.pushed, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed.length, 0);

    res.json({
      summary: { pushed: totalPushed, failed: totalFailed },
      details: results,
    });
  })
);

export default router;