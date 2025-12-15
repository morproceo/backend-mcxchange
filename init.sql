-- MC Exchange Database Initialization Script
-- This runs when the MySQL container is first created

-- Create the database if it doesn't exist (already handled by MYSQL_DATABASE env var)
-- CREATE DATABASE IF NOT EXISTS mc_exchange;

-- Ensure the user has proper permissions
GRANT ALL PRIVILEGES ON mc_exchange.* TO 'mc_user'@'%';
FLUSH PRIVILEGES;

-- Create test database for running tests
CREATE DATABASE IF NOT EXISTS mc_exchange_test;
GRANT ALL PRIVILEGES ON mc_exchange_test.* TO 'mc_user'@'%';
FLUSH PRIVILEGES;

-- Log successful initialization
SELECT 'MC Exchange database initialized successfully!' AS message;
