import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from '../src/modules/tasks/tasks.controller';
import { TasksService } from '../src/modules/tasks/tasks.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { CreateTaskDto } from '../src/modules/tasks/dto/create-task.dto';
import { Role } from '../src/modules/auth/enums/role.enum';
import { User } from '../src/modules/users/entities/user.entity';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { Task } from '../src/modules/tasks/entities/task.entity';
import { TaskStatus } from '../src/modules/tasks/enums/task-status.enum';
import { TaskPriority } from '../src/modules/tasks/enums/task-priority.enum';
import { UpdateTaskDto } from '../src/modules/tasks/dto/update-task.dto';

// Mock TasksService
const mockTasksService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getTaskStats: jest.fn(),
  bulkUpdateStatus: jest.fn(),
  bulkDelete: jest.fn(),
};

// Create mock objects using a more robust pattern to avoid TS errors
const mockUser = Object.assign(new User(), {
  id: 'user-id-1',
  email: 'test@example.com',
  name: 'Test User',
  role: Role.User,
  password: 'hashedpassword',
  refreshToken: 'refreshtoken',
  tasks: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const mockAdminUser = Object.assign(new User(), {
  ...mockUser,
  id: 'admin-id-1',
  role: Role.Admin,
});

const mockTask = Object.assign(new Task(), {
  id: 'task-id-1',
  title: 'Test Task',
  description: 'A test task',
  status: TaskStatus.PENDING,
  priority: TaskPriority.MEDIUM,
  dueDate: new Date(),
  userId: mockUser.id,
  user: mockUser,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: mockTasksService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a task for the current user', async () => {
      const createTaskDto: CreateTaskDto = { title: 'New Task', userId: mockUser.id };
      mockTasksService.create.mockResolvedValue(mockTask);
      const result = await controller.create(createTaskDto, mockUser);
      expect(service.create).toHaveBeenCalledWith(createTaskDto);
      expect(result).toEqual(mockTask);
    });

    it('should throw ForbiddenException if a user tries to create a task for another user', async () => {
      const createTaskDto: CreateTaskDto = { title: 'New Task', userId: 'another-user-id' };
      await expect(controller.create(createTaskDto, mockUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('should return a task if the user is the owner', async () => {
      mockTasksService.findOne.mockResolvedValue(mockTask);
      const result = await controller.findOne(mockTask.id, mockUser);
      expect(service.findOne).toHaveBeenCalledWith(mockTask.id);
      expect(result).toEqual(mockTask);
    });

    it('should throw ForbiddenException if the user is not the owner', async () => {
      const differentUserTask = { ...mockTask, userId: 'another-user-id' };
      mockTasksService.findOne.mockResolvedValue(differentUserTask);
      await expect(controller.findOne(differentUserTask.id, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should update a task if the user is the owner', async () => {
      const updateDto: UpdateTaskDto = { title: 'Updated Title' };
      mockTasksService.findOne.mockResolvedValue(mockTask); // For ownership check
      mockTasksService.update.mockResolvedValue({ ...mockTask, ...updateDto });

      const result = await controller.update(mockTask.id, updateDto, mockUser);

      expect(service.update).toHaveBeenCalledWith(mockTask.id, updateDto);
      expect(result.title).toEqual('Updated Title');
    });

    it("should throw ForbiddenException when updating another user's task", async () => {
      const differentUserTask = { ...mockTask, userId: 'another-user-id' };
      mockTasksService.findOne.mockResolvedValue(differentUserTask);
      const updateDto: UpdateTaskDto = { title: 'Updated Title' };

      await expect(controller.update(differentUserTask.id, updateDto, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a task if the user is the owner', async () => {
      mockTasksService.findOne.mockResolvedValue(mockTask);
      mockTasksService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(mockTask.id, mockUser);

      expect(service.remove).toHaveBeenCalledWith(mockTask.id);
      expect(result.statusCode).toEqual(HttpStatus.OK);
    });

    it("should throw ForbiddenException when deleting another user's task", async () => {
      const differentUserTask = { ...mockTask, userId: 'another-user-id' };
      mockTasksService.findOne.mockResolvedValue(differentUserTask);

      await expect(controller.remove(differentUserTask.id, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('batchProcess', () => {
    it('should call bulkUpdateStatus for the "complete" action', async () => {
      const operations = { tasks: ['task-1', 'task-2'], action: 'complete' };
      mockTasksService.bulkUpdateStatus.mockResolvedValue([]);

      await controller.batchProcess(operations, mockUser);

      expect(service.bulkUpdateStatus).toHaveBeenCalledWith(operations.tasks, TaskStatus.COMPLETED);
    });

    it('should call bulkDelete for the "delete" action', async () => {
      const operations = { tasks: ['task-1', 'task-2'], action: 'delete' };
      mockTasksService.bulkDelete.mockResolvedValue(undefined);

      await controller.batchProcess(operations, mockUser);

      expect(service.bulkDelete).toHaveBeenCalledWith(operations.tasks);
    });

    it('should throw BadRequestException for an unsupported action', async () => {
      const operations = { tasks: ['task-1'], action: 'archive' };
      await expect(controller.batchProcess(operations, mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
