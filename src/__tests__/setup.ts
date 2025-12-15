/**
 * Jest Test Setup
 *
 * This file runs before each test file.
 * It sets up the test environment, mocks, and global configurations.
 */

import { Sequelize } from 'sequelize';

// ============================================
// Environment Configuration
// ============================================

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing';
process.env.DATABASE_URL = 'mysql://root:test@localhost:3306/mc_exchange_test';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.API_URL = 'http://localhost:3000';
process.env.RESEND_API_KEY = 'test-resend-api-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

// ============================================
// Global Mocks
// ============================================

// Mock Redis
jest.mock('ioredis', () => {
  const Redis = jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-1),
    exists: jest.fn().mockResolvedValue(0),
    hget: jest.fn().mockResolvedValue(null),
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue({}),
    pipeline: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    }),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
    status: 'ready',
  }));
  return Redis;
});

// Mock Resend
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ id: 'test-email-id' }),
    },
  })),
}));

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
      update: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
      del: jest.fn().mockResolvedValue({ id: 'cus_test123', deleted: true }),
    },
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test123',
        client_secret: 'pi_test123_secret',
        status: 'requires_payment_method',
      }),
      retrieve: jest.fn().mockResolvedValue({ id: 'pi_test123' }),
      confirm: jest.fn().mockResolvedValue({ id: 'pi_test123', status: 'succeeded' }),
      cancel: jest.fn().mockResolvedValue({ id: 'pi_test123', status: 'canceled' }),
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({ id: 'sub_test123' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'sub_test123' }),
      update: jest.fn().mockResolvedValue({ id: 'sub_test123' }),
      cancel: jest.fn().mockResolvedValue({ id: 'sub_test123' }),
    },
    refunds: {
      create: jest.fn().mockResolvedValue({ id: 're_test123' }),
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test123' } },
      }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test123',
          url: 'https://checkout.stripe.com/test',
        }),
      },
    },
  }));
});

// Mock Winston logger
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  audit: jest.fn(),
  security: jest.fn(),
  performance: jest.fn(),
  http: jest.fn(),
  child: jest.fn().mockReturnThis(),
}));

// ============================================
// Test Database Setup
// ============================================

let testSequelize: Sequelize | null = null;

/**
 * Get test database connection
 */
export const getTestSequelize = (): Sequelize => {
  if (!testSequelize) {
    testSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
    });
  }
  return testSequelize;
};

/**
 * Sync test database
 */
export const syncTestDatabase = async (): Promise<void> => {
  const sequelize = getTestSequelize();
  await sequelize.sync({ force: true });
};

/**
 * Close test database
 */
export const closeTestDatabase = async (): Promise<void> => {
  if (testSequelize) {
    await testSequelize.close();
    testSequelize = null;
  }
};

// ============================================
// Test Utilities
// ============================================

/**
 * Create a mock user object
 */
export const createMockUser = (overrides = {}) => ({
  id: 'user-test-123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'buyer',
  status: 'active',
  emailVerified: true,
  totalCredits: 10,
  usedCredits: 0,
  stripeCustomerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Create a mock listing object
 */
export const createMockListing = (overrides = {}) => ({
  id: 'listing-test-123',
  sellerId: 'user-test-123',
  mcNumber: '123456',
  companyName: 'Test Trucking LLC',
  dotNumber: '789012',
  status: 'active',
  askingPrice: 50000,
  description: 'Test listing description',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Create a mock offer object
 */
export const createMockOffer = (overrides = {}) => ({
  id: 'offer-test-123',
  listingId: 'listing-test-123',
  buyerId: 'user-test-456',
  sellerId: 'user-test-123',
  amount: 45000,
  status: 'pending',
  message: 'Test offer message',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Create a mock transaction object
 */
export const createMockTransaction = (overrides = {}) => ({
  id: 'transaction-test-123',
  listingId: 'listing-test-123',
  offerId: 'offer-test-123',
  buyerId: 'user-test-456',
  sellerId: 'user-test-123',
  amount: 45000,
  status: 'pending',
  depositAmount: 4500,
  platformFee: 2250,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Wait for a specified time
 */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate a random string
 */
export const randomString = (length: number = 10): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Generate a random email
 */
export const randomEmail = (): string => `test-${randomString(8)}@example.com`;

// ============================================
// Global Hooks
// ============================================

beforeAll(async () => {
  // Any global setup before all tests
  jest.clearAllMocks();
});

afterAll(async () => {
  // Clean up after all tests
  await closeTestDatabase();
});

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  jest.restoreAllMocks();
});

// ============================================
// Console Error Suppression (optional)
// ============================================

// Suppress console.error for expected errors in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    // Filter out expected error messages
    const message = args[0]?.toString() || '';
    if (
      message.includes('Expected error') ||
      message.includes('test error')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
});

// ============================================
// Extend Jest Matchers
// ============================================

expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// TypeScript declaration for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}
