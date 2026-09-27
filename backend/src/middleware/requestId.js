import { randomUUID } from 'node:crypto';

export function requestId(req, res, next) {
  req.id = `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  res.setHeader('X-Request-Id', req.id);
  next();
}
