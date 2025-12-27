
import crypto from 'crypto';
// helper to create a safe filename
function randomName(prefix = "file", ext = "mp3") {
  const id = crypto.randomBytes(6).toString("hex");
  return `${prefix}_${Date.now()}_${id}.${ext}`;
}

export {randomName};