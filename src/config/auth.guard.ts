import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  
  // add bool to disable authentication if no creds provided
  private readonly authEnabled = process.env.AUTH_ENABLED === 'true';
  private readonly user = process.env.CONFIG_AUTH_USER;
  private readonly pass = process.env.CONFIG_AUTH_PASS;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    
    // Auth disabled if no creds provided
    if (!this.authEnabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const [username, password] = Buffer.from(base64Credentials, 'base64')
      .toString('utf-8')
      .split(':');

    if (username === this.user && password === this.pass) {
      return true;
    }

    throw new UnauthorizedException('Invalid credentials');
  }
}
