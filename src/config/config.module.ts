import { Module } from '@nestjs/common';
import { AppConfigService } from './config.service';
import { ConfigController } from './config.controller';

@Module({
  controllers: [ConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}