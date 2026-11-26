import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const ENCODED_HASH = /^[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/;
const DUMMY_HASH = `${Buffer.alloc(16).toString('base64url')}:${Buffer.alloc(32).toString('base64url')}`;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `${salt.toString('base64url')}:${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, hash?: string) {
  const isUsable = hash !== undefined && ENCODED_HASH.test(hash);
  const [salt, expected] = (isUsable ? hash : DUMMY_HASH).split(':');
  const key = await deriveKey(password, Buffer.from(salt, 'base64url'));
  const matches = timingSafeEqual(key, Buffer.from(expected, 'base64url'));
  return isUsable && matches;
}
