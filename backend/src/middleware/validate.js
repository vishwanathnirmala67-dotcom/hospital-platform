'use strict';
const { HttpError } = require('./error');

/** validate({ body: zodSchema, query: zodSchema, params: zodSchema }) - replaces req parts with parsed values. */
const validate = (schemas) => (req, res, next) => {
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part]);
    if (!r.success) {
      const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(new HttpError(422, 'Validation failed', details));
    }
    if (part === 'query') { Object.defineProperty(req, 'query', { value: r.data, writable: true }); } else req[part] = r.data;
  }
  next();
};
module.exports = { validate };
