import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import type { IUserRepository } from './interfaces/user-repository.interface';
import { retry } from '@common/utils/retry';

@Injectable()
export class UsersService {
  constructor(
    @Inject('IUserRepository')
    private readonly usersRepository: IUserRepository,
  ) { }

  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      const existingUser = await retry(() =>
        this.usersRepository.findOne({ where: { email: createUserDto.email } }),
      );
      const hashed = await bcrypt.hash(createUserDto.password, 10);
      createUserDto.password = hashed;

      if (existingUser) {
        throw new Error('A user with this email already exists');
      }

      const user = this.usersRepository.create(createUserDto);
      return await this.usersRepository.save(user);
    } catch (error) {
      Logger.error('Failed to create user:', error);
      throw new HttpException('Something went wrong', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async findAll(limit: number, afterCursor?: string): Promise<User[]> {
    try {
      const query = this.usersRepository
        .createQueryBuilder('user')
        .orderBy('user.createdAt', 'DESC')
        .limit(limit);

      if (afterCursor) {
        query.where('user.createdAt < :afterCursor', { afterCursor });
      }

      return await retry(() => query.getMany());
    } catch (error) {
      Logger.error('Failed to retrieve users:', error);
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
    try {
      return await retry(() => this.usersRepository.findOne({ where: { email } }));
    } catch (error) {
      Logger.error(`Failed to find user by email: ${email}`, error);
      throw new HttpException('Could not find user', HttpStatus.NOT_FOUND);
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      const user = await this.ensureUserExists(id);

      if (updateUserDto.password) {
        const hashed = await bcrypt.hash(updateUserDto.password, 10);
        updateUserDto.password = hashed;
      }

      this.usersRepository.merge(user, updateUserDto);
      return await retry(() => this.usersRepository.save(user));
    } catch (error) {
      Logger.error(`Failed to update user:`, error);
      throw new HttpException('Could not update user', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const result = await retry(() => this.usersRepository.delete({ id }));
      if (result.affected === 0) {
        throw new NotFoundException('User not found');
      }
    } catch (error) {
      Logger.error(`Failed to delete user:`, error);
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
    try {
      const user = await this.ensureUserExists(userId);
      user.refreshToken = hashedRefreshToken;
      await retry(() => this.usersRepository.save(user));
    } catch (error) {
      Logger.error(`Failed to update refresh token for user ${userId}:`, error);
      throw new InternalServerErrorException('Could not update refresh token');
    }
  }
}
