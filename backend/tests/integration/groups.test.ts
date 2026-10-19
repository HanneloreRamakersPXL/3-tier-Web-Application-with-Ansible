import request from 'supertest';
import app from '../../src/app.js';
import { checkDatabaseHealth } from '@cinevote/storage';

let dbAvailable = false;
let authToken = '';

beforeAll(async () => {
  dbAvailable = await checkDatabaseHealth();
  if (dbAvailable) {
    const ts = Date.now();
    const res = await request(app).post('/api/auth/register').send({
      email: `groups-${ts}@test.com`,
      username: `groupstest${ts}`,
      password: 'TestPassword123!',
    });
    authToken = res.body.token ?? '';
  }
});

describe('POST /api/groups', () => {
  it('should create a group and return 201', async () => {
    if (!dbAvailable) return;

    const response = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ group_name: 'Test Group', max_members: 5 });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('group_id');
    expect(response.body).toHaveProperty('group_name');
    expect(response.body).toHaveProperty('invite_code');
    expect(response.body).toHaveProperty('admin_code');
    expect(response.body).toHaveProperty('member_id');
    expect(response.body).toHaveProperty('member_code');
    expect(response.body).toHaveProperty('round_id');
    expect(response.body).toHaveProperty('max_members', 5);
  });

  it('should return 401 without auth token', async () => {
    const response = await request(app)
      .post('/api/groups')
      .send({ group_name: 'Test Group', max_members: 5 });

    expect(response.status).toBe(401);
  });

  it('should return 400 for empty group name', async () => {
    if (!dbAvailable) return;

    const response = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ group_name: '', max_members: 5 });

    expect(response.status).toBe(400);
  });

  it('should return 400 for group name > 255 chars', async () => {
    if (!dbAvailable) return;

    const response = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ group_name: 'a'.repeat(256), max_members: 5 });

    expect(response.status).toBe(400);
  });

  it('should return 400 for max_members below 2', async () => {
    if (!dbAvailable) return;

    const response = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ group_name: 'Test Group', max_members: 1 });

    expect(response.status).toBe(400);
  });

  it('should return 400 for max_members above 20', async () => {
    if (!dbAvailable) return;

    const response = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ group_name: 'Test Group', max_members: 21 });

    expect(response.status).toBe(400);
  });
});
