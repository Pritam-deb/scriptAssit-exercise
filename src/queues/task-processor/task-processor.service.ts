import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';

@Injectable()
@Processor('task-processing', { concurrency: 5 })
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);
        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error) {
      // Basic error logging without proper handling or retries
      this.logger.error(
        `Error processing job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error; // Simply rethrows the error without any retry strategy
    }
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;

    if (!taskId || !status) {
      return { success: false, error: 'Missing required data' };
    }

    // Inefficient: No validation of status values
    // No transaction handling
    // No retry mechanism
    try {
      const task = await this.tasksService.applyStatusUpdateFromQueue(taskId, status);
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
    // // Inefficient implementation with no batching or chunking for large datasets
    // this.logger.debug('Processing overdue tasks notification');

    // // The implementation is deliberately basic and inefficient
    // // It should be improved with proper batching and error handling
    // return { success: true, message: 'Overdue tasks processed' };
    try {
      const allOverdueTasks = await this.tasksService.getOverdueTasks();
      const chunkSize = 50;

      for (let i = 0; i < allOverdueTasks.length; i += chunkSize) {
        const batch = allOverdueTasks.slice(i, i + chunkSize);
        this.logger.debug(`Processing overdue batch: ${i} to ${i + batch.length}`);

        await Promise.all(batch.map(task => this.tasksService.notifyOverdueTasks()));
      }

      return { success: true, processed: allOverdueTasks.length };
    } catch (error) {
      this.logger.error('Failed to process overdue tasks', error);
      throw new Error('Overdue task processing failed');
    }
  }
}
