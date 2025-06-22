import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { retry } from '../../common/utils/retry';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) { }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    if (!email || typeof email !== 'string') {
      throw new UnauthorizedException('Email must be provided and be a string');
    }
    if (!password || typeof password !== 'string') {
      throw new UnauthorizedException('Password must be provided and be a string');
    }

    try {
      const user = await retry(() => this.usersService.findByEmail(email));

      if (!user) {
        throw new UnauthorizedException('Invalid email or user does not exist');
      }

      const passwordValid = await bcrypt.compare(password, user.password);

      if (!passwordValid) {
        throw new UnauthorizedException('Invalid password');
      }

      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };
      const accessToken = this.jwtService.sign(payload, { expiresIn: '30m' });
      const refreshToken = this.jwtService.sign(payload, { expiresIn: '1d' });
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
      await retry(() => this.usersService.updateRefreshToken(user.id, hashedRefreshToken));
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new UnauthorizedException(`Login failed: ${error.message}`);
      } else {
        throw new UnauthorizedException('Login failed: Unknown error');
      }
    }
  }

  async register(registerDto: RegisterDto) {
    const { email } = registerDto;

    if (!email || typeof email !== 'string') {
      throw new UnauthorizedException('Email must be provided and be a string');
    }
    // Simple email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new UnauthorizedException('Invalid email format');
    }

    try {
      const existingUser = await retry(() => this.usersService.findByEmail(email));

      if (existingUser) {
        throw new UnauthorizedException('Email already exists');
      }

      const user = await retry(() => this.usersService.create(registerDto));

      const token = this.generateToken(user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      };
    } catch (error) {
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      throw new UnauthorizedException(`Registration failed: ${errorMessage}`);
    }
  }

  private generateToken(userId: string) {
    const payload = { sub: userId };
    return this.jwtService.sign(payload, { expiresIn: '30m' });
  }

  async validateUser(userId: string): Promise<any> {
    try {
      const user = await retry(() => this.usersService.findOne(userId));

      if (!user) {
        return null;
      }

      return user;
    } catch {
      return null;
    }
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    if (!userId || !Array.isArray(requiredRoles) || requiredRoles.length === 0) {
      return false;
    }
    try {
      const user = await retry(() => this.usersService.findOne(userId));
      if (!user || !user.role) {
        return false;
      }
      return requiredRoles.includes(user.role);
    } catch {
      return false;
    }
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token must be a non-empty string');
    }
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await retry(() => this.usersService.findOne(payload.sub));

      if (!user) {
        throw new UnauthorizedException('User not found for provided token');
      }
      if (!user.refreshToken) {
        throw new UnauthorizedException('No refresh token stored for user');
      }

      const isTokenMatching = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isTokenMatching) {
        throw new UnauthorizedException('Refresh token does not match stored token');
      }

      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };

      const newAccessToken = this.jwtService.sign(newPayload, { expiresIn: '30m' });
      const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '1d' });

      const hashedNewRefreshToken = await bcrypt.hash(newRefreshToken, 10);
      await retry(() => this.usersService.updateRefreshToken(user.id, hashedNewRefreshToken));

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
      };
    } catch (err) {
      let errorMessage = 'Unknown error';
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      throw new UnauthorizedException(`Invalid or expired refresh token: ${errorMessage}`);
    }
  }
}
