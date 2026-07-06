import crypto from 'crypto';
import createAdminLog from './logWriter';

function generatePublicToken(tts_id=-1) {
  const qr_code=crypto.randomBytes(24).toString('base64url');
  createAdminLog(`New Public token generated: ${qr_code} for ID: ${tts_id}`, 'SYSTEM GENERATED');
  return qr_code;
}

export { generatePublicToken};