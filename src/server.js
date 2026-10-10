const { config, assertRuntimeConfig } = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const app = require('./app');

async function start() {
  assertRuntimeConfig();
  await connectDatabase(config.mongoUri);
  const server = app.listen(config.port, () => {
    console.log(`Solar Generation API listening on port ${config.port}`);
  });

  const shutdown = async signal => {
    console.log(`${signal} received; shutting down.`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}

if (require.main === module) {
  start().catch(error => {
    console.error('API startup failed:', error.message);
    process.exit(1);
  });
}

module.exports = { start };
