import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Task } from '../../tasks/entities/task.entity';
import { Exclude } from 'class-transformer';
import { Role } from '../../auth/enums/role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column()
  @Exclude({ toPlainOnly: true })
  password: string;

  @Column({ nullable: true })
  @Exclude({ toPlainOnly: true })
  refreshToken: string;

  @Index()
  @Column({
    type: 'enum',
    enum: Role,
    default: Role.User, // Use the enum
  })
  role: Role;

  @OneToMany(() => Task, task => task.user)
  tasks: Task[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
