import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) { }

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');

    const now = new Date();
    const batchSize = 100;

    const overdueTasks = await this.tasksRepository
      .createQueryBuilder('task')
      .where('task.dueDate < :now', { now })
      .andWhere('task.status IN (:...statuses)', {
        statuses: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
      })
      .limit(batchSize)
      .getMany();

    if (overdueTasks.length === 0) {
      this.logger.debug('No overdue tasks found.');
      return;
    }

    this.logger.log(`Found ${overdueTasks.length} overdue tasks`);
    this.logger.debug(`Overdue Task IDs: ${overdueTasks.map(t => t.id).join(', ')}`);

    for (const task of overdueTasks) {
      try {
        await this.taskQueue.add(
          'process-overdue-task',
          { taskId: task.id },
          {
            jobId: `overdue:${task.id}`,
          },
        );
      } catch (error) {
        this.logger.error(`Failed to enqueue overdue task ${task.id}: ${error.message}`);
      }
    }

    this.logger.debug('Overdue tasks check completed');
  }
}
