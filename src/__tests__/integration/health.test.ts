/**
 * Health Check API Integration Tests
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock dependencies
jest.mock('../../models', () => ({
  sequelize: {
    authenticate: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../config/redis', () => ({
  isRedisHealthy: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../config', () => ({
  config: {
    nodeEnv: 'test',
  },
  getPublicConfig: jest.fn().mockReturnValue({
    environment: 'test',
    features: {
      registration: true,
      stripe: true,
      websocket: true,
    },
  }),
}));

jest.mock('../../websocket', () => ({
  getOnlineUsers: jest.fn().mockReturnValue(['user-1', 'user-2']),
}));

jest.mock('../../services/cacheService', () => ({
  __esModule: true,
  default: {
    getStats: jest.fn().mockResolvedValue({
      totalKeys: 100,
      hitRate: 0.85,
    }),
  },
}));

import routes from '../../routes';
import { sequelize } from '../../models';
import { isRedisHealthy } from '../../config/redis';

describe('Health Check API', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return basic health status', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: 'healthy',
        message: 'MC Exchange API is running',
      });
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });

    it('should include version information', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body.version).toBeDefined();
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return ready status when all services are healthy', async () => {
      (sequelize.authenticate as jest.Mock).mockResolvedValue(undefined);
      (isRedisHealthy as jest.Mock).mockResolvedValue(true);

      const response = await request(app).get('/api/health/ready').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: 'ready',
      });
      expect(response.body.services).toHaveProperty('database');
      expect(response.body.services).toHaveProperty('redis');
      expect(response.body.services.database.status).toBe('healthy');
    });

    it('should return unhealthy status when database is down', async () => {
      (sequelize.authenticate as jest.Mock).mockRejectedValue(
        new Error('Connection failed')
      );
      (isRedisHealthy as jest.Mock).mockResolvedValue(true);

      const response = await request(app).get('/api/health/ready').expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.database.status).toBe('unhealthy');
    });

    it('should still be ready when Redis is down (optional service)', async () => {
      (sequelize.authenticate as jest.Mock).mockResolvedValue(undefined);
      (isRedisHealthy as jest.Mock).mockResolvedValue(false);

      const response = await request(app).get('/api/health/ready').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.services.redis.status).toBe('unavailable');
      expect(response.body.services.redis.required).toBe(false);
    });

    it('should include latency information', async () => {
      (sequelize.authenticate as jest.Mock).mockResolvedValue(undefined);
      (isRedisHealthy as jest.Mock).mockResolvedValue(true);

      const response = await request(app).get('/api/health/ready').expect(200);

      expect(response.body.services.database).toHaveProperty('latency');
      expect(response.body.services.redis).toHaveProperty('latency');
      expect(response.body).toHaveProperty('responseTime');
    });

    it('should include memory usage', async () => {
      (sequelize.authenticate as jest.Mock).mockResolvedValue(undefined);
      (isRedisHealthy as jest.Mock).mockResolvedValue(true);

      const response = await request(app).get('/api/health/ready').expect(200);

      expect(response.body.memory).toHaveProperty('used');
      expect(response.body.memory).toHaveProperty('total');
      expect(response.body.memory.unit).toBe('MB');
    });

    it('should include uptime', async () => {
      (sequelize.authenticate as jest.Mock).mockResolvedValue(undefined);
      (isRedisHealthy as jest.Mock).mockResolvedValue(true);

      const response = await request(app).get('/api/health/ready').expect(200);

      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
    });
  });

  describe('GET /api/health/live', () => {
    it('should return alive status', async () => {
      const response = await request(app).get('/api/health/live').expect(200);

      expect(response.body).toMatchObject({
        status: 'alive',
      });
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should respond quickly (liveness probe)', async () => {
      const startTime = Date.now();
      await request(app).get('/api/health/live').expect(200);
      const duration = Date.now() - startTime;

      // Liveness probe should be very fast
      expect(duration).toBeLessThan(100);
    });
  });

  describe('GET /api/health/stats', () => {
    it('should return server statistics', async () => {
      const response = await request(app).get('/api/health/stats').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats).toHaveProperty('uptime');
      expect(response.body.stats).toHaveProperty('memory');
      expect(response.body.stats).toHaveProperty('cpu');
      expect(response.body.stats).toHaveProperty('platform');
      expect(response.body.stats).toHaveProperty('nodeVersion');
    });

    it('should include WebSocket stats', async () => {
      const response = await request(app).get('/api/health/stats').expect(200);

      expect(response.body.stats.websocket).toHaveProperty('onlineUsers');
      expect(response.body.stats.websocket.onlineUsers).toBe(2);
    });

    it('should include cache stats', async () => {
      const response = await request(app).get('/api/health/stats').expect(200);

      expect(response.body.stats.cache).toHaveProperty('totalKeys');
      expect(response.body.stats.cache).toHaveProperty('hitRate');
    });
  });

  describe('GET /api/config', () => {
    it('should return public configuration', async () => {
      const response = await request(app).get('/api/config').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.config).toHaveProperty('environment');
      expect(response.body.config).toHaveProperty('features');
    });

    it('should not expose sensitive configuration', async () => {
      const response = await request(app).get('/api/config').expect(200);

      // Ensure no sensitive data is exposed
      expect(response.body.config).not.toHaveProperty('jwtSecret');
      expect(response.body.config).not.toHaveProperty('stripeSecretKey');
      expect(response.body.config).not.toHaveProperty('databaseUrl');
    });
  });
});
