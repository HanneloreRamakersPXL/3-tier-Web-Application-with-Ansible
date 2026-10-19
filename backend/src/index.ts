import { createServer } from 'http';
import app from './app.js';
import config from './config/index.js';
import { logger } from './services/logger.js';
import { pool, closePool } from '@cinevote/storage';
import { initSocket } from './services/socket.js';

let server: ReturnType<typeof createServer> | null = null;

async function runMigrations(): Promise<void> {
  logger.info('Running startup migrations...');
  const client = await pool.connect();
  try {
    // Ensure users table exists (handles fresh DB or DB initialized before migration 006)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Add user_id FK to members if it doesn't already exist
    await client.query(`
      ALTER TABLE members ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL
    `);

    // Indexes (IF NOT EXISTS is safe to re-run)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id)`);

    // Drop the removed display_name column if a previous migration left it behind
    await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS display_name`);

    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', error);
    throw error;
  } finally {
    client.release();
  }
}

async function startServer() {
  try {
    logger.info('Testing database connection...');
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    logger.info('Database connected', {
      current_time: result.rows[0].current_time,
      pg_version: result.rows[0].pg_version.split(' ')[0],
    });

    await runMigrations();

    const httpServer = createServer(app);
    initSocket(httpServer);
    server = httpServer;

    httpServer.listen(config.PORT, () => {
      logger.info('='.repeat(50));
      logger.info('CineVote API server started');
      logger.info(`Environment: ${config.NODE_ENV}`);
      logger.info(`Port: ${config.PORT}`);
      logger.info(`Database: ${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`);
      logger.info(`CORS Origin: ${config.CORS_ORIGIN}`);
      logger.info('='.repeat(50));
    });

    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.PORT} is already in use`);
        process.exit(1);
      }
      throw error;
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  try {
    await closePool();
  } catch (error) {
    logger.error('Error closing database pool', error);
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
  process.exit(1);
});

startServer();
