import crypto from 'crypto';
import config from '../config/index.js';

const ALGORITHM = 'sha256';
const OUTPUT_ENCODING = 'hex';

export function generateHmacToken(code: string): string {
  const hmac = crypto.createHmac(ALGORITHM, config.HMAC_SECRET);
  hmac.update(code, 'utf8');
  return hmac.digest(OUTPUT_ENCODING);
}

export function verifyHmacToken(code: string, token: string): boolean {
  const expectedToken = generateHmacToken(code);
  try {
    const expectedBuffer = Buffer.from(expectedToken, OUTPUT_ENCODING);
    const tokenBuffer = Buffer.from(token, OUTPUT_ENCODING);
    if (expectedBuffer.length !== tokenBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
  } catch {
    return false;
  }
}

export function generateInviteLookupToken(inviteCode: string): string {
  return generateHmacToken(inviteCode.toUpperCase());
}

export function generateMemberLookupToken(memberCode: string): string {
  return generateHmacToken(memberCode);
}

export function generateAdminLookupToken(adminCode: string): string {
  return generateHmacToken(adminCode);
}

export function generateLookupToken(code: string, codeType: 'invite' | 'member' | 'admin'): string {
  switch (codeType) {
    case 'invite':
      return generateInviteLookupToken(code);
    case 'member':
      return generateMemberLookupToken(code);
    case 'admin':
      return generateAdminLookupToken(code);
    default:
      throw new Error(`Unknown code type: ${codeType}`);
  }
}
