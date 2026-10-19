jest.mock('@cinevote/storage', () => ({
  pool: {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
  },
  insertGroup: jest.fn().mockResolvedValue('group-id-123'),
  insertMember: jest.fn().mockResolvedValue('member-id-456'),
  insertRound: jest.fn().mockResolvedValue('round-id-789'),
}));

jest.mock('../../src/services/code-generator.js', () => ({
  generateInviteCode: jest.fn().mockResolvedValue({
    code: 'ABC123',
    lookupToken: 'token1',
    hash: 'hash1',
  }),
  generateAdminCode: jest.fn().mockResolvedValue({
    code: 'admincode123',
    lookupToken: 'token2',
    hash: 'hash2',
  }),
  generateMemberCode: jest.fn().mockResolvedValue({
    code: 'membercode12',
    lookupToken: 'token3',
    hash: 'hash3',
  }),
}));

jest.mock('../../src/services/hmac-token.js', () => ({
  generateAdminLookupToken: jest.fn().mockReturnValue('admin-lookup-token'),
  generateMemberLookupToken: jest.fn().mockReturnValue('member-lookup-token'),
}));

import { createGroup } from '../../src/services/group-service.js';

describe('Group Service', () => {
  describe('createGroup', () => {
    it('should create a group with all required fields', async () => {
      const result = await createGroup('Test Group', 'John Doe', 5);

      expect(result.group_id).toBeDefined();
      expect(result.group_name).toBe('Test Group');
      expect(result.invite_code).toHaveLength(6);
      expect(result.admin_code).toHaveLength(12);
      expect(result.member_id).toBeDefined();
      expect(result.member_code).toHaveLength(12);
      expect(result.round_id).toBeDefined();
      expect(result.max_members).toBe(5);
    });

    it('should return uppercase invite code', async () => {
      const result = await createGroup('Test Group', 'John Doe', 5);
      expect(result.invite_code).toBe(result.invite_code.toUpperCase());
    });

    it('should include group_name in response', async () => {
      const result = await createGroup('My Movie Night', 'Alice', 4);
      expect(result.group_name).toBe('My Movie Night');
    });

    it('should return all 8 required fields', async () => {
      const result = await createGroup('Test Group', 'John Doe', 5);
      expect(result).toHaveProperty('group_id');
      expect(result).toHaveProperty('group_name');
      expect(result).toHaveProperty('invite_code');
      expect(result).toHaveProperty('admin_code');
      expect(result).toHaveProperty('member_id');
      expect(result).toHaveProperty('member_code');
      expect(result).toHaveProperty('round_id');
      expect(result).toHaveProperty('max_members');
    });
  });
});
