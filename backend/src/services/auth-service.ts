import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool, insertUser, findUserByEmail, findUserByUsername, findUserById } from '@cinevote/storage';
import config from '../config/index.js';
import type { JwtPayload } from '../middleware/auth.js';

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '7d';

export interface RegisterData {
  email: string;
  username: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
}

function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export async function register(data: RegisterData): Promise<AuthResult> {
  const existingEmail = await findUserByEmail(data.email);
  if (existingEmail) throw Object.assign(new Error('Email already in use'), { status: 409 });

  const existingUsername = await findUserByUsername(data.username);
  if (existingUsername) throw Object.assign(new Error('Username already taken'), { status: 409 });

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  const client = await pool.connect();
  try {
    const user = await insertUser(client, {
      email: data.email.toLowerCase(),
      username: data.username.toLowerCase(),
      passwordHash,
    });

    const payload: JwtPayload = { userId: user.id, email: user.email, username: user.username };
    return {
      token: signToken(payload),
      user: { id: user.id, email: user.email, username: user.username },
    };
  } catch (err: unknown) {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === '23505') {
      if (pgErr.constraint?.includes('username')) {
        throw Object.assign(new Error('Username already taken'), { status: 409 });
      }
      if (pgErr.constraint?.includes('email')) {
        throw Object.assign(new Error('Email already in use'), { status: 409 });
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function login(data: LoginData): Promise<AuthResult> {
  const user = await findUserByEmail(data.email);
  if (!user) throw Object.assign(new Error('Invalid email or password'), { status: 401 });

  const valid = await bcrypt.compare(data.password, user.password_hash);
  if (!valid) throw Object.assign(new Error('Invalid email or password'), { status: 401 });

  const payload: JwtPayload = { userId: user.id, email: user.email, username: user.username };
  return {
    token: signToken(payload),
    user: { id: user.id, email: user.email, username: user.username },
  };
}

export async function getMe(userId: string): Promise<AuthResult['user'] | null> {
  const user = await findUserById(userId);
  if (!user) return null;
  return { id: user.id, email: user.email, username: user.username };
}
