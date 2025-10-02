import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

/**
 * Global exception filter that catches all exceptions and formats them into a standard response
 * @class GlobalExceptionFilter
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  /**
   * Catches and formats all exceptions
   * @param exception - The caught exception
   * @param host - The arguments host
   */
  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = exception.message;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();
      message = typeof responseBody === 'string' 
        ? responseBody 
        : typeof responseBody === 'object' && responseBody !== null && 'message' in responseBody
        ? Array.isArray(responseBody.message)
          ? responseBody.message.join(', ')
          : String(responseBody.message)
        : message;
    }

    const duration = Date.now() - (request.startTime || Date.now());
    
    const errorResponse = {
      data: null,
      error: {
        message: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: exception.stack })
      },
      statusCode: status,
      success: false,
      path: request.url,
      timestamp: new Date().toISOString(),
      duration
    };

    response.status(status).json(errorResponse);
  }
}