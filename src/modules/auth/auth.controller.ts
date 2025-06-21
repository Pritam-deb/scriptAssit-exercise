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

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    try {
      return await this.authService.login(loginDto);
    } catch (error) {
      Logger.error('Login error:', error);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    try {
      return await this.authService.register(registerDto);
    } catch (error) {
      Logger.error('Registration error:', error);
      throw new BadRequestException('Registration failed');
    }
  }

  @Post('refresh')
  async refresh(@Body('refresh_token') refreshToken: string) {
    try {
      return await this.authService.refreshTokens(refreshToken);
    } catch (error) {
      Logger.error('Refresh token error:', error);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
