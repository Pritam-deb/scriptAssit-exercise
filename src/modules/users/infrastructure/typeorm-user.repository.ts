import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from '../dto/create-user.dto';
import { User } from '../entities/user.entity';
import { IUserRepository } from '../interfaces/user-repository.interface';

@Injectable()
export class TypeOrmUserRepository implements IUserRepository {
    constructor(
        @InjectRepository(User)
        private readonly repository: Repository<User>,
    ) { }

    findOne(options: any): Promise<User | null> {
        return this.repository.findOne(options);
    }

    findAll(limit: number, afterCursor?: string): Promise<User[]> {
        const query = this.repository
            .createQueryBuilder('user')
            .orderBy('user.createdAt', 'DESC')
            .limit(limit);

        if (afterCursor) {
            query.where('user.createdAt < :afterCursor', { afterCursor });
        }

        return query.getMany();
    }

    create(createUserDto: CreateUserDto): User {
        return this.repository.create(createUserDto);
    }

    save(user: User): Promise<User> {
        return this.repository.save(user);
    }

    delete(criteria: any): Promise<any> {
        return this.repository.delete(criteria);
    }

    createQueryBuilder(alias: string) {
        return this.repository.createQueryBuilder(alias);
    }
    merge(user: User, updateUserDto: any): User {
        return this.repository.merge(user, updateUserDto);
    }
}
