import { Request, Response, NextFunction } from 'express';

// Cache middleware for GET responses
export function cacheMiddleware(duration: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = req.originalUrl;
    const cached = cache.get(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }

    // Override json method to capture and cache the response
    const originalJson = res.json.bind(res);
    res.json = (data: any) => {
      cache.set(cacheKey, { data, timestamp: Date.now() });
      return originalJson(data);
    };

    next();
  };
}

// Simple in-memory LRU-style cache
class Cache {
  private store = new Map<string, { data: any; timestamp: number }>();
  private duration: number;

  constructor(duration: number = 60000) {
    this.duration = duration;

    // Cleanup expired entries every minute; unref so it doesn't prevent process exit
    setInterval(() => this.cleanup(), 60000).unref();
  }

  get(key: string): { data: any; timestamp: number } | undefined {
    const item = this.store.get(key);

    if (!item) return undefined;

    if (Date.now() - item.timestamp > this.duration) {
      this.store.delete(key);
      return undefined;
    }

    return item;
  }

  set(key: string, data: { data: any; timestamp: number }): void {
    this.store.set(key, data);
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [key, item] of this.store) {
      if (now - item.timestamp > this.duration) {
        this.store.delete(key);
      }
    }
  }
}

export const cache = new Cache(60000); // 1 minute default
