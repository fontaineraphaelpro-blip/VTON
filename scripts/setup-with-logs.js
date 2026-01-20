// Setup script with logging for debugging
const { execSync } = require('child_process');
const fs = require('fs');

const logPath = process.env.LOG_PATH || '/tmp/setup.log';

function log(message, data = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    data,
    sessionId: 'debug-session',
    runId: 'run1',
  };
  
  // Log to file
  fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
  
  // Also log to console
  console.log(`[SETUP] ${message}`, data);
}

try {
  log('Setup script started', {
    nodeEnv: process.env.NODE_ENV,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlPreview: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : undefined,
  });

  log('Running prisma generate...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  log('prisma generate completed successfully');

  log('Running prisma migrate deploy...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  log('prisma migrate deploy completed successfully');

  log('Setup script completed successfully');
  process.exit(0);
} catch (error) {
  log('Setup script failed', {
    errorMessage: error.message,
    errorStack: error.stack,
    exitCode: error.status || 1,
  });
  console.error('[SETUP] Setup failed:', error);
  process.exit(1);
}










