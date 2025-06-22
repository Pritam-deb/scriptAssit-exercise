import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { User } from '../entities/user.entity';

export interface IUserRepository {
  createQueryBuilder(alias: string): any;
  merge(user: User, updateUserDto: UpdateUserDto): unknown;
  findOne(options: any): Promise<User | null>;
  findAll(limit: number, afterCursor?: string): Promise<User[]>;
  create(createUserDto: CreateUserDto): User;
  save(user: User): Promise<User>;
  delete(criteria: any): Promise<any>;
}
