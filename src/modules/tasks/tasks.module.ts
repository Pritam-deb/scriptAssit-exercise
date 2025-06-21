import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { TypeOrmTaskRepository } from './infrastructure/typeorm-task.repository';
import { BullMqTaskQueueService } from './infrastructure/bullmq-task-queue.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    {
      provide: 'ITaskRepository',
      useClass: TypeOrmTaskRepository,
    },
    {
      provide: 'ITaskQueueService',
      useClass: BullMqTaskQueueService,
    },
  ],
  exports: [TasksService],
})
export class TasksModule { }
