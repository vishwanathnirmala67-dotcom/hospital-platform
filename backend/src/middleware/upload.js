'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { HttpError } = require('./error');

const dir = path.resolve(config.uploadDir);
fs.mkdirSync(dir, { recursive: true });
const ALLOWED = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' };

// Server picks the file name (random) - the client-supplied name is never used for the path.
const upload = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (ALLOWED[file.mimetype] || '')),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(new HttpError(422, 'Only PDF, PNG or JPEG files are allowed'))),
});
module.exports = { upload, uploadDir: dir };
