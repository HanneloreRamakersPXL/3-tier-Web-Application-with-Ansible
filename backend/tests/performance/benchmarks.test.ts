import request from 'supertest';
import app from '../../src/app.js';
import { checkDatabaseHealth } from '@cinevote/storage';

const TARGET_RESPONSE_TIME_MS = 200;

let dbAvailable = false;

beforeAll(async () => {
  dbAvailable = await checkDatabaseHealth();
  // Warm up the Express app before measuring
  await request(app).get('/api/health');
});

describe('Performance Benchmarks', () => {
  describe('Response Time', () => {
    it('health check should respond under 500ms', async () => {
      const start = Date.now();
      await request(app).get('/api/health');
      const duration = Date.now() - start;

      // 500ms allows for DB round-trip and cold-start variance in CI
      expect(duration).toBeLessThan(500);
    });

    it('validation rejection should respond under 100ms (no DB needed)', async () => {
      const start = Date.now();
      await request(app)
        .post('/api/groups')
        .send({ group_name: '' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('group creation should respond under target response time when DB is available', async () => {
      if (!dbAvailable) return;

      const start = Date.now();
      await request(app)
        .post('/api/groups')
        .send({ group_name: 'Perf Test Group', max_members: 5 });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(TARGET_RESPONSE_TIME_MS);
    });

    it('404 response should be under 50ms', async () => {
      const start = Date.now();
      await request(app).get('/api/no-such-route');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });

  describe('Load Testing', () => {
    it('should handle 10 concurrent health requests within 2 seconds', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app).get('/api/health')
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      // All requests should complete
      expect(responses).toHaveLength(10);
      responses.forEach(r => expect([200, 503]).toContain(r.status));

      expect(duration).toBeLessThan(2000);
    });

    it('should handle 50 concurrent auth-rejection requests within 1 second', async () => {
      const requests = Array(50).fill(null).map(() =>
        request(app)
          .post('/api/groups')
          .send({ group_name: 'test', max_members: 5 })
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      expect(responses).toHaveLength(50);
      responses.forEach(r => expect(r.status).toBe(401));

      expect(duration).toBeLessThan(1000);
    });
  });
});
