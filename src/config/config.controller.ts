import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  PreconditionFailedException,
  UnprocessableEntityException,
  Logger,
  Headers,
} from "@nestjs/common";
import { AppConfigService } from "./config.service";
import { AuthGuard } from "../shared/guards/auth.guard";

@UseGuards(AuthGuard) // 🔒 protect all routes (if auth enabled)
@Controller("config")
export class ConfigController {
  private readonly logger = new Logger(ConfigController.name);

  constructor(private readonly configService: AppConfigService) {}

  // Get config for specific app-profile .e g. /config/auth-service/dev
  @Get(":app/:profile")
  async getConfig(
    @Param("app") app: string,
    @Param("profile") profile: string,
    @Headers() headers: Record<string, string>,
  ) {
    this.logger.log({
      msg: "Config fetch request",
      app,
      profile,
      svcName: headers["x-svc-name"] || "unknown",
      hostName: headers["x-host-name"] || "unknown",
    });

    // Anti-spoofing validation: Ensure declared x-svc-name header matches requested app profile
    const xSvcName = headers["x-svc-name"];
    if (xSvcName && xSvcName !== app) {
      this.logger.error(
        `Spoofing detected: Client declared x-svc-name '${xSvcName}' does not match requested app profile '${app}'`,
      );
      throw new UnprocessableEntityException(
        `Security Alert: Declared client header x-svc-name '${xSvcName}' does not match requested app profile '${app}'`,
      );
    }

    const config = await this.configService.getConfig(app, profile);
    if (!config) {
      throw new UnprocessableEntityException(
        `Config for ${app}-${profile} not found`,
      );
    }
    return config;
  }

  // Perform a manual/hard refresh of configs from Git
  @Post("refresh")
  async refreshConfig() {
    const isGitEnabled = this.configService.isGitEnabled();

    if (!isGitEnabled) {
      throw new PreconditionFailedException("Git integration is not enabled");
    }

    await this.configService.refreshFromGit();
    return { status: "OK", message: "Configs refreshed from Git" };
  }
}
