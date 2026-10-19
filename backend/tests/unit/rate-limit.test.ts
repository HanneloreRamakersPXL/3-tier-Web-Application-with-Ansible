import {
  createRateLimiter,
  resetRateLimit,
} from '../../src/middleware/rate-limit.js';

const createMockReq = (body: { invite_code: string }) => ({
  body,
  headers: {},
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
} as any);

const createMockRes = () => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
  return res;
};

describe('Rate Limit Middleware', () => {
  beforeEach(() => {
    resetRateLimit('127.0.0.1', 'TEST123');
  });

  it('should allow first request', async () => {
    const middleware = createRateLimiter({ windowMs: 60000, maxRequests: 10 });
    const req = createMockReq({ invite_code: 'TEST123' });
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should block 11th request', async () => {
    const middleware = createRateLimiter({ windowMs: 60000, maxRequests: 10 });
    const req = createMockReq({ invite_code: 'TEST123' });
    const res = createMockRes();
    const next = jest.fn();

    for (let i = 0; i < 10; i++) {
      await middleware(req, res, next);
    }

    res.status.mockClear();
    res.json.mockClear();
    res.set.mockClear();
    next.mockClear();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) })
    );
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('should track different groups separately', async () => {
    const middleware = createRateLimiter({ windowMs: 60000, maxRequests: 10 });

    const reqA = createMockReq({ invite_code: 'GROUP_A' });
    const resA = createMockRes();
    const nextA = jest.fn();

    for (let i = 0; i < 10; i++) {
      await middleware(reqA, resA, nextA);
    }

    const reqB = createMockReq({ invite_code: 'GROUP_B' });
    const resB = createMockRes();
    const nextB = jest.fn();

    await middleware(reqB, resB, nextB);

    expect(nextB).toHaveBeenCalled();
  });

  it('should include Retry-After header', async () => {
    const middleware = createRateLimiter({ windowMs: 60000, maxRequests: 10 });
    const req = createMockReq({ invite_code: 'TEST123' });
    const res = createMockRes();
    const next = jest.fn();

    for (let i = 0; i < 10; i++) {
      await middleware(req, res, next);
    }

    res.status.mockClear();
    res.json.mockClear();
    res.set.mockClear();
    next.mockClear();

    await middleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});
