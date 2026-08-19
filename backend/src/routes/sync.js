import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { runSync, getSyncStatus } from '../sync/PushToRemote.js';

const router = Router();

router.use(requireAuth);

// GET /api/sync/status — summarizes local pending rows and remote connectivity.
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const status = await getSyncStatus();
    res.json({
      ok: status.ok,
      status: status.ok ? 'healthy' : 'degraded',
      ...status,
    });
  })
);

// GET /api/sync/health — alias for status with explicit health semantics.
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const status = await getSyncStatus();
    res.json({
      ok: status.ok,
      status: status.ok ? 'healthy' : 'degraded',
      health: status,
    });
  })
);

// POST /api/sync — manually triggered. Pushes every locally pending
// row (synced_at IS NULL, across all tables) to the remote database.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const results = await runSync();
    const health = await getSyncStatus();

    const totalPushed = results.reduce((sum, result) => sum + result.pushed, 0);
    const totalSkipped = results.reduce((sum, result) => sum + result.skipped, 0);
    const totalFailed = results.reduce((sum, result) => sum + result.failed.length, 0);

    res.json({
      ok: health.ok && totalFailed === 0,
      status: health.ok && totalFailed === 0 ? 'success' : 'degraded',
      summary: { pushed: totalPushed, skipped: totalSkipped, failed: totalFailed },
      details: results,
      health,
    });
  })
);

export default router;