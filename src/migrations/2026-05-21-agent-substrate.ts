/**
 * Migration: Add the AI agent substrate (8 tables).
 *
 * Mirrors the Sequelize models appended to `src/models/index.ts` in this PR.
 * Idempotent — safe to re-run.
 *
 * Run with:
 *   JAWSDB_URL=mysql://… npx ts-node src/migrations/2026-05-21-agent-substrate.ts
 *
 * On Heroku:
 *   heroku run -a mcxchange "npx ts-node src/migrations/2026-05-21-agent-substrate.ts"
 *
 * After the tables exist, set ENABLE_AGENT_WORKER=true and restart the dyno.
 */
import { Sequelize } from 'sequelize';

const JAWSDB_URL = process.env.JAWSDB_URL;
if (!JAWSDB_URL) {
  console.error('JAWSDB_URL environment variable is required');
  process.exit(1);
}

const sequelize = new Sequelize(JAWSDB_URL, { dialect: 'mysql', logging: console.log });

async function run() {
  try {
    console.log('=== Migration: Add AI agent substrate (8 tables) ===\n');

    console.log('1. Creating agent_catalog…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS agent_catalog (
        slug VARCHAR(50) NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        category ENUM('OPERATIONS','INSIGHTS','COMMS','ORCHESTRATOR') NOT NULL,
        monthlyPrice DECIMAL(10,2) NULL,
        stripeProductId VARCHAR(255) NULL,
        stripePriceIdMonthly VARCHAR(255) NULL,
        isActive TINYINT(1) NOT NULL DEFAULT 1,
        isAdminOnly TINYINT(1) NOT NULL DEFAULT 0,
        features JSON NULL,
        configSchema JSON NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ agent_catalog ready');

    console.log('2. Creating user_agents…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS user_agents (
        id CHAR(36) NOT NULL PRIMARY KEY,
        userId CHAR(36) NOT NULL,
        agentSlug VARCHAR(50) NOT NULL,
        status ENUM('ACTIVE','PAUSED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
        subscriptionStartedAt DATETIME NULL,
        subscriptionCancelledAt DATETIME NULL,
        config JSON NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        UNIQUE KEY user_agents_user_slug (userId, agentSlug),
        INDEX user_agents_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ user_agents ready');

    console.log('3. Creating agent_inferences…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS agent_inferences (
        id CHAR(36) NOT NULL PRIMARY KEY,
        userId CHAR(36) NULL,
        agentSlug VARCHAR(50) NOT NULL,
        model VARCHAR(100) NOT NULL,
        inputTokens INT NULL,
        outputTokens INT NULL,
        latencyMs INT NULL,
        promptType VARCHAR(50) NULL,
        status ENUM('SUCCESS','ERROR','TIMEOUT') NOT NULL,
        metadata JSON NULL,
        errorMessage TEXT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX agent_inferences_user (userId),
        INDEX agent_inferences_slug_created (agentSlug, createdAt),
        INDEX agent_inferences_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ agent_inferences ready');

    console.log('4. Creating agent_actions…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS agent_actions (
        id CHAR(36) NOT NULL PRIMARY KEY,
        userId CHAR(36) NULL,
        agentSlug VARCHAR(50) NOT NULL,
        actionType VARCHAR(80) NOT NULL,
        targetType VARCHAR(50) NULL,
        targetId CHAR(36) NULL,
        inputData JSON NULL,
        outputData JSON NULL,
        status ENUM('PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'COMPLETED',
        triggeredBy VARCHAR(80) NULL,
        inferenceId CHAR(36) NULL,
        errorMessage TEXT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX agent_actions_user (userId),
        INDEX agent_actions_slug_created (agentSlug, createdAt),
        INDEX agent_actions_target (targetType, targetId),
        INDEX agent_actions_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ agent_actions ready');

    console.log('5. Creating agent_policies…');
    // Note: \`key\` is a MySQL reserved word — wrap in backticks.
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS agent_policies (
        id CHAR(36) NOT NULL PRIMARY KEY,
        scope ENUM('user','platform') NOT NULL DEFAULT 'user',
        userId CHAR(36) NULL,
        agentSlug VARCHAR(50) NOT NULL,
        \`key\` VARCHAR(80) NOT NULL,
        value JSON NOT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        UNIQUE KEY agent_policies_scope_user_slug_key (scope, userId, agentSlug, \`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ agent_policies ready');

    console.log('6. Creating agent_jobs…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS agent_jobs (
        id CHAR(36) NOT NULL PRIMARY KEY,
        userId CHAR(36) NULL,
        agentSlug VARCHAR(50) NOT NULL,
        taskName VARCHAR(80) NOT NULL,
        inputData JSON NULL,
        outputData JSON NULL,
        status ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
        priority INT NOT NULL DEFAULT 5,
        scheduledFor DATETIME NULL,
        claimedBy VARCHAR(64) NULL,
        startedAt DATETIME NULL,
        completedAt DATETIME NULL,
        errorMessage TEXT NULL,
        targetType VARCHAR(50) NULL,
        targetId CHAR(36) NULL,
        triggeredBy VARCHAR(80) NULL,
        triggeredByUserId CHAR(36) NULL,
        actionId CHAR(36) NULL,
        retryCount INT NOT NULL DEFAULT 0,
        maxRetries INT NOT NULL DEFAULT 3,
        lastErrorAt DATETIME NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX agent_jobs_status_scheduled (status, scheduledFor),
        INDEX agent_jobs_dedupe (userId, agentSlug, taskName, targetType, targetId),
        INDEX agent_jobs_slug_created (agentSlug, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ agent_jobs ready');

    console.log('7. Creating agent_conversations…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS agent_conversations (
        id CHAR(36) NOT NULL PRIMARY KEY,
        userId CHAR(36) NOT NULL,
        agentSlug VARCHAR(50) NOT NULL,
        title VARCHAR(255) NULL,
        lastMessageAt DATETIME NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX agent_conversations_user_slug_last (userId, agentSlug, lastMessageAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ agent_conversations ready');

    console.log('8. Creating agent_messages…');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id CHAR(36) NOT NULL PRIMARY KEY,
        conversationId CHAR(36) NOT NULL,
        role ENUM('USER','ASSISTANT') NOT NULL,
        content LONGTEXT NOT NULL,
        steps JSON NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX agent_messages_conv_created (conversationId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('   ✓ agent_messages ready');

    console.log('\n9. Verifying all 8 tables exist…');
    const expected = [
      'agent_catalog', 'user_agents', 'agent_inferences', 'agent_actions',
      'agent_policies', 'agent_jobs', 'agent_conversations', 'agent_messages',
    ];
    for (const t of expected) {
      const [rows] = await sequelize.query(`SHOW TABLES LIKE '${t}'`);
      if ((rows as unknown[]).length === 0) {
        throw new Error(`Verification failed: table ${t} not found after migration`);
      }
    }
    console.log('   ✓ All 8 tables verified');

    console.log('\n=== Migration complete ===');
    console.log('Next steps on the target environment:');
    console.log('  1. Set ENABLE_AGENT_WORKER=true');
    console.log('  2. Restart the dyno');
    console.log('  3. Hit GET /api/agents/catalog — should return scout + eva (auto-seeded on boot)');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
