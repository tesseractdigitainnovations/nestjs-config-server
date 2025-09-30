
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';


@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // Intercept the response finish event to wrap all outgoing responses
    const oldJson = response.json;
    response.json = (body: any) => {
      // If already wrapped, don't double wrap
      if (body && body.statusCode && body.timeStamp && body.requestId) {
        return oldJson.call(response, body);
      }
      const statusCode = response.statusCode || body?.statusCode || 200;
      const requestId = request.headers['x-request-id'] || request.id || crypto.randomUUID();
      const timeStamp = new Date().toISOString();
      // If error format, preserve error
      if (body && body.error) {
        return oldJson.call(response, {
          statusCode,
          timeStamp,
          requestId,
          error: body.error,
          message: body.message,
        });
      }
      return oldJson.call(response, {
        statusCode,
        timeStamp,
        requestId,
        data: body,
      });
    };

    return next.handle().pipe(
      map((data) => data)
    );
  }
}
