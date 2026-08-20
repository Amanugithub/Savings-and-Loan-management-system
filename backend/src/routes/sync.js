import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { runSync, getSyncStatus } from '../sync/PushToRemote.js';
import { runPull } from '../sync/PullFromRemote.js';

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

// POST /api/sync — pulls remote changes first, then pushes local pending rows.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const pulled = await runPull();
    const results = await runSync();
    const health = await getSyncStatus();

    const totalPulled = pulled.reduce((sum, result) => sum + result.pulled, 0);
    const totalPullSkipped = pulled.reduce((sum, result) => sum + result.skipped, 0);
    const totalPullFailed = pulled.reduce((sum, result) => sum + result.failed.length, 0);
    const totalPushed = results.reduce((sum, result) => sum + result.pushed, 0);
    const totalSkipped = results.reduce((sum, result) => sum + result.skipped, 0);
    const totalFailed = totalPullFailed + results.reduce((sum, result) => sum + result.failed.length, 0);

    res.json({
      ok: health.ok && totalFailed === 0,
      status: health.ok && totalFailed === 0 ? 'success' : 'degraded',
      summary: {
        pulled: totalPulled,
        pull_skipped: totalPullSkipped,
        pushed: totalPushed,
        skipped: totalSkipped,
        failed: totalFailed,
      },
      pull: pulled,
      details: results,
      health,
    });
  })
);

export default router;
