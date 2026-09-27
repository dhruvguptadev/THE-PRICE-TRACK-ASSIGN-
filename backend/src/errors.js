// API errors carry an HTTP status and a stable machine-readable code.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, 'VALIDATION_ERROR', message, details);
export const notFound = (code, message) => new ApiError(404, code, message);
export const conflict = (code, message) => new ApiError(409, code, message);
