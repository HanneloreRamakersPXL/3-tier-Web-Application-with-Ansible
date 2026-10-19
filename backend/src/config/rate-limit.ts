export const rateLimitConfig = {
  sessionResume: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many requests. Please try again later.',
  },

  global: {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },
};

export default rateLimitConfig;
