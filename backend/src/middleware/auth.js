import jwt from 'jsonwebtoken';

// Protects a route: requires a valid "Authorization: Bearer <token>" header.
// On success, attaches the decoded admin info to req.admin so downstream
// handlers know who's making the request (e.g. for recorded_by fields).
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded; // { id, username }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
