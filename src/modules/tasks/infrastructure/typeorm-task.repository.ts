import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTaskDto } from '../dto/create-task.dto';
import { Task } from '../entities/task.entity';
import { ITaskRepository } from '../interfaces/task-repository.interface';

@Injectable()
export class TypeOrmTaskRepository implements ITaskRepository {
    constructor(
        @InjectRepository(Task)
        private readonly repository: Repository<Task>,
    ) { }

    create(createTaskDto: CreateTaskDto): Promise<Task> {
        const task = this.repository.create(createTaskDto);
        return Promise.resolve(task);
    }

    save(task: Task): Promise<Task> {
        return this.repository.save(task);
    }

    createQueryBuilder(alias: string) {
        return this.repository.createQueryBuilder(alias);
    }

    findOne(options: any): Promise<Task | undefined> {
        return this.repository.findOne(options).then(result => (result === null ? undefined : result));
    }

    get manager() {
        return this.repository.manager;
    }

    update(entityClass: any, ids: any, partialEntity: any): Promise<any> {
        return this.repository.update(ids, partialEntity);
    }

    find(options?: any): Promise<Task[]> {
        return this.repository.find(options);
    }

    delete(criteria: any): Promise<any> {
        return this.repository.delete(criteria);
    }
}
