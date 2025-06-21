import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Index()
  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @Index()
  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority: TaskPriority;

  @Index()
  @Column({ name: 'due_date', nullable: true })
  dueDate: Date;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, user => user.tasks)
  @Index()
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Index()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
