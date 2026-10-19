import { pool } from '@cinevote/storage';
import { logger } from './logger.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      const message = lastError.message.toLowerCase();
      const isDeadlock = message.includes('deadlock') ||
                         message.includes('could not obtain lock');

      if (!isDeadlock || attempt === maxRetries - 1) {
        throw lastError;
      }

      logger.warn('Retrying after deadlock', { attempt: attempt + 1 });
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

export async function acquireAdvisoryLock(key: string): Promise<boolean> {
  const keyHash = hashToInt(key);

  const result = await pool.query(
    `SELECT pg_try_advisory_lock($1)`,
    [keyHash]
  );

  return result.rows[0].pg_try_advisory_lock;
}

export async function releaseAdvisoryLock(key: string): Promise<boolean> {
  const keyHash = hashToInt(key);

  const result = await pool.query(
    `SELECT pg_advisory_unlock($1)`,
    [keyHash]
  );

  return result.rows[0].pg_advisory_unlock;
}

export async function withAdvisoryLock<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const acquired = await acquireAdvisoryLock(key);

  if (!acquired) {
    throw new Error('Could not acquire lock');
  }

  try {
    return await operation();
  } finally {
    await releaseAdvisoryLock(key);
  }
}

function hashToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}