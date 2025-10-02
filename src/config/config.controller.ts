import { Controller, Get, Param, Post, UseGuards, PreconditionFailedException, UnprocessableEntityException } from '@nestjs/common';
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
      throw new UnprocessableEntityException(`Config for ${app}-${profile} not found`);
    }
    return config;
  }

  // Perform a manual/hard refresh of configs from Git
  @Post('refresh')
  async refreshConfig() {

    const isGitEnabled = this.configService.isGitEnabled();

    if (!isGitEnabled) {
      throw new PreconditionFailedException('Git integration is not enabled'); 
    }

    await this.configService.refreshFromGit();
    return { status: 'OK', message: 'Configs refreshed from Git' };
  }
}
