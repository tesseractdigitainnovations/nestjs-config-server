import { Module } from '@nestjs/common';
import { AppConfigService } from './config.service';
import { ConfigController } from './config.controller';
import { AuthGuard } from './auth.guard';

@Module({
  controllers: [ConfigController],
  providers: [AppConfigService, AuthGuard],
  exports: [AppConfigService],
})
export class ConfigModule {}