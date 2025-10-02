import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  
  private readonly authEnabled = process.env.AUTH_ENABLED === 'true';
  private readonly user = process.env.AUTH_USERNAME;
  private readonly pass = process.env.AUTH_PASSWORD;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    
    console.log('AuthGuard Debug:', {
      AUTH_ENABLED: process.env.AUTH_ENABLED,
      authEnabled: this.authEnabled,
      user: this.user ? '***set***' : 'not set',
      pass: this.pass ? '***set***' : 'not set'
    });
    
    // Auth disabled if AUTH_ENABLED is not 'true'
    if (!this.authEnabled) {
      console.log('AuthGuard: Authentication is DISABLED, allowing request');
      return true;
    }

    console.log('AuthGuard: Authentication is ENABLED, validating request...');

    // If auth is enabled but credentials are not configured, throw error
    if (!this.user || !this.pass) {
      throw new UnauthorizedException('Authentication is enabled but credentials are not configured');
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    try {
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      if (!username || !password) {
        throw new UnauthorizedException('Invalid credentials format');
      }

      if (username === this.user && password === this.pass) {
        return true;
      }

      throw new UnauthorizedException('Invalid credentials');
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Authorization header format');
    }
  }
}
