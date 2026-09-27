import { ApiError } from '../errors.js';

export function notFoundHandler(req, res, next) {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}.`));
}

// Central error middleware (Express 5 forwards async errors here). Never leaks stack traces.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err instanceof ApiError ? err.status : 500;
  let code = err instanceof ApiError ? err.code : 'INTERNAL_ERROR';
  let message = err instanceof ApiError ? err.message : 'Unexpected server error.';

  // Malformed JSON body from express.json().
  if (err.type === 'entity.parse.failed') {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Request body is not valid JSON.';
  }
  if (status >= 500) console.error(`[${req.id}] ${req.method} ${req.originalUrl}`, err);

  res.status(status).json({
    error: { code, message, ...(err.details ? { details: err.details } : {}), requestId: req.id },
  });
}
