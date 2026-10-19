import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import config from '../config/index.js';
import { logger } from './logger.js';

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    logger.info('Socket connected', { id: socket.id });

    socket.on('join_round', (roundId: string) => {
      socket.join(`round:${roundId}`);
      logger.info('Socket joined round room', { id: socket.id, roundId });
    });

    socket.on('leave_round', (roundId: string) => {
      socket.leave(`round:${roundId}`);
    });

    socket.on('join_group', (groupId: string) => {
      socket.join(`group:${groupId}`);
      logger.info('Socket joined group room', { id: socket.id, groupId });
    });

    socket.on('leave_group', (groupId: string) => {
      socket.leave(`group:${groupId}`);
    });

    socket.on('disconnect', () => {
      logger.info('Socket disconnected', { id: socket.id });
    });
  });

  return io;
}

export function emitToRound(roundId: string, event: string, data: unknown): void {
  if (!io) return;
  logger.info('Emitting to round', { event, roundId });
  io.to(`round:${roundId}`).emit(event, data);
}

export function emitToGroup(groupId: string, event: string, data: unknown): void {
  if (!io) return;
  logger.info('Emitting to group', { event, groupId });
  io.to(`group:${groupId}`).emit(event, data);
}
