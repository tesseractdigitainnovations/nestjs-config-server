
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import * as dotenv from 'dotenv';
import { RequestsLoggerMiddleware } from './shared/middlewares/requests.logger';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';


async function bootstrap() {

  // Load .env file based on NODE_ENV
  const env = process.env.NODE_ENV || 'development';
  const envFile = env === 'development' ? '.env' : `.env.${env}`;
  dotenv.config({ path: envFile });

  // log startup message
  console.log('Starting application...');

  const app = await NestFactory.create(AppModule);

  // Register global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Register request logging middleware

  app.use(new RequestsLoggerMiddleware().use);

  // log app start URL
  console.log(`Application is running on: http://localhost:${process.env.PORT || 3333}`);
  await app.listen(process.env.PORT || 3333);
}
bootstrap();