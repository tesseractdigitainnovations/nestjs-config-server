import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {

  // log startup message
  console.log('Starting application...');

  const app = await NestFactory.create(AppModule);
  // log app start URL
  console.log(`Application is running on: http://localhost:${process.env.PORT || 3333}`);
  await app.listen(process.env.PORT || 3333);
}
bootstrap();