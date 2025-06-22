import { Test, TestingModule } from '@nestjs/testing';

import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '@modules/auth/auth.service';
import { LoginDto } from '@modules/auth/dto/login.dto';
import { RegisterDto } from '@modules/auth/dto/register.dto';
import { UsersService } from '../src/modules/users/users.service';
import { retry } from '../src/common/utils/retry';
import { mock, describe, it, expect, beforeEach, afterEach, jest } from 'bun:test';

mock.module('../users/users.service', () => ({
  UsersService: class MockUsersService { },
}));

// Mocking the bcrypt library
mock.module('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

mock.module('../src/common/utils/retry', () => ({
  retry: jest.fn((fn: () => any) => fn()),
}));
describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  // Mock implementations for dependencies
  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    updateRefreshToken: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);

    // Clear all mocks before each test to ensure test isolation
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // --- Login Tests ---
  describe('login', () => {
    it('should return tokens and user info on successful login', async () => {
      const loginDto: LoginDto = { email: 'test@example.com', password: 'password123' };
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'user',
      };

      (usersService.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwtService.sign as jest.Mock)
        .mockReturnValueOnce('mockAccessToken')
        .mockReturnValueOnce('mockRefreshToken');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedRefreshToken');

      const result = await service.login(loginDto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, mockUser.password);
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        mockUser.id,
        'hashedRefreshToken',
      );
      expect(result).toEqual({
        access_token: 'mockAccessToken',
        refresh_token: 'mockRefreshToken',
        user: { id: '1', email: 'test@example.com', role: 'user' },
      });
      // Ensure retry was used
      expect(retry).toHaveBeenCalledTimes(2);
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      const loginDto: LoginDto = { email: 'wrong@example.com', password: 'password123' };
      (usersService.findByEmail as jest.Mock).mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid email'),
      );
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const loginDto: LoginDto = { email: 'test@example.com', password: 'wrongpassword' };
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'user',
      };

      (usersService.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid password'),
      );
    });
  });

  // --- Register Tests ---
  describe('register', () => {
    it('should create a user and return user info and token', async () => {
      const registerDto: RegisterDto = {
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
      };
      const mockUser = { id: '2', email: 'new@example.com', name: 'New User', role: 'user' };

      (usersService.findByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.create as jest.Mock).mockResolvedValue(mockUser);
      (jwtService.sign as jest.Mock).mockReturnValue('mockToken');

      const result = await service.register(registerDto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(usersService.create).toHaveBeenCalledWith(registerDto);
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: mockUser.id }, { expiresIn: '30m' });
      expect(result).toEqual({
        user: { id: '2', email: 'new@example.com', name: 'New User', role: 'user' },
        token: 'mockToken',
      });
      expect(retry).toHaveBeenCalledTimes(2);
    });

    it('should throw UnauthorizedException if email already exists', async () => {
      const registerDto: RegisterDto = {
        email: 'exists@example.com',
        password: 'password123',
        name: 'Existing User',
      };
      const mockExistingUser = { id: '3', email: 'exists@example.com' };

      (usersService.findByEmail as jest.Mock).mockResolvedValue(mockExistingUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        new UnauthorizedException('Email already exists'),
      );
    });
  });

  // --- Validate User Tests ---
  describe('validateUser', () => {
    it('should return the user if found', async () => {
      const mockUser = { id: '1', email: 'test@example.com' };
      (usersService.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.validateUser('1');

      expect(usersService.findOne).toHaveBeenCalledWith('1');
      expect(result).toEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      (usersService.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.validateUser('unknown-id');

      expect(result).toBeNull();
    });
  });

  // --- Refresh Tokens Tests ---
  describe('refreshTokens', () => {
    it('should return new tokens if refresh token is valid', async () => {
      const refreshToken = 'validRefreshToken';
      const payload = { sub: '1', email: 'test@example.com', role: 'user' };
      const user = {
        id: '1',
        email: 'test@example.com',
        role: 'user',
        refreshToken: 'hashedOldRefreshToken',
      };

      (jwtService.verify as jest.Mock).mockReturnValue(payload);
      (usersService.findOne as jest.Mock).mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwtService.sign as jest.Mock)
        .mockReturnValueOnce('newAccessToken')
        .mockReturnValueOnce('newRefreshToken');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedNewRefreshToken');

      const result = await service.refreshTokens(refreshToken);

      expect(jwtService.verify).toHaveBeenCalledWith(refreshToken);
      expect(usersService.findOne).toHaveBeenCalledWith(payload.sub);
      expect(bcrypt.compare).toHaveBeenCalledWith(refreshToken, user.refreshToken);
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        user.id,
        'hashedNewRefreshToken',
      );
      expect(result).toEqual({
        access_token: 'newAccessToken',
        refresh_token: 'newRefreshToken',
      });
    });

    it('should throw if jwtService.verify throws', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshTokens('anyToken')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('should throw if user is not found', async () => {
      const payload = { sub: '1' };
      (jwtService.verify as jest.Mock).mockReturnValue(payload);
      (usersService.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.refreshTokens('anyToken')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('should throw if refresh token does not match', async () => {
      const refreshToken = 'mismatchedToken';
      const payload = { sub: '1' };
      const user = { id: '1', refreshToken: 'hashedDbToken' };

      (jwtService.verify as jest.Mock).mockReturnValue(payload);
      (usersService.findOne as jest.Mock).mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false); // The important mock for this test

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });
  });

  // --- validateUserRoles Test ---
  describe('validateUserRoles', () => {
    it('should always return true', async () => {
      const result = await service.validateUserRoles('some-user-id', ['admin']);
      expect(result).toBe(true);
    });
  });
});
