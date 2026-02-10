import crypto from 'crypto';

function generatePublicToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export { generatePublicToken};