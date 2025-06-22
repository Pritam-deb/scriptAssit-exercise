import { describe, it, expect, beforeEach, jest, mock } from 'bun:test';
import { TasksService } from '../src/modules/tasks/tasks.service';
import { NotFoundException } from '@nestjs/common';
import { TaskStatus } from '../src/modules/tasks/enums/task-status.enum';
import { TaskPriority } from '../src/modules/tasks/enums/task-priority.enum';
import { ITaskRepository } from '../src/modules/tasks/interfaces/task-repository.interface';
import { ITaskQueueService } from '../src/modules/tasks/interfaces/task-queue.interface';
import { Role } from '@modules/auth/enums/role.enum';
const mockTaskRepo = {
  manager: {
    connection: {
      createQueryRunner: () => ({
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          save: jest.fn(),
          findOne: jest.fn(),
          find: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
      }),
    },
  },
  create: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getRawOne: jest.fn(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn().mockReturnThis(),
  })),
  findOne: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
};

const mockQueueService = {
  enqueueStatusUpdate: jest.fn(),
};

const taskExample = {
  id: '1',
  title: 'Test Task',
  description: 'Test Desc',
  status: TaskStatus.PENDING,
  createdAt: new Date(),
  updatedAt: new Date(),
  priority: TaskPriority.HIGH,
  dueDate: new Date(Date.now() + 86400000), // 1 day from now
  userId: 'user1',
  user: {
    id: 'user1',
    email: 'user1@example.com',
    name: 'User One',
    password: 'hashedpassword',
    refreshToken: 'sometoken',
    role: Role.User,
    createdAt: new Date(),
    updatedAt: new Date(),
    tasks: [],
  },
};

let service: TasksService;

beforeEach(() => {
  service = new TasksService(mockTaskRepo as any, mockQueueService as any);
});

describe('TasksService', () => {
  it('should find one task by id', async () => {
    mockTaskRepo.findOne.mockResolvedValue(taskExample);
    const task = await service.findOne('1');
    expect(task).toEqual(taskExample);
  });

  it('should throw if task not found', async () => {
    mockTaskRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('2')).rejects.toThrow(NotFoundException);
  });

  it('should return overdue tasks', async () => {
    const now = new Date();
    mockTaskRepo.find.mockResolvedValue([taskExample]);
    const tasks = await service.getOverdueTasks();
    expect(tasks.length).toBe(1);
  });

  it('should notify if there are overdue tasks', async () => {
    mockTaskRepo.find.mockResolvedValue([taskExample]);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    await service.notifyOverdueTasks(taskExample);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Notifying about/));
    logSpy.mockRestore();
  });

  it('should not notify if no overdue tasks', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    mockTaskRepo.find.mockResolvedValue([]);
    await service.notifyOverdueTasks(taskExample);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/No overdue tasks/));
    errorSpy.mockRestore();
  });
});
