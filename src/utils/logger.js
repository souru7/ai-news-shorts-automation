const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOGS_DIR, 'app.log');

// Memory buffer for quick dashboard access
const memoryLogs = [];
const MAX_MEMORY_LOGS = 200;

function sanitize(data) {
  if (!data) return data;
  if (typeof data === 'string') {
    return data
      .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
      .replace(/(key=)[a-zA-Z0-9_\-]+/gi, '$1[REDACTED]')
      .replace(/(token=)[a-zA-Z0-9_\-]+/gi, '$1[REDACTED]')
      .replace(/(refresh_token['"]?\s*:\s*['"])[^'"]+/gi, '$1[REDACTED]');
  }
  if (typeof data === 'object') {
    const clean = Array.isArray(data) ? [] : {};
    for (const [k, v] of Object.entries(data)) {
      if (/password|secret|token|key|auth|credential/i.test(k)) {
        clean[k] = '[REDACTED]';
      } else if (typeof v === 'object') {
        clean[k] = sanitize(v);
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }
  return data;
}

function writeLog(level, message, meta = null) {
  const timestamp = new Date().toISOString();
  const cleanMeta = meta ? sanitize(meta) : null;
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...(cleanMeta ? { meta: cleanMeta } : {})
  };

  const line = `[${timestamp}] [${logEntry.level}] ${message} ${cleanMeta ? JSON.stringify(cleanMeta) : ''}\n`;

  // Console output
  if (level === 'error') {
    console.error(line.trim());
  } else if (level === 'warn') {
    console.warn(line.trim());
  } else {
    console.log(line.trim());
  }

  // File output
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (err) {
    // Ignore file write error if filesystem readonly
  }

  // Dashboard memory buffer
  memoryLogs.unshift(logEntry);
  if (memoryLogs.length > MAX_MEMORY_LOGS) {
    memoryLogs.pop();
  }
}

const logger = {
  info: (msg, meta) => writeLog('info', msg, meta),
  warn: (msg, meta) => writeLog('warn', msg, meta),
  error: (msg, meta) => writeLog('error', msg, meta),
  debug: (msg, meta) => {
    if (process.env.DEBUG || process.env.NODE_ENV !== 'production') {
      writeLog('debug', msg, meta);
    }
  },
  getRecentLogs: () => [...memoryLogs]
};

module.exports = logger;
