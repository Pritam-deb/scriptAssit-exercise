import {
  Body,
  Controller,
  Post,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60 } }) // Rate limit: 5 requests per minute
  async login(@Body() loginDto: LoginDto) {
    try {
      return await this.authService.login(loginDto);
    } catch (error) {
      Logger.error('Login error:', error);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async register(@Body() registerDto: RegisterDto) {
    try {
      return await this.authService.register(registerDto);
    } catch (error) {
      Logger.error('Registration error:', error);
      throw new BadRequestException('Registration failed');
    }
  }

  @Post('refresh')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async refresh(@Body('refresh_token') refreshToken: string) {
    try {
      return await this.authService.refreshTokens(refreshToken);
    } catch (error) {
      Logger.error('Refresh token error:', error);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
