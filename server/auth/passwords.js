import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const VERSION = 'v1';
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const DEFAULT_PARAMETERS = Object.freeze({ N: 16384, r: 8, p: 1 });
const MAX_PARAMETERS = Object.freeze({ N: 32768, r: 16, p: 4 });
const MAX_MEMORY = 64 * 1024 * 1024;

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isPowerOfTwo(value) {
  return isPositiveInteger(value) && (value & (value - 1)) === 0;
}

function decodeBase64(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return null;
  }

  return Buffer.from(value, 'base64');
}

function parsePasswordHash(stored) {
  if (typeof stored !== 'string') return null;

  const [algorithm, version, rawN, rawR, rawP, rawSalt, rawKey, ...rest] =
    stored.split('$');
  if (
    rest.length > 0 ||
    algorithm !== 'scrypt' ||
    version !== VERSION
  ) {
    return null;
  }

  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (
    !isPowerOfTwo(N) ||
    !isPositiveInteger(r) ||
    !isPositiveInteger(p) ||
    N > MAX_PARAMETERS.N ||
    r > MAX_PARAMETERS.r ||
    p > MAX_PARAMETERS.p
  ) {
    return null;
  }

  const salt = decodeBase64(rawSalt);
  const key = decodeBase64(rawKey);
  if (!salt || salt.length < SALT_LENGTH || !key || key.length !== KEY_LENGTH) {
    return null;
  }

  return { N, r, p, salt, key };
}

export function isPasswordHash(stored) {
  return parsePasswordHash(stored) !== null;
}

export async function hashPassword(password) {
  if (typeof password !== 'string') {
    throw new TypeError('password must be a string');
  }

  const salt = randomBytes(SALT_LENGTH);
  const { N, r, p } = DEFAULT_PARAMETERS;
  const key = await scrypt(password, salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: MAX_MEMORY
  });

  return [
    'scrypt',
    VERSION,
    N,
    r,
    p,
    salt.toString('base64'),
    Buffer.from(key).toString('base64')
  ].join('$');
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string') return false;

  const parsed = parsePasswordHash(stored);
  if (!parsed) return false;

  try {
    const candidate = await scrypt(password, parsed.salt, KEY_LENGTH, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: MAX_MEMORY
    });
    return timingSafeEqual(Buffer.from(candidate), parsed.key);
  } catch {
    return false;
  }
}
