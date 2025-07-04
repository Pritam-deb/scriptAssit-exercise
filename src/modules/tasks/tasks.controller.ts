import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  HttpException,
  HttpStatus,
  Request,
  NotFoundException,
  UsePipes,
  ValidationPipe,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { TaskFilterDto } from './dto/task-filter.dto';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@modules/auth/enums/role.enum';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class TasksController {
  constructor(private readonly tasksService: TasksService) { }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Create a new task' })
  create(@Body() createTaskDto: CreateTaskDto, @CurrentUser() user: any) {
    if (createTaskDto.userId && createTaskDto.userId !== user.id && user.role !== Role.Admin) {
      throw new ForbiddenException('You are not allowed to create task for another user');
    }

    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Find all tasks with optional filtering' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'CreatedAt timestamp of the last item from previous page',
  })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Request() req: Request,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const pageSize = limit ? parseInt(limit as any, 10) : 10;
      if (isNaN(pageSize) || pageSize <= 0) {
        throw new BadRequestException('Invalid pagination limit');
      }

      const { id: userId } = (req as any).user;
      const filter: TaskFilterDto = {
        status: status as TaskStatus,
        priority: priority as TaskPriority,
      };

      const tasks = await this.tasksService.findAll(
        userId,
        cursor,
        Math.min(pageSize, 100),
        filter,
      );

      return {
        data: tasks,
        count: tasks.length,
        limit: pageSize,
      };
    } catch (error) {
      throw new HttpException('Failed to retrieve tasks', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('stats')
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Get task statistics' })
  async getStats(@Request() req: Request) {
    const { id: userId } = (req as any).user;
    const statistics = await this.tasksService.getTaskStats(userId);
    return statistics;
  }

  @Get(':id')
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const task = await this.tasksService.findOne(id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (user.role !== Role.Admin && task.user.id !== user.id) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    return task;
  }

  @Patch(':id')
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Update a task' })
  async update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: any,
  ) {
    const task = await this.tasksService.findOne(id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (user.role !== Role.Admin && task.user.id !== user.id) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Delete a task' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const task = await this.tasksService.findOne(id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (!user || !user.id) {
      throw new BadRequestException('User not authenticated');
    }
    if (user.role !== Role.Admin && task.user.id !== user.id) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    await this.tasksService.remove(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Task successfully deleted',
    };
  }

  @Post('batch')
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  async batchProcess(
    @Body() operations: { tasks: string[]; action: string },
    @CurrentUser() user: any,
  ) {
    const { tasks: taskIds, action } = operations;

    if (!user || !user.id) {
      throw new BadRequestException('User not authenticated');
    }

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      throw new BadRequestException('No task IDs provided');
    }

    if (!['complete', 'delete'].includes(action)) {
      throw new BadRequestException(`Unsupported action: ${action}`);
    }

    try {
      let result;
      switch (action) {
        case 'complete':
          result = await this.tasksService.bulkUpdateStatus(taskIds, TaskStatus.COMPLETED);
          break;
        case 'delete':
          result = await this.tasksService.bulkDelete(taskIds);
          break;
        default:
          throw new HttpException(`Unknown action: ${action}`, HttpStatus.BAD_REQUEST);
      }

      return {
        success: true,
        affected: Array.isArray(result) ? result.length : 0,
        taskIds,
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Unknown error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
