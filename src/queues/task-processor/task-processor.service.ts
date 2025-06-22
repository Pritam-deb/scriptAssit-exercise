import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '@modules/tasks/enums/task-status.enum';
import { retry } from '@common/utils/retry';
import { DataSource } from 'typeorm';

@Injectable()
@Processor('task-processing', { concurrency: 5 })
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    const retryOptions = {
      attempts: 3,
      delayMs: 500,
      factor: 2,
    };

    try {
      return await retry(async () => {
        switch (job.name) {
          case 'task-status-update':
            return await this.handleStatusUpdate(job);
          case 'overdue-tasks-notification':
            return await this.handleOverdueTasks(job);
          default:
            this.logger.warn(`Unknown job type: ${job.name}`);
            return { success: false, error: 'Unknown job type' };
        }
      }, retryOptions);
    } catch (error) {
      this.logger.error(
        `Error processing job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;

    // Validate input and status value
    if (!taskId || !status || typeof status !== 'string') {
      return { success: false, error: 'Missing or invalid task data' };
    }

    const validStatuses = Object.values(TaskStatus);
    if (!validStatuses.includes(status as TaskStatus)) {
      return { success: false, error: 'Invalid status value' };
    }

    try {
      const task = await retry(
        async () => {
          return await this.dataSource.transaction(async () => {
            return await this.tasksService.applyStatusUpdateFromQueue(taskId, status);
          });
        },
        {
          attempts: 3,
          delayMs: 500,
          factor: 2,
        },
      );

      return {
        success: true,
        taskId: task.id,
        newStatus: task.status,
      };
    } catch (err) {
      this.logger.error(`Failed to update status for task ${taskId}`, err);
      throw err;
    }
  }

  private async handleOverdueTasks(job: Job) {
    try {
      const allOverdueTasks = await this.tasksService.getOverdueTasks();
      const chunkSize = 50;

      for (let i = 0; i < allOverdueTasks.length; i += chunkSize) {
        const batch = allOverdueTasks.slice(i, i + chunkSize);
        this.logger.debug(`Processing overdue batch: ${i} to ${i + batch.length}`);

        await Promise.all(
          batch.map(async task => {
            try {
              await this.tasksService.notifyOverdueTasks(task);
            } catch (error) {
              if (error instanceof Error) {
                this.logger.warn(`Failed to notify overdue task ${task.id}: ${error.message}`);
              } else {
                this.logger.warn(`Failed to notify overdue task ${task.id}: Unknown error`);
              }
            }
          }),
        );
      }

      return { success: true, processed: allOverdueTasks.length };
    } catch (error) {
      this.logger.error('Failed to process overdue tasks', error);
      throw new Error('Overdue task processing failed');
    }
  }
}
