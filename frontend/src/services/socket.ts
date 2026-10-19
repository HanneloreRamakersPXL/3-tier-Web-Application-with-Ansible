import { io, Socket } from 'socket.io-client';

// Dev: verbind rechtstreeks met backend (port 3000) om Vite-proxy te omzeilen.
// Prod/Docker: gebruik zelfde origin ('') zodat nginx de /socket.io route proxiet.
const SOCKET_URL: string =
  (import.meta.env.VITE_SOCKET_URL as string | undefined) ||
  (import.meta.env.DEV ? 'http://localhost:3000' : '');

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    console.log('[Socket] Connecting to:', SOCKET_URL || window.location.origin);
    socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected, id:', socket!.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });
  }
  return socket;
}

export function joinRound(roundId: string): void {
  console.log('[Socket] Joining round:', roundId);
  getSocket().emit('join_round', roundId);
}

export function leaveRound(roundId: string): void {
  getSocket().emit('leave_round', roundId);
}

export function joinGroup(groupId: string): void {
  console.log('[Socket] Joining group:', groupId);
  getSocket().emit('join_group', groupId);
}

export function leaveGroup(groupId: string): void {
  getSocket().emit('leave_group', groupId);
}
