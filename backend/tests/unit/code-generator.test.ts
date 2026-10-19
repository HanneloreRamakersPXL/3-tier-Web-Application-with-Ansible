import {
  generateInviteCode,
  generateMemberCode,
  generateAdminCode,
} from '../../src/services/code-generator.js';

describe('Code Generator Service', () => {
  describe('generateInviteCode', () => {
    it('should generate a 6-character code', async () => {
      const result = await generateInviteCode();
      expect(result.code).toHaveLength(6);
    });

    it('should return uppercase characters', async () => {
      const result = await generateInviteCode();
      expect(result.code).toBe(result.code.toUpperCase());
    });

    it('should contain only valid characters', async () => {
      const result = await generateInviteCode();
      const validChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (const char of result.code) {
        expect(validChars).toContain(char);
      }
    });

    it('should generate lookup token', async () => {
      const result = await generateInviteCode();
      expect(result.lookupToken).toBeDefined();
      expect(result.lookupToken).toHaveLength(64);
    });

    it('should generate bcrypt hash', async () => {
      const result = await generateInviteCode();
      expect(result.hash).toBeDefined();
      expect(result.hash).toMatch(/^\$2[aby]\$\d+\$/);
    });
  });

  describe('generateMemberCode', () => {
    it('should generate a 12-character code', async () => {
      const result = await generateMemberCode();
      expect(result.code).toHaveLength(12);
    });

    it('should preserve case (case-sensitive)', async () => {
      const result = await generateMemberCode();
      const hasUpper = /[A-Z]/.test(result.code);
      const hasLower = /[a-z]/.test(result.code);
      expect(hasUpper || hasLower).toBe(true);
    });
  });

  describe('generateAdminCode', () => {
    it('should generate a 12-character code', async () => {
      const result = await generateAdminCode();
      expect(result.code).toHaveLength(12);
    });
  });

  describe('collision retry', () => {
    it('should retry on collision', async () => {
      let attempts = 0;
      const result = await generateInviteCode(async () => {
        attempts++;
        return attempts < 3;
      });
      expect(result.code).toHaveLength(6);
      expect(attempts).toBeGreaterThanOrEqual(3);
    });

    it('should fail after max retries', async () => {
      const alwaysCollide = async () => true;
      await expect(generateInviteCode(alwaysCollide)).rejects.toThrow('Failed to generate unique code');
    });
  });
});
