import { Router, Request, Response } from 'express';
import { register, login, getMe } from '../services/auth-service.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { logger } from '../services/logger.js';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) {
    res.status(400).json({ error: 'email, username, and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  try {
    const result = await register({ email, username, password });
    res.status(201).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    logger.error('[auth] register error', { message: e.message });
    res.status(e.status ?? 500).json({ error: e.message ?? 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  try {
    const result = await login({ email, password });
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    logger.error('[auth] login error', { message: e.message });
    res.status(e.status ?? 500).json({ error: e.message ?? 'Internal server error' });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await getMe(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

export default router;
