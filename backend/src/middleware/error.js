'use strict';
const logger = require('../logger');

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
const notFound = (req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });

// One consistent error shape: { error: { code, message, details? } }
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let code = { 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 413: 'file_too_large', 422: 'validation_error', 429: 'rate_limited' }[status] || 'internal_error';
  let message = err.message;
  if (err.code === '23505') { status = 409; code = 'conflict'; message = 'Already exists (duplicate value or slot taken)'; }
  else if (err.code === '23503') { status = 400; code = 'bad_request'; message = 'Referenced record does not exist'; }
  else if (err.code === 'LIMIT_FILE_SIZE') { status = 413; code = 'file_too_large'; message = 'File too large (max 5 MB)'; }
  else if (err.type === 'entity.parse.failed') { status = 400; code = 'bad_request'; message = 'Malformed JSON body'; }
  if (status >= 500) {
    logger.error('unhandled_error', { path: req.path, method: req.method, err: err.stack || String(err) });
    message = 'Something went wrong'; // never leak internals
  }
  res.status(status).json({ error: { code, message, ...(err.details ? { details: err.details } : {}) } });
}
module.exports = { HttpError, notFound, errorHandler };
