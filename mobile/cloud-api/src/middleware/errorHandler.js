
export function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === '23514') {
    // check_violation
    return res.status(400).json({ error: 'Invalid value for one or more fields' });
  }
  if (err.code === '23505') {
    // unique_violation
    return res.status(409).json({ error: 'A record with this value already exists' });
  }
  if (err.code === '23503') {
    // foreign_key_violation
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }

  const status = err.status || 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Server error'
    : err.message || 'Server error';
  res.status(status).json({ error: message });
}

// Wrap async route handlers so thrown/rejected errors reach errorHandler
// instead of crashing the process.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
