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

    const user = await retry(() => this.usersService.findByEmail(email));

    if (!user) {
      throw new UnauthorizedException('Invalid email');
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
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await retry(() => this.usersService.findByEmail(registerDto.email));

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
  }

  private generateToken(userId: string) {
    const payload = { sub: userId };
    return this.jwtService.sign(payload, { expiresIn: '30m' });
  }

  async validateUser(userId: string): Promise<any> {
    const user = await retry(() => this.usersService.findOne(userId));

    if (!user) {
      return null;
    }

    return user;
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    return true;
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await retry(() => this.usersService.findOne(payload.sub));

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid token');
      }

      const isTokenMatching = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isTokenMatching) {
        throw new UnauthorizedException('Refresh token mismatch');
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
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
