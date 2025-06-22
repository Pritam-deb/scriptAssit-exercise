import { describe, it, expect, beforeEach, mock, jest } from 'bun:test';
import { UsersService } from '../src/modules/users/users.service';
import { NotFoundException } from '@nestjs/common';

const mockUserRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  merge: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  })),
};

mock.module('../src/modules/users/interfaces/user-repository.interface', () => ({
  IUserRepository: Symbol('IUserRepository'),
}));

mock.module('../src/common/utils/retry', () => ({
  retry: async (fn: any) => await fn(),
}));

const sampleUser = {
  id: '1',
  email: 'test@example.com',
  password: 'hashedpassword',
  refreshToken: '', // Changed from null to empty string to match type 'string'
  name: 'Test User',
  role: 'user',
  tasks: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

let service: UsersService;

beforeEach(() => {
  for (const key in mockUserRepo) {
    const typedKey = key as keyof typeof mockUserRepo;
    if (typeof mockUserRepo[typedKey] === 'function') mockUserRepo[typedKey].mockReset?.();
  }
  service = new UsersService(mockUserRepo as any);
});

describe('UsersService', () => {
  it('should return a user by id', async () => {
    mockUserRepo.findOne.mockResolvedValue(sampleUser);
    const result = await service.findOne('1');
    expect(result).toEqual(sampleUser);
  });

  it('should throw NotFoundException if user is not found', async () => {
    mockUserRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('2')).rejects.toThrow('Could not find user');
  });

  it('should create a new user', async () => {
    mockUserRepo.findOne.mockResolvedValue(null);
    mockUserRepo.create.mockReturnValue(sampleUser);
    mockUserRepo.save.mockResolvedValue(sampleUser);
    const result = await service.create({
      email: 'test@example.com',
      password: '1234',
      name: '',
    });
    expect(result).toEqual(sampleUser);
  });

  it('should update a user', async () => {
    mockUserRepo.findOne.mockResolvedValue({ ...sampleUser });
    mockUserRepo.save.mockResolvedValue(sampleUser);
    const result = await service.update('1', { email: 'updated@example.com' });
    expect(result).toEqual(sampleUser);
  });

  it('should delete a user', async () => {
    mockUserRepo.delete.mockResolvedValue({ affected: 1 });
    await expect(service.remove('1')).resolves.toBeUndefined();
  });

  it('should throw NotFoundException on delete if user not found', async () => {
    mockUserRepo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove('1')).rejects.toThrow('Could not delete user');
  });

  it('should update the refresh token', async () => {
    mockUserRepo.findOne.mockResolvedValue(sampleUser);
    mockUserRepo.save.mockResolvedValue(sampleUser);
    await expect(service.updateRefreshToken('1', 'newHashedToken')).resolves.toBeUndefined();
  });
});
