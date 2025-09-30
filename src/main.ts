
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import * as dotenv from 'dotenv';

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

  // log app start URL
  console.log(`Application is running on: http://localhost:${process.env.PORT || 3333}`);
  await app.listen(process.env.PORT || 3333);
}
bootstrap();