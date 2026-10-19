import {
  generateHmacToken,
  verifyHmacToken,
  generateInviteLookupToken,
  generateMemberLookupToken,
  generateAdminLookupToken,
  generateLookupToken,
} from '../../src/services/hmac-token.js';

describe('HMAC Token Service', () => {
  describe('generateHmacToken', () => {
    it('should generate a 64-character hex string', () => {
      const token = generateHmacToken('testcode');
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should be deterministic - same input produces same output', () => {
      const token1 = generateHmacToken('testcode');
      const token2 = generateHmacToken('testcode');
      expect(token1).toBe(token2);
    });

    it('should produce different output for different inputs', () => {
      const token1 = generateHmacToken('codeA');
      const token2 = generateHmacToken('codeB');
      expect(token1).not.toBe(token2);
    });

    it('should handle empty string', () => {
      const token = generateHmacToken('');
      expect(token).toHaveLength(64);
    });

    it('should handle unicode characters', () => {
      const token = generateHmacToken('代码');
      expect(token).toHaveLength(64);
    });
  });

  describe('verifyHmacToken', () => {
    it('should return true for matching code and token', () => {
      const code = 'testcode';
      const token = generateHmacToken(code);
      expect(verifyHmacToken(code, token)).toBe(true);
    });

    it('should return false for non-matching code and token', () => {
      const token = generateHmacToken('codeA');
      expect(verifyHmacToken('codeB', token)).toBe(false);
    });

    it('should return false for invalid token format', () => {
      expect(verifyHmacToken('testcode', 'invalid')).toBe(false);
    });

    it('should handle empty strings', () => {
      const token = generateHmacToken('');
      expect(verifyHmacToken('', token)).toBe(true);
    });
  });

  describe('generateInviteLookupToken', () => {
    it('should normalize invite code to uppercase', () => {
      const token1 = generateInviteLookupToken('abc123');
      const token2 = generateInviteLookupToken('ABC123');
      expect(token1).toBe(token2);
    });

    it('should return a 64-character hex string', () => {
      const token = generateInviteLookupToken('ABC123');
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('generateMemberLookupToken', () => {
    it('should preserve case (case-sensitive)', () => {
      const token1 = generateMemberLookupToken('abc123DEF456');
      const token2 = generateMemberLookupToken('ABC123def456');
      expect(token1).not.toBe(token2);
    });

    it('should return a 64-character hex string', () => {
      const token = generateMemberLookupToken('abc123def456');
      expect(token).toHaveLength(64);
    });
  });

  describe('generateAdminLookupToken', () => {
    it('should preserve case (case-sensitive)', () => {
      const token1 = generateAdminLookupToken('abc123DEF456');
      const token2 = generateAdminLookupToken('ABC123def456');
      expect(token1).not.toBe(token2);
    });

    it('should return a 64-character hex string', () => {
      const token = generateAdminLookupToken('abc123def456');
      expect(token).toHaveLength(64);
    });
  });

  describe('generateLookupToken', () => {
    it('should generate invite token', () => {
      const token = generateLookupToken('ABC123', 'invite');
      expect(token).toHaveLength(64);
    });

    it('should generate member token', () => {
      const token = generateLookupToken('abc123def456', 'member');
      expect(token).toHaveLength(64);
    });

    it('should generate admin token', () => {
      const token = generateLookupToken('abc123def456', 'admin');
      expect(token).toHaveLength(64);
    });

    it('should throw for unknown code type', () => {
      expect(() => generateLookupToken('test', 'unknown' as any)).toThrow();
    });

    it('should normalize invite codes to uppercase', () => {
      const token1 = generateLookupToken('abc123', 'invite');
      const token2 = generateLookupToken('ABC123', 'invite');
      expect(token1).toBe(token2);
    });
  });
});
