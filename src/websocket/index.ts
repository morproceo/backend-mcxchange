import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { User, UserStatus } from '../models';
import logger from '../utils/logger';
import { JWTPayload } from '../types';

// Types
interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  userName?: string;
}

interface ServerToClientEvents {
  // Notifications
  notification: (data: NotificationPayload) => void;

  // Offers
  'offer:new': (data: OfferPayload) => void;
  'offer:updated': (data: OfferPayload) => void;

  // Transactions
  'transaction:updated': (data: TransactionPayload) => void;
  'transaction:message': (data: MessagePayload) => void;

  // Listings
  'listing:updated': (data: ListingPayload) => void;

  // Messages
  'message:new': (data: MessagePayload) => void;
  'message:read': (data: { conversationId: string }) => void;

  // User status
  'user:online': (data: { userId: string }) => void;
  'user:offline': (data: { userId: string }) => void;

  // System
  error: (data: { message: string }) => void;
}

interface ClientToServerEvents {
  // Join/leave rooms
  'join:transaction': (transactionId: string) => void;
  'leave:transaction': (transactionId: string) => void;
  'join:conversation': (partnerId: string) => void;
  'leave:conversation': (partnerId: string) => void;

  // Typing indicators
  'typing:start': (data: { roomId: string }) => void;
  'typing:stop': (data: { roomId: string }) => void;

  // Presence
  ping: () => void;
}

interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  createdAt: string;
}

interface OfferPayload {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  status: string;
}

interface TransactionPayload {
  id: string;
  status: string;
  buyerId: string;
  sellerId: string;
}

interface ListingPayload {
  id: string;
  status: string;
  sellerId: string;
}

interface MessagePayload {
  id: string;
  senderId: string;
  receiverId?: string;
  content: string;
  createdAt: string;
  roomId?: string;
}

// Track online users
const onlineUsers = new Map<string, Set<string>>(); // userId -> Set of socket IDs

// Socket.io server instance
let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(httpServer: HttpServer): Server {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: config.cors.origins,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT
      const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;

      // Verify user exists and is active
      const user = await User.findByPk(decoded.id);
      if (!user || user.status !== UserStatus.ACTIVE) {
        return next(new Error('User not found or inactive'));
      }

      // Attach user info to socket
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      socket.userName = decoded.name;

      next();
    } catch (error) {
      logger.warn('WebSocket authentication failed', {
        error: (error as Error).message,
        socketId: socket.id,
      });
      next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;

    logger.info('WebSocket client connected', {
      socketId: socket.id,
      userId,
    });

    // Track online status
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Broadcast online status
    socket.broadcast.emit('user:online', { userId });

    // Handle room joining
    socket.on('join:transaction', (transactionId) => {
      socket.join(`transaction:${transactionId}`);
      logger.debug('User joined transaction room', {
        userId,
        transactionId,
      });
    });

    socket.on('leave:transaction', (transactionId) => {
      socket.leave(`transaction:${transactionId}`);
      logger.debug('User left transaction room', {
        userId,
        transactionId,
      });
    });

    socket.on('join:conversation', (partnerId) => {
      // Create a consistent room name for the conversation
      const roomId = [userId, partnerId].sort().join(':');
      socket.join(`conversation:${roomId}`);
      logger.debug('User joined conversation', {
        userId,
        partnerId,
        roomId,
      });
    });

    socket.on('leave:conversation', (partnerId) => {
      const roomId = [userId, partnerId].sort().join(':');
      socket.leave(`conversation:${roomId}`);
    });

    // Handle typing indicators
    socket.on('typing:start', ({ roomId }) => {
      socket.to(roomId).emit('typing:start' as any, {
        userId,
        userName: socket.userName,
      });
    });

    socket.on('typing:stop', ({ roomId }) => {
      socket.to(roomId).emit('typing:stop' as any, { userId });
    });

    // Handle ping for presence
    socket.on('ping', () => {
      socket.emit('pong' as any);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        userId,
        reason,
      });

      // Remove from online users
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          // Broadcast offline status only when all sockets disconnected
          socket.broadcast.emit('user:offline', { userId });
        }
      }
    });
  });

  logger.info('WebSocket server initialized');
  return io;
}

/**
 * Get WebSocket server instance
 */
export function getIO(): Server<ClientToServerEvents, ServerToClientEvents> | null {
  return io;
}

/**
 * Check if a user is online
 */
export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
}

/**
 * Get all online user IDs
 */
export function getOnlineUsers(): string[] {
  return Array.from(onlineUsers.keys());
}

// ============================================
// Emit helpers for services
// ============================================

/**
 * Send notification to a specific user
 */
export function emitToUser(userId: string, event: keyof ServerToClientEvents, data: any): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Send notification to multiple users
 */
export function emitToUsers(userIds: string[], event: keyof ServerToClientEvents, data: any): void {
  if (!io) return;
  userIds.forEach(userId => {
    io!.to(`user:${userId}`).emit(event, data);
  });
}

/**
 * Send notification to a transaction room
 */
export function emitToTransaction(transactionId: string, event: keyof ServerToClientEvents, data: any): void {
  if (!io) return;
  io.to(`transaction:${transactionId}`).emit(event, data);
}

/**
 * Send a real-time notification
 */
export function sendNotification(
  userId: string,
  notification: NotificationPayload
): void {
  emitToUser(userId, 'notification', notification);
}

/**
 * Broadcast new offer to seller
 */
export function broadcastNewOffer(sellerId: string, offer: OfferPayload): void {
  emitToUser(sellerId, 'offer:new', offer);
}

/**
 * Broadcast offer update to both parties
 */
export function broadcastOfferUpdate(
  buyerId: string,
  sellerId: string,
  offer: OfferPayload
): void {
  emitToUsers([buyerId, sellerId], 'offer:updated', offer);
}

/**
 * Broadcast transaction status update
 */
export function broadcastTransactionUpdate(
  buyerId: string,
  sellerId: string,
  transactionId: string,
  transaction: TransactionPayload
): void {
  // Emit to transaction room
  emitToTransaction(transactionId, 'transaction:updated', transaction);
  // Also emit to individual users (in case they're not in the room)
  emitToUsers([buyerId, sellerId], 'transaction:updated', transaction);
}

/**
 * Broadcast new message in transaction
 */
export function broadcastTransactionMessage(
  transactionId: string,
  message: MessagePayload
): void {
  emitToTransaction(transactionId, 'transaction:message', message);
}

/**
 * Broadcast listing update
 */
export function broadcastListingUpdate(listing: ListingPayload): void {
  if (!io) return;
  // Broadcast to all connected clients (or implement room-based broadcasting)
  io.emit('listing:updated', listing);
}

/**
 * Broadcast direct message
 */
export function broadcastDirectMessage(
  senderId: string,
  receiverId: string,
  message: MessagePayload
): void {
  // Send to receiver
  emitToUser(receiverId, 'message:new', message);
}

export default {
  initializeWebSocket,
  getIO,
  isUserOnline,
  getOnlineUsers,
  emitToUser,
  emitToUsers,
  emitToTransaction,
  sendNotification,
  broadcastNewOffer,
  broadcastOfferUpdate,
  broadcastTransactionUpdate,
  broadcastTransactionMessage,
  broadcastListingUpdate,
  broadcastDirectMessage,
};
