import { Sequelize } from 'sequelize';
import config from './index';

// Create Sequelize instance
const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: 'mysql',
    logging: config.nodeEnv === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: false,
    },
    dialectOptions: {
      // Use socket connection on macOS for local development
      socketPath: process.env.DB_SOCKET_PATH || '/tmp/mysql.sock',
    },
  }
);

// Test database connection
export const connectDatabase = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');

    // Sync models - use force: false to only create missing tables
    // Using alter: true causes duplicate index issues in MySQL
    if (config.nodeEnv === 'development') {
      await sequelize.sync({ force: false });
      console.log('Database models synchronized');
    }
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
