// Central error handler. Routes/controllers should call next(err)
// (or throw inside an async wrapper) rather than building their
// own res.status(...).json(...) error responses.
export function errorHandler(err, req, res, next) {
  console.error(err);

  // better-sqlite3 throws on CHECK/UNIQUE constraint violations —
  // surface those as 400s instead of a generic 500.
  if (err.code === 'SQLITE_CONSTRAINT_CHECK') {
    return res.status(400).json({ error: 'Invalid value for one or more fields' });
  }
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'A record with this value already exists' });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error' });
}

// Wrap async route handlers so thrown errors reach errorHandler
// instead of crashing the process (Express doesn't catch async
// rejections automatically).
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
