import { Sequelize } from 'sequelize';
import config from './index';

// Parse JAWSDB_URL if available (Heroku auto-sets this for JawsDB add-on)
function parseJawsDbUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      database: parsed.pathname.slice(1), // Remove leading slash
      username: parsed.username,
      password: parsed.password,
      host: parsed.hostname,
      port: parseInt(parsed.port || '3306', 10),
    };
  } catch (error) {
    console.error('Failed to parse JAWSDB_URL:', error);
    return null;
  }
}

// Get database connection config - prefer JAWSDB_URL if available
const jawsConfig = process.env.JAWSDB_URL ? parseJawsDbUrl(process.env.JAWSDB_URL) : null;

const dbConfig = jawsConfig || {
  database: config.database.name,
  username: config.database.user,
  password: config.database.password,
  host: config.database.host,
  port: config.database.port,
};

// Build dialect options - only use socket for local development
const dialectOptions: Record<string, unknown> = {
  connectTimeout: 10000, // 10 second connection timeout
};

// Only use socket path for local development, not for production remote databases
if (config.isDevelopment && process.env.DB_SOCKET_PATH) {
  dialectOptions.socketPath = process.env.DB_SOCKET_PATH;
} else if (config.isDevelopment && config.database.host === 'localhost' && !jawsConfig) {
  // Default socket path for local macOS MySQL (only if not using JAWSDB)
  dialectOptions.socketPath = '/tmp/mysql.sock';
}
// For production/remote databases, don't use socketPath - connect via host/port

// Create Sequelize instance with config-based pool settings (not hardcoded!)
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'mysql',
    logging: config.nodeEnv === 'development' ? console.log : false,
    pool: {
      max: config.database.pool.max,      // Use config (default 5)
      min: config.database.pool.min,      // Use config (default 1)
      acquire: config.database.pool.acquire,
      idle: config.database.pool.idle,
      evict: 1000, // Check for idle connections every 1 second
    },
    retry: {
      max: 3, // Retry failed queries up to 3 times
    },
    define: {
      timestamps: true,
      underscored: false,
    },
    dialectOptions,
  }
);

// Test database connection
export const connectDatabase = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');

    // Sync models - use force: false to only create missing tables
    // Using alter: true causes duplicate index issues in MySQL
    // Sync in all environments to create tables if they don't exist
    await sequelize.sync({ force: false });
    console.log('Database models synchronized');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
};

// Graceful shutdown
export const disconnectDatabase = async (): Promise<void> => {
  await sequelize.close();
  console.log('Database disconnected');
};

export default sequelize;
