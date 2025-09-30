import { Controller, Get, Param, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { AppConfigService } from './config.service';
import { AuthGuard } from './auth.guard';

@UseGuards(AuthGuard) // 🔒 protect all routes (if auth enabled)
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: AppConfigService) {}

  // Get config for specific app-profile .e g. /config/auth-service/dev
  @Get(':app/:profile')
  async getConfig(@Param('app') app: string, @Param('profile') profile: string) {
    const config = await this.configService.getConfig(app, profile);
    if (!config) {
      throw new NotFoundException(`Config for ${app}-${profile} not found`);
    }
    return config;
  }

  // Perform a manual/hard refresh of configs from Git
  @Post('refresh')
  async refreshConfig() {
    await this.configService.refreshFromGit();
    return { status: 'OK', message: 'Configs refreshed from Git' };
  }
}
