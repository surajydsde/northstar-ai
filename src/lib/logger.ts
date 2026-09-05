export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export type LogContext = Record<string, unknown>;

const sink = console as unknown as Record<string, (...args: unknown[]) => void>;

function write(level: LogLevel, message: string, context: LogContext = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  sink[level]?.(JSON.stringify(entry));
}

export const logger = {
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
  debug: (message: string, context?: LogContext) => write('debug', message, context),
};

export default logger;

