import { Injectable, NotFoundException, Inject, Logger, BadRequestException } from '@nestjs/common';
import { In, LessThan, Not } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { TaskStatus } from './enums/task-status.enum';
import type { ITaskRepository } from './interfaces/task-repository.interface';
import type { ITaskQueueService } from './interfaces/task-queue.interface';
import { retry } from '@common/utils/retry';

@Injectable()
export class TasksService {
  constructor(
    @Inject('ITaskRepository')
    private readonly tasksRepository: ITaskRepository,
    @Inject('ITaskQueueService')
    private readonly taskQueueService: ITaskQueueService,
  ) { }

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Start a manual DB transaction for atomic task creation and queueing
    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const task = await this.tasksRepository.create(createTaskDto);
      const savedTask = await queryRunner.manager.save(task);

      await retry(() => this.taskQueueService.enqueueStatusUpdate(savedTask.id, savedTask.status));

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
    if (!pageSize || pageSize <= 0) {
      Logger.warn(`Invalid pageSize provided: ${pageSize}`);
      return [];
    }

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

    try {
      return await retry(() => query.getMany());
    } catch (err) {
      Logger.error('Error fetching tasks in findAll:', err);
      return [];
    }
  }

  async getAllTasks(): Promise<Task[]> {
    try {
      return await retry(() =>
        this.tasksRepository
          .createQueryBuilder('task')
          .leftJoinAndSelect('task.user', 'user')
          .orderBy('task.createdAt', 'DESC')
          .getMany(),
      );
    } catch (err) {
      Logger.error('Error fetching all tasks:', err);
      return [];
    }
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

    try {
      const rawResult = await retry(() => query.getRawOne());
      return rawResult ?? { total: 0, completed: 0, inProgress: 0, pending: 0, highPriority: 0 };
    } catch (err) {
      Logger.error('Error fetching task stats:', err);
      return { total: 0, completed: 0, inProgress: 0, pending: 0, highPriority: 0 };
    }
  }

  async findOne(id: string): Promise<Task> {
    try {
      const task = await retry(() =>
        this.tasksRepository.findOne({ where: { id }, relations: ['user'] }),
      );
      if (!task) {
        throw new NotFoundException(`Task not found`);
      }
      return task;
    } catch (err) {
      Logger.error(`Error finding task with id ${id}:`, err);
      throw err;
    }
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    if (
      updateTaskDto.status &&
      !Object.values(TaskStatus).includes(updateTaskDto.status as TaskStatus)
    ) {
      throw new BadRequestException(`Invalid status value: ${updateTaskDto.status}`);
    }

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
        await retry(() =>
          this.taskQueueService.enqueueStatusUpdate(updatedTask.id, updatedTask.status),
        );
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
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array must be non-empty');
    }
    if (!Object.values(TaskStatus).includes(status as TaskStatus)) {
      throw new BadRequestException(`Invalid status value: ${status}`);
    }

    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.update(Task, ids, { status: status as TaskStatus });

      const updatedTasks = await queryRunner.manager.find(Task, {
        where: { id: In(ids) },
        relations: ['user'],
      });

      await retry(() =>
        Promise.all(
          updatedTasks.map((task: { id: string; status: string }) =>
            this.taskQueueService.enqueueStatusUpdate(task.id, task.status),
          ),
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
    try {
      const deleteResult = await retry(() => this.tasksRepository.delete({ id }));
      if (deleteResult.affected === 0) {
        throw new NotFoundException(`Task not found for deletion`);
      }
    } catch (err) {
      Logger.error(`Failed to delete task with id ${id}:`, err);
      throw err;
    }
  }

  async bulkDelete(ids: string[]): Promise<void> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array must be non-empty');
    }

    const queryRunner = this.tasksRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const deleteResult = await queryRunner.manager.delete(Task, ids);
      if (deleteResult.affected === 0) {
        throw new NotFoundException('No tasks found for bulk deletion');
      }
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
    try {
      return await retry(() =>
        this.tasksRepository
          .createQueryBuilder('task')
          .leftJoinAndSelect('task.user', 'user')
          .where('task.status = :status', { status })
          .orderBy('task.createdAt', 'DESC')
          .getMany(),
      );
    } catch (err) {
      Logger.error(`Error fetching tasks by status ${status}:`, err);
      return [];
    }
  }

  async applyStatusUpdateFromQueue(id: string, status: string): Promise<Task> {
    try {
      const updateResult = await this.tasksRepository
        .createQueryBuilder('task')
        .update(Task)
        .set({ status: status as any })
        .where('id = :id', { id })
        .execute();

      if (updateResult.affected === 0) {
        throw new NotFoundException(`Task not found for status update from queue`);
      }

      return await this.findOne(id);
    } catch (err) {
      Logger.error(`Failed to apply status update from queue for task ${id}:`, err);
      throw err;
    }
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
  async notifyOverdueTasks(task: Task): Promise<void> {
    // Log only if task is truly overdue and not already completed
    if (!task) {
      Logger.error('No task provided to notifyOverdueTasks');
      return;
    }
    if (task.dueDate && task.dueDate < new Date() && task.status !== TaskStatus.COMPLETED) {
      Logger.log(`Notifying about overdue task with id ${task.id} and title "${task.title}".`);
    } else {
      Logger.log(`Task with id ${task.id} is not overdue or already completed.`);
    }
  }
}
