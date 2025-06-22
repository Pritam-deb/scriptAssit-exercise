import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ClassSerializerInterceptor,
  UseInterceptors,
  NotFoundException,
  HttpStatus,
  Query,
  Request,
  ForbiddenException,
  Logger,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { Throttle } from '@nestjs/throttler';

@ApiTags('users')
@Controller('users')
@UseInterceptors(ClassSerializerInterceptor)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  async create(@Body() createUserDto: CreateUserDto) {
    try {
      return await this.usersService.create(createUserDto);
    } catch (error) {
      Logger.error('Failed to create user:', error);
      throw new BadRequestException('User creation failed');
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Get()
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Find all users' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'CreatedAt timestamp of the last item from previous page',
  })
  async findAll(@Query('cursor') cursor?: string, @Query('limit') limit?: number) {
    try {
      const pageSize = limit ? parseInt(limit as any, 10) : 10;
      if (isNaN(pageSize) || pageSize <= 0) {
        throw new BadRequestException('Invalid pagination limit');
      }
      return await this.usersService.findAll(pageSize, cursor);
    } catch (error) {
      Logger.error('Failed to retrieve users:', error);
      throw new NotFoundException('Failed to retrieve users');
    }
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id')
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Get a user with ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    const user = await this.usersService.findOne(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (req.user.role !== 'admin' && req.user.id !== id) {
      throw new ForbiddenException('You are not authorized to access this user');
    }

    return user;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Update a user with ID' })
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req: any) {
    const user = await this.usersService.findOne(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (req.user.role !== 'admin' && req.user.id !== id) {
      throw new ForbiddenException('You are not authorized to update this user');
    }

    try {
      return await this.usersService.update(id, updateUserDto);
    } catch (error) {
      Logger.error(`Failed to update user ${id}:`, error);
      throw new BadRequestException('User update failed');
    }
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @Throttle({ default: { limit: 5, ttl: 10 } })
  @ApiOperation({ summary: 'Delete a user' })
  async remove(@Param('id') id: string, @Request() req: any) {
    try {
      const user = await this.usersService.findOne(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      if (req.user.role !== 'admin' && req.user.id !== id) {
        throw new ForbiddenException('You are not authorized to delete this user');
      }
      await this.usersService.remove(id);
      Logger.log(`User ${id} deleted by ${req.user.id}`);
      return {
        statusCode: HttpStatus.OK,
        message: 'User deleted successfully',
      };
    } catch (error) {
      Logger.error(`Failed to delete user with ID ${id}:`, error);
      throw new NotFoundException('Failed to delete user');
    }
  }
}
