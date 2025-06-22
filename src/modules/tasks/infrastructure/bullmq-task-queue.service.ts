import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ITaskQueueService } from '../interfaces/task-queue.interface';

@Injectable()
export class BullMqTaskQueueService implements ITaskQueueService {
  constructor(@InjectQueue('task-processing') private readonly queue: Queue) { }

  async enqueueStatusUpdate(taskId: string, status: string): Promise<void> {
    try {
      await this.queue.add(
        'task-status-update',
        { taskId, status },
        {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 10000,
          },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      console.warn(
        `Failed to enqueue task-status-update for task ${taskId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
