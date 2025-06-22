import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';
import type { IUserRepository } from './interfaces/user-repository.interface';
import { retry } from '@common/utils/retry';

@Injectable()
export class UsersService {
  constructor(
    @Inject('IUserRepository')
    private readonly usersRepository: IUserRepository,
  ) { }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const logPrefix = '[UsersService][create]';
    try {
      if (!createUserDto.email || typeof createUserDto.email !== 'string') {
        Logger.warn(`${logPrefix} Missing or invalid email in createUserDto`, createUserDto);
        throw new HttpException('Email is required and must be a string', HttpStatus.BAD_REQUEST);
      }
      if (!createUserDto.password || typeof createUserDto.password !== 'string') {
        Logger.warn(`${logPrefix} Missing or invalid password in createUserDto`, createUserDto);
        throw new HttpException(
          'Password is required and must be a string',
          HttpStatus.BAD_REQUEST,
        );
      }
      let existingUser: User | null;
      try {
        existingUser = await retry(() =>
          this.usersRepository.findOne({ where: { email: createUserDto.email } }),
        );
      } catch (findErr) {
        Logger.error(`${logPrefix} Error checking for existing user:`, findErr);
        throw new InternalServerErrorException('Could not validate user existence');
      }
      if (existingUser) {
        Logger.warn(
          `${logPrefix} Attempt to create duplicate user with email: ${createUserDto.email}`,
        );
        throw new HttpException('A user with this email already exists', HttpStatus.BAD_REQUEST);
      }
      const hashed = await bcrypt.hash(createUserDto.password, 10);
      createUserDto.password = hashed;
      let user: User;
      try {
        user = this.usersRepository.create(createUserDto);
      } catch (createErr) {
        Logger.error(`${logPrefix} Failed to initialize user entity:`, createErr);
        throw new InternalServerErrorException('Failed to create user entity');
      }
      try {
        return await this.usersRepository.save(user);
      } catch (saveErr) {
        Logger.error(`${logPrefix} Failed to save user:`, saveErr);
        throw new InternalServerErrorException('Failed to save user');
      }
    } catch (error) {
      Logger.error(`${logPrefix} Failed to create user:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Something went wrong', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findAll(limit: number, afterCursor?: string): Promise<User[]> {
    const logPrefix = '[UsersService][findAll]';
    try {
      if (!Number.isInteger(limit) || limit <= 0) {
        Logger.warn(`${logPrefix} Invalid limit: ${limit}`);
        throw new HttpException('Limit must be a positive integer', HttpStatus.BAD_REQUEST);
      }
      const query = this.usersRepository
        .createQueryBuilder('user')
        .orderBy('user.createdAt', 'DESC')
        .limit(limit);

      if (afterCursor) {
        query.where('user.createdAt < :afterCursor', { afterCursor });
      }
      try {
        return await retry(() => query.getMany());
      } catch (retryErr) {
        Logger.error(`${logPrefix} Retry failed:`, retryErr);
        throw new InternalServerErrorException('Could not retrieve user list');
      }
    } catch (error) {
      Logger.error(`${logPrefix} Failed to retrieve users:`, error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Could not retrieve user list');
    }
  }

  async findOne(id: string): Promise<User> {
    try {
      const user = await retry(() => this.usersRepository.findOne({ where: { id } }));
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    } catch (error) {
      Logger.error('Failed to find user:', error);
      throw new HttpException('Could not find user', HttpStatus.NOT_FOUND);
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const logPrefix = '[UsersService][findByEmail]';
    try {
      if (!email || typeof email !== 'string') {
        Logger.warn(`${logPrefix} Invalid email argument:`, email);
        throw new HttpException('Email must be a non-empty string', HttpStatus.BAD_REQUEST);
      }
      try {
        return await retry(() => this.usersRepository.findOne({ where: { email } }));
      } catch (retryErr) {
        Logger.error(`${logPrefix} Retry failed for email: ${email}`, retryErr);
        throw new HttpException('Could not find user', HttpStatus.NOT_FOUND);
      }
    } catch (error) {
      Logger.error(`${logPrefix} Failed to find user by email: ${email}`, error);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Could not find user', HttpStatus.NOT_FOUND);
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const logPrefix = '[UsersService][update]';
    try {
      const user = await this.ensureUserExists(id);
      if (updateUserDto.password) {
        if (typeof updateUserDto.password !== 'string' || updateUserDto.password.length === 0) {
          Logger.warn(`${logPrefix} Invalid password provided for update`, updateUserDto);
          throw new HttpException('Password must be a non-empty string', HttpStatus.BAD_REQUEST);
        }
        const hashed = await bcrypt.hash(updateUserDto.password, 10);
        updateUserDto.password = hashed;
      }
      try {
        this.usersRepository.merge(user, updateUserDto);
      } catch (mergeErr) {
        Logger.error(`${logPrefix} Failed to merge user update:`, mergeErr);
        throw new InternalServerErrorException('Could not merge user update');
      }
      // Simple validation: ensure merged user has required fields (email, etc)
      if (!user.email || typeof user.email !== 'string') {
        Logger.error(`${logPrefix} Merged user entity missing valid email`, user);
        throw new InternalServerErrorException('User entity missing valid email after update');
      }
      try {
        return await retry(() => this.usersRepository.save(user));
      } catch (saveErr) {
        Logger.error(`${logPrefix} Failed to save updated user:`, saveErr);
        throw new InternalServerErrorException('Could not save updated user');
      }
    } catch (error) {
      Logger.error(`${logPrefix} Failed to update user:`, error);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Could not update user', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async remove(id: string): Promise<void> {
    const logPrefix = '[UsersService][remove]';
    try {
      let result;
      try {
        result = await retry(() => this.usersRepository.delete({ id }));
      } catch (retryErr) {
        Logger.error(`${logPrefix} Retry failed for user delete:`, retryErr);
        throw new InternalServerErrorException('Could not delete user');
      }
      if (!result || result.affected === 0) {
        Logger.warn(`${logPrefix} No user found to delete for id: ${id}`);
        throw new NotFoundException(`No user found with id: ${id}, nothing was deleted`);
      }
    } catch (error) {
      Logger.error(`${logPrefix} Failed to delete user:`, error);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Could not delete user', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async ensureUserExists(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateRefreshToken(userId: string, hashedRefreshToken: string): Promise<void> {
    const logPrefix = '[UsersService][updateRefreshToken]';
    try {
      if (!userId || typeof userId !== 'string') {
        Logger.warn(`${logPrefix} Invalid userId:`, userId);
        throw new HttpException('userId must be a non-empty string', HttpStatus.BAD_REQUEST);
      }
      if (!hashedRefreshToken || typeof hashedRefreshToken !== 'string') {
        Logger.warn(`${logPrefix} Missing or invalid hashedRefreshToken for user ${userId}`);
        throw new HttpException('Refresh token must be a non-empty string', HttpStatus.BAD_REQUEST);
      }
      const user = await this.ensureUserExists(userId);
      user.refreshToken = hashedRefreshToken;
      try {
        await retry(() => this.usersRepository.save(user));
      } catch (retryErr) {
        Logger.error(
          `${logPrefix} Retry failed saving refresh token for user ${userId}:`,
          retryErr,
        );
        throw new InternalServerErrorException('Could not update refresh token');
      }
    } catch (error) {
      Logger.error(`${logPrefix} Failed to update refresh token for user ${userId}:`, error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Could not update refresh token');
    }
  }
}
