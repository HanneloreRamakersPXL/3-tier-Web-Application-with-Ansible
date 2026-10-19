import request from 'supertest';
import app from '../../src/app.js';
import { checkDatabaseHealth } from '@cinevote/storage';

let dbAvailable = false;
let adminToken = '';
let memberToken = '';

beforeAll(async () => {
  dbAvailable = await checkDatabaseHealth();
  if (dbAvailable) {
    const ts = Date.now();
    const adminRes = await request(app).post('/api/auth/register').send({
      email: `flow-admin-${ts}@test.com`,
      username: `flowadmin${ts}`,
      password: 'TestPassword123!',
    });
    adminToken = adminRes.body.token ?? '';

    const memberRes = await request(app).post('/api/auth/register').send({
      email: `flow-member-${ts}@test.com`,
      username: `flowmember${ts}`,
      password: 'TestPassword123!',
    });
    memberToken = memberRes.body.token ?? '';
  }
});

describe('E2E Flow Tests', () => {
  describe('Group Creation and Join Flow', () => {
    it('should complete group creation and join by a second account', async () => {
      if (!dbAvailable) return;

      // Step 1: Create group as admin
      const createResponse = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ group_name: 'E2E Flow Group', max_members: 5 })
        .expect(201);

      expect(createResponse.body).toHaveProperty('group_id');
      expect(createResponse.body).toHaveProperty('invite_code');
      expect(createResponse.body).toHaveProperty('admin_code');
      expect(createResponse.body).toHaveProperty('member_id');
      expect(createResponse.body).toHaveProperty('member_code');
      expect(createResponse.body).toHaveProperty('round_id');

      const { invite_code, member_code, round_id } = createResponse.body;

      // Step 2: Join group as a second member from a different account
      const joinResponse = await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ invite_code })
        .expect(201);

      expect(joinResponse.body).toHaveProperty('group_id');
      expect(joinResponse.body).toHaveProperty('member_id');
      expect(joinResponse.body).toHaveProperty('member_code');
      expect(joinResponse.body.current_round).toBeTruthy();
      expect(joinResponse.body.current_round.round_id).toBe(round_id);

      // Step 3: Resume original admin session
      const resumeResponse = await request(app)
        .post('/api/groups/resume')
        .send({ invite_code, member_code })
        .expect(200);

      expect(resumeResponse.body).toHaveProperty('group_id', createResponse.body.group_id);
      expect(resumeResponse.body).toHaveProperty('member_id', createResponse.body.member_id);
      expect(resumeResponse.body).toHaveProperty('role', 'admin');
      expect(resumeResponse.body.current_round).toBeTruthy();
    });

    it('admin should see their group on the my-groups page', async () => {
      if (!dbAvailable) return;

      await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ group_name: 'My Groups Test', max_members: 4 })
        .expect(201);

      const myGroupsResponse = await request(app)
        .get('/api/groups/my-groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(myGroupsResponse.body).toHaveProperty('groups');
      expect(Array.isArray(myGroupsResponse.body.groups)).toBe(true);
      expect(myGroupsResponse.body.groups.length).toBeGreaterThan(0);
    });
  });

  describe('State Transition Flow', () => {
    it('should list available transitions for a new round in proposing state', async () => {
      if (!dbAvailable) return;

      const createResponse = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ group_name: 'State Flow Group', max_members: 5 })
        .expect(201);

      const { round_id } = createResponse.body;

      const transitionsResponse = await request(app)
        .get(`/api/rounds/${round_id}/transitions`)
        .expect(200);

      expect(transitionsResponse.body).toHaveProperty('available_transitions');
      expect(transitionsResponse.body.available_transitions).toContain('voting');
      expect(transitionsResponse.body.available_transitions).toContain('cancelled');
    });

    it('should transition a round from proposing to cancelled', async () => {
      if (!dbAvailable) return;

      const createResponse = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ group_name: 'Cancel Flow Group', max_members: 5 })
        .expect(201);

      const { round_id, member_id } = createResponse.body;

      const transitionResponse = await request(app)
        .post(`/api/rounds/${round_id}/transition`)
        .set('x-actor-id', member_id)
        .send({ target_state: 'cancelled' })
        .expect(200);

      expect(transitionResponse.body).toHaveProperty('status', 'cancelled');
    });
  });

  describe('Voting Status Flow', () => {
    it('should get voting status for an existing round', async () => {
      if (!dbAvailable) return;

      const createResponse = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ group_name: 'Vote Status Group', max_members: 5 })
        .expect(201);

      const { round_id } = createResponse.body;

      const statusResponse = await request(app)
        .get(`/api/rounds/${round_id}/votes/status`)
        .expect(200);

      expect(statusResponse.body).toHaveProperty('votes_cast');
      expect(statusResponse.body).toHaveProperty('total_eligible');
      expect(statusResponse.body).toHaveProperty('voting_closed');
    });
  });

  describe('Rating Flow', () => {
    it('should return 400 for invalid rating value', async () => {
      const fakeProposalId = '00000000-0000-0000-0000-000000000000';
      const fakeMemberId = '00000000-0000-0000-0000-000000000001';

      const response = await request(app)
        .post(`/api/proposals/${fakeProposalId}/rating`)
        .send({ member_id: fakeMemberId, rating: 6 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for missing rating field', async () => {
      const fakeProposalId = '00000000-0000-0000-0000-000000000000';
      const fakeMemberId = '00000000-0000-0000-0000-000000000001';

      const response = await request(app)
        .post(`/api/proposals/${fakeProposalId}/rating`)
        .send({ member_id: fakeMemberId })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});
