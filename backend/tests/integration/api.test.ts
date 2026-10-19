import request from 'supertest';
import app from '../../src/app.js';
import { checkDatabaseHealth } from '@cinevote/storage';

let dbAvailable = false;
let authToken = '';

const testUser = {
  email: `apitest-${Date.now()}@test.com`,
  username: `apitest${Date.now()}`,
  password: 'TestPassword123!',
};

beforeAll(async () => {
  dbAvailable = await checkDatabaseHealth();
  if (dbAvailable) {
    const res = await request(app).post('/api/auth/register').send(testUser);
    authToken = res.body.token ?? '';
  }
});

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('should return health status with required fields', async () => {
      const response = await request(app).get('/api/health');

      // 200 when DB connected, 503 when disconnected — both are valid
      expect([200, 503]).toContain(response.status);
      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('db');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should return 200 with db=connected when database is available', async () => {
      if (!dbAvailable) return;

      const response = await request(app).get('/api/health').expect(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.db).toBe('connected');
    });

    it('should return detailed health endpoint', async () => {
      const response = await request(app).get('/api/health/detailed');
      expect([200, 503]).toContain(response.status);
    });
  });

  describe('Group API', () => {
    it('should create a new group and return 201 with all fields', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ group_name: 'API Test Group', max_members: 5 })
        .expect(201);

      expect(response.body).toHaveProperty('group_id');
      expect(response.body).toHaveProperty('group_name', 'API Test Group');
      expect(response.body).toHaveProperty('invite_code');
      expect(response.body).toHaveProperty('admin_code');
      expect(response.body).toHaveProperty('member_id');
      expect(response.body).toHaveProperty('member_code');
      expect(response.body).toHaveProperty('round_id');
      expect(response.body).toHaveProperty('max_members', 5);
    });

    it('should return 401 when creating a group without auth', async () => {
      const response = await request(app)
        .post('/api/groups')
        .send({ group_name: 'Test Group', max_members: 5 })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for missing group_name', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ max_members: 5 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for empty group_name', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ group_name: '', max_members: 5 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for group_name exceeding 255 characters', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ group_name: 'a'.repeat(256), max_members: 5 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for max_members below minimum', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ group_name: 'Test Group', max_members: 1 })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Join Group API', () => {
    it('should return 404 for non-existent invite code', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ invite_code: 'ZZZZZZ' })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for missing invite_code', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 when joining without auth', async () => {
      const response = await request(app)
        .post('/api/groups/join')
        .send({ invite_code: 'ABCDEF' })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Session Resume API', () => {
    it('should return 404 for invalid invite code', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/groups/resume')
        .send({ invite_code: 'ZZZZZZ', member_code: 'invalidcode123' })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for missing member_code', async () => {
      const response = await request(app)
        .post('/api/groups/resume')
        .send({ invite_code: 'ABCDEF' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Movie Search API', () => {
    it('should return 400 when query parameter is absent', async () => {
      const response = await request(app)
        .get('/api/search/movies')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for empty query string', async () => {
      const response = await request(app)
        .get('/api/search/movies?q=')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for query exceeding 200 characters', async () => {
      const response = await request(app)
        .get(`/api/search/movies?q=${'a'.repeat(201)}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for malformed JSON body', async () => {
      const response = await request(app)
        .post('/api/groups')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toBeDefined();
    });

    it('should return 404 for non-existent route', async () => {
      const response = await request(app)
        .get('/api/this-route-does-not-exist')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 when x-actor-id header is missing on state transition', async () => {
      const fakeRoundId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .post(`/api/rounds/${fakeRoundId}/transition`)
        .send({ target_state: 'voting' })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for invalid target_state on transition', async () => {
      const fakeRoundId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .post(`/api/rounds/${fakeRoundId}/transition`)
        .set('x-actor-id', 'some-actor')
        .send({ target_state: 'invalid_state' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});
