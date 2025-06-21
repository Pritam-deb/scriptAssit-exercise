import { CreateTaskDto } from '../dto/create-task.dto';
import { Task } from '../entities/task.entity';

export interface ITaskRepository {
    create(createTaskDto: CreateTaskDto): Promise<Task>;
    save(task: Task): Promise<Task>;
    createQueryBuilder(alias: string): any;
    findOne(options: any): Promise<Task | undefined>;
    manager: any;
    update(entityClass: any, ids: any, partialEntity: any): Promise<any>;
    find(options?: any): Promise<Task[]>;
    delete(criteria: any): Promise<any>;
}
