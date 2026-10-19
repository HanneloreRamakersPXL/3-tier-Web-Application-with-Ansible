import crypto from 'crypto';
import { hashService } from './hash.js';
import { generateHmacToken } from './hmac-token.js';

const CONFIG = {
  INVITE_CODE_LENGTH: 6,
  MEMBER_CODE_LENGTH: 12,
  ADMIN_CODE_LENGTH: 12,
  MAX_RETRIES: 5,
  INVITE_CHARSET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  MEMBER_ADMIN_CHARSET: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
};

export interface GeneratedCode {
  code: string;
  lookupToken: string;
  hash: string;
}

function generateRandomCode(length: number, charset: string): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

async function generateCodeWithRetry(
  length: number,
  charset: string,
  checkCollision: (code: string) => Promise<boolean>
): Promise<string> {
  for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
    const code = generateRandomCode(length, charset);
    const exists = await checkCollision(code);
    if (!exists) {
      return code;
    }
  }
  throw new Error('Failed to generate unique code after 5 attempts');
}

export async function generateInviteCode(
  checkCollision?: (code: string) => Promise<boolean>
): Promise<GeneratedCode> {
  let code: string;

  if (checkCollision) {
    code = await generateCodeWithRetry(CONFIG.INVITE_CODE_LENGTH, CONFIG.INVITE_CHARSET, checkCollision);
  } else {
    code = generateRandomCode(CONFIG.INVITE_CODE_LENGTH, CONFIG.INVITE_CHARSET);
  }

  const normalizedCode = code.toUpperCase();

  return {
    code: normalizedCode,
    lookupToken: generateHmacToken(normalizedCode),
    hash: await hashService.hash(normalizedCode),
  };
}

export async function generateMemberCode(
  checkCollision?: (code: string) => Promise<boolean>
): Promise<GeneratedCode> {
  let code: string;

  if (checkCollision) {
    code = await generateCodeWithRetry(CONFIG.MEMBER_CODE_LENGTH, CONFIG.MEMBER_ADMIN_CHARSET, checkCollision);
  } else {
    code = generateRandomCode(CONFIG.MEMBER_CODE_LENGTH, CONFIG.MEMBER_ADMIN_CHARSET);
  }

  return {
    code,
    lookupToken: generateHmacToken(code),
    hash: await hashService.hash(code),
  };
}

export async function generateAdminCode(
  checkCollision?: (code: string) => Promise<boolean>
): Promise<GeneratedCode> {
  let code: string;

  if (checkCollision) {
    code = await generateCodeWithRetry(CONFIG.ADMIN_CODE_LENGTH, CONFIG.MEMBER_ADMIN_CHARSET, checkCollision);
  } else {
    code = generateRandomCode(CONFIG.ADMIN_CODE_LENGTH, CONFIG.MEMBER_ADMIN_CHARSET);
  }

  return {
    code,
    lookupToken: generateHmacToken(code),
    hash: await hashService.hash(code),
  };
}
