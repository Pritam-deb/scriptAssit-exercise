import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) { }

  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      const [existingUser] = await Promise.all([
        this.usersRepository.findOne({ where: { email: createUserDto.email } }),
        bcrypt.hash(createUserDto.password, 10),
      ]).then(([user, hashed]) => {
        createUserDto.password = hashed;
        return [user];
      });

      if (existingUser) {
        throw new Error('A user with this email already exists');
      }

      const user = this.usersRepository.create(createUserDto);
      return await this.usersRepository.save(user);
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
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

      return await query.getMany();
    } catch (error) {
      console.error('Failed to retrieve users:', error);
      throw new InternalServerErrorException('Could not retrieve user list');
    }
  }

  async findOne(id: string): Promise<User> {
    try {
      const user = await this.usersRepository.findOne({ where: { id } });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    } catch (error) {
      console.error('Failed to find user:', error);
      throw error instanceof NotFoundException ? error : new Error('Could not fetch user');
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.usersRepository.findOne({ where: { email } });
    } catch (error) {
      console.error(`Failed to find user by email: ${email}`, error);
      throw new Error('Could not fetch user by email');
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
      return await this.usersRepository.save(user);
    } catch (error) {
      console.error(`Failed to update user:`, error);
      throw error instanceof NotFoundException ? error : new Error('Could not update user');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const result = await this.usersRepository.delete({ id });
      if (result.affected === 0) {
        throw new NotFoundException('User not found');
      }
    } catch (error) {
      console.error(`Failed to delete user:`, error);
      throw error instanceof NotFoundException ? error : new Error('Could not delete user');
    }
  }

  private async ensureUserExists(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
