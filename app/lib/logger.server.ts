/**
 * Logger utility - Only logs in development mode
 * In production, logs are suppressed to avoid exposing sensitive information
 */

const isDevelopment = process.env.NODE_ENV !== "production";

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  
  error: (...args: any[]) => {
    // Always log errors, even in production (but can be filtered by log level)
    console.error(...args);
  },
  
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
};











