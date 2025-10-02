// requests.logger.ts for file based logging in json format
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RequestsLoggerMiddleware implements NestMiddleware {

  // Ensure logs directory exists relative to process working directory (Docker-ready)
  constructor() {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  // Static method to get log file path based on current date (Docker-ready)
  private static getLogFilePath(): string {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(process.cwd(), 'logs', `requests-${dateStr}.log`);
  }

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        userAgent: req.headers['user-agent'] || '',
        ip: req.ip,
      };
      
      const logFilePath = RequestsLoggerMiddleware.getLogFilePath();
      fs.appendFile(logFilePath, JSON.stringify(logEntry) + '\n', (err) => {
        if (err) {
          console.error('Failed to write request log:', err);
        }

      console.log('Request logged:', logEntry, 'file:', logFilePath);
      });
    });
    next();
  }
}
// To use this middleware, import and apply it in your main.ts or app.module.ts / wherever you set up your NestJS application.
// Example in main.ts:
// import { RequestsLoggerMiddleware } from './middlewares/requests.logger';
// app.use(new RequestsLoggerMiddleware().use);