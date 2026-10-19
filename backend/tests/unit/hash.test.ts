import { hashService, createHashService } from '../../src/services/hash.js';

describe('Hash Service', () => {
  describe('hash', () => {
    it('should generate a bcrypt hash', async () => {
      const hash = await hashService.hash('testpassword');
      expect(hash).toMatch(/^\$2[aby]\$\d+\$/);
    });

    it('should generate different hashes for same input (salt)', async () => {
      const hash1 = await hashService.hash('testpassword');
      const hash2 = await hashService.hash('testpassword');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verify', () => {
    it('should return true for correct password', async () => {
      const plaintext = 'testpassword';
      const hash = await hashService.hash(plaintext);
      const result = await hashService.verify(plaintext, hash);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hash = await hashService.hash('correctpassword');
      const result = await hashService.verify('wrongpassword', hash);
      expect(result).toBe(false);
    });

    it('should handle empty strings', async () => {
      const hash = await hashService.hash('');
      const result = await hashService.verify('', hash);
      expect(result).toBe(true);
    });
  });

  describe('createHashService', () => {
    it('should accept custom rounds', () => {
      const customService = createHashService(10);
      expect(customService).toBeDefined();
    });
  });
});
