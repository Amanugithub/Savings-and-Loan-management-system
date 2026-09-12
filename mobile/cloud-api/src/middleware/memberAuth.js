import jwt from 'jsonwebtoken';

export function requireMemberAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const decoded = jwt.verify(token, process.env.MEMBER_JWT_SECRET);
    if (decoded.role !== 'member') {
      return res.status(403).json({ error: 'Token is not a member token' });
    }
    req.member = decoded; // { id, phone_number, role: 'member' }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}