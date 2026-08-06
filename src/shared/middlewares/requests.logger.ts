// requests.logger.ts for file based logging in json format
import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class RequestsLoggerMiddleware implements NestMiddleware {
  private static readonly logger = new Logger(RequestsLoggerMiddleware.name);

  /**
   * Directory where request logs are written.
   *
   * Defaults to "./logs" for local development.
   * In Kubernetes set:
   *
   * LOG_DIR=/tmp/logs
   */
  private static readonly logDir =
    process.env.LOG_DIR || path.join(process.cwd(), "logs");

  constructor() {
    try {
      fs.mkdirSync(RequestsLoggerMiddleware.logDir, {
        recursive: true,
      });
    } catch (err) {
      RequestsLoggerMiddleware.logger.error(
        `Failed to create log directory: ${RequestsLoggerMiddleware.logDir}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private static getLogFilePath(): string {
    const date = new Date().toISOString().split("T")[0];
    return path.join(RequestsLoggerMiddleware.logDir, `requests-${date}.log`);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();

    res.on("finish", () => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration: Date.now() - start,
        userAgent: req.headers["user-agent"] ?? "",
        svcName: req.headers["x-svc-name"] ?? "unknown",
        hostName: req.headers["x-host-name"] ?? "unknown",
        ip: req.ip,
      };

      const json = JSON.stringify(logEntry);
      RequestsLoggerMiddleware.logger.log(json);

      fs.appendFile(
        RequestsLoggerMiddleware.getLogFilePath(),
        json + "\n",
        (err) => {
          if (err) {
            RequestsLoggerMiddleware.logger.error(
              "Failed to write request log",
              err.stack,
            );
          }
        },
      );
    });

    next();
  }
}
