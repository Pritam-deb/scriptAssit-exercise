import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, Not } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { ITaskRepository } from './interfaces/task-repository.interface';
import { ITaskQueueService } from './interfaces/task-queue.interface';
import { retry } from '@common/utils/db.retry';

@Injectable()
export class TasksService {
  constructor(
    @Inject('ITaskRepository')
    private readonly tasksRepository: ITaskRepository,
    @Inject('ITaskQueueService')
    private readonly taskQueueService: ITaskQueueService,
  ) { }

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const task = await this.tasksRepository.create(createTaskDto);
      const savedTask = await queryRunner.manager.save(task);

      await this.taskQueueService.enqueueStatusUpdate(savedTask.id, savedTask.status);

      await queryRunner.commitTransaction();
      return savedTask;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      Logger.error('Failed to enqueue task status update:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    userId: string,
    cursor: string | undefined,
    pageSize: number,
    filter: TaskFilterDto,
  ): Promise<Task[]> {
    const whereClause: any = { user: { id: userId } };

    if (filter.status) whereClause.status = filter.status;
    if (filter.priority) whereClause.priority = filter.priority;

    if (filter.fromDate || filter.toDate) {
      whereClause.createdAt = {};
      if (filter.fromDate) whereClause.createdAt['$gte'] = new Date(filter.fromDate);
      if (filter.toDate) whereClause.createdAt['$lte'] = new Date(filter.toDate);
    }

    const query = this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .where('task.userId = :userId', { userId })
      .orderBy('task.createdAt', 'DESC')
      .take(pageSize);

    if (cursor) {
      query.andWhere('task.createdAt < :cursor', { cursor });
    }

    if (filter.status) {
      query.andWhere('task.status = :status', { status: filter.status });
    }

    if (filter.priority) {
      query.andWhere('task.priority = :priority', { priority: filter.priority });
    }

    if (filter.fromDate) {
      query.andWhere('task.createdAt >= :fromDate', { fromDate: filter.fromDate });
    }

    if (filter.toDate) {
      query.andWhere('task.createdAt <= :toDate', { toDate: filter.toDate });
    }

    if (filter.search) {
      query.andWhere('(task.title ILIKE :search OR task.description ILIKE :search)', {
        search: `%${filter.search}%`,
      });
    }

    return await retry(() => query.getMany());
  }

  async getAllTasks(): Promise<Task[]> {
    return await retry(() =>
      this.tasksRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.user', 'user')
        .orderBy('task.createdAt', 'DESC')
        .getMany(),
    );
  }

  async getTaskStats(userId?: string): Promise<any> {
    const query = this.tasksRepository
      .createQueryBuilder('task')
      .select([
        'COUNT(*) as total',
        `COUNT(*) FILTER (WHERE task.status = 'COMPLETED') as completed`,
        `COUNT(*) FILTER (WHERE task.status = 'IN_PROGRESS') as inProgress`,
        `COUNT(*) FILTER (WHERE task.status = 'PENDING') as pending`,
        `COUNT(*) FILTER (WHERE task.priority = 'HIGH') as highPriority`,
      ]);

    if (userId) {
      query.where('task.userId = :userId', { userId });
    }

    return await retry(() => query.getRawOne());
  }

  async findOne(id: string): Promise<Task> {
    const task = await retry(() =>
      this.tasksRepository.findOne({ where: { id }, relations: ['user'] }),
    );
    if (!task) {
      throw new NotFoundException(`Task not found`);
    }
    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const task = await queryRunner.manager.findOne(Task, {
        where: { id },
        relations: ['user'],
      });

      if (!task) {
        throw new NotFoundException(`Task not found`);
      }

      const originalStatus = task.status;
      Object.assign(task, updateTaskDto);
      const updatedTask = await queryRunner.manager.save(task);

      if (originalStatus !== updatedTask.status) {
        await this.taskQueueService.enqueueStatusUpdate(updatedTask.id, updatedTask.status);
      }

      await queryRunner.commitTransaction();
      return updatedTask;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      Logger.error('Failed to update task or enqueue status update:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async bulkUpdateStatus(ids: string[], status: string): Promise<Task[]> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.update(Task, ids, { status: status as TaskStatus });

      const updatedTasks = await queryRunner.manager.find(Task, {
        where: { id: In(ids) },
        relations: ['user'],
      });

      await Promise.all(
        updatedTasks.map((task: { id: string; status: string }) =>
          this.taskQueueService.enqueueStatusUpdate(task.id, task.status),
        ),
      );

      await queryRunner.commitTransaction();
      return updatedTasks;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      Logger.error('Failed to bulk update task statuses:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string): Promise<void> {
    await retry(() => this.tasksRepository.delete({ id }));
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.delete(Task, ids);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      Logger.error('Failed to bulk delete tasks:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return await retry(() =>
      this.tasksRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.user', 'user')
        .where('task.status = :status', { status })
        .orderBy('task.createdAt', 'DESC')
        .getMany(),
    );
  }

  async applyStatusUpdateFromQueue(id: string, status: string): Promise<Task> {
    await this.tasksRepository
      .createQueryBuilder('task')
      .update(Task)
      .set({ status: status as any })
      .where('id = :id', { id })
      .execute();

    return await this.findOne(id);
  }

  async getOverdueTasks(): Promise<Task[]> {
    try {
      const now = new Date();
      return await retry(() =>
        this.tasksRepository.find({
          where: {
            dueDate: LessThan(now),
            status: Not(TaskStatus.COMPLETED),
          },
          relations: ['user'],
        }),
      );
    } catch (error) {
      Logger.error('Error fetching overdue tasks', error);
      throw new Error('Failed to fetch overdue tasks');
    }
  }
  async notifyOverdueTasks(): Promise<void> {
    const overdueTasks = await this.getOverdueTasks();
    if (overdueTasks.length > 0) {
      console.log(`Notifying about ${overdueTasks.length} overdue tasks.`);
    } else {
      Logger.error('No overdue tasks to notify.');
    }
  }
}
