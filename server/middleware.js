import 'dotenv/config';
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || 'messmeter-local-development-secret';

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    req.user = jwt.verify(token, secret);
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to do that.' });
    return next();
  };
}

export { secret };
