# TaskFlow API - Senior Backend Engineer Coding Challenge

This repository contains my submission for the **Senior Backend Engineer coding challenge**. The primary objective was to analyze an existing NestJS codebase, identify architectural weaknesses and performance bottlenecks, and refactor it into a production-ready, scalable, and secure application.

---

## 🧠 1. Analysis of Core Problems

Upon reviewing the initial codebase, I identified several key areas needing immediate attention, as outlined in the evaluation guide:

### ⚡ Performance & Scalability

- Potential **N+1 query problems**
- Inefficient filtering logic relying on in-memory processing

### 🏗️ Architectural Weaknesses

- Poor separation of concerns between application logic and data access
- Multi-step operations lacked proper transaction management

### 🔁 Reliability & Resilience

- Missing robust error handling for distributed systems (e.g., job queueing)
- External service connections (e.g., Redis) were inconsistently managed

### 🔒 Security

- Authorization logic was not scalable
- Some modules bypassed centralized configuration, leading to potential security and performance issues

---

## 🏛️ 2. Architectural Approach & Key Decisions

To address these challenges, I applied several architectural improvements and patterns:

### A. Decoupled Architecture with the Repository Pattern

- **Interfaces for DI**: Defined contracts such as `ITaskRepository` and `IUserRepository`
- **Infrastructure Layer**: TypeORM implementations are placed under an `infrastructure/` directory (e.g., `TypeOrmTaskRepository`)
- **Benefits**:
  - Decouples business logic from the ORM
  - Improves testability and maintainability
  - Future-proofing (e.g., ability to swap ORM)

### B. Efficient Database Operations

- **Scalable Filtering**: All listing methods (e.g., `TasksService.findAll`) use `createQueryBuilder` to push filtering, sorting, and pagination to the database
- **Atomic Transactions**: Critical multi-step operations (e.g., creating a task + enqueueing a job) use manual transactions with `queryRunner` to maintain data integrity

### C. Resilient Background & Scheduled Jobs

- **BullMQ for Background Jobs**:
  - Used for non-critical operations (e.g., task status updates)
  - Jobs configured with exponential backoff retries for fault tolerance
- **Scheduled Tasks**:
  - `OverdueTasksService` uses `@Cron` via `@nestjs/schedule`
  - Periodically checks for overdue tasks and processes them via background jobs

### D. Centralized and Lifecycle-Aware Configuration

- **Config Management**:
  - All environment variables and service configs handled via `@nestjs/config` and `.env`
- **Async Module Initialization**:
  - Used `forRootAsync` for `TypeOrmModule` and `BullModule` to avoid race conditions during service startup

---

## 📘 3. API and Documentation

- **Base URL**: `http://localhost:3000`
- **Swagger Documentation**: Available at [`http://localhost:3000/api`](http://localhost:3000/api)

---

## 🔮 4. Future Improvements & Trade-offs

### 🛡️ Security Guards

- **RateLimitGuard**:
  - Could be replaced or refactored to integrate with `@nestjs/throttler` using Redis-backed storage

### 🧠 Caching

- **CacheService**:
  - Current custom implementation created Redis clients too early (before env loading, which was causing issue with docker container)
  - Thinking of replacing with `@nestjs/cache-manager` + `cache-manager-redis-store`

### ✅ Testing

- **Expand test coverage**:
  - Add more **E2E tests** to cover request/response cycles
  - Increase **unit tests** at controller level

---

## 🚀 Summary

This refactor transforms the original codebase into a robust, maintainable, and scalable production-grade application. The improvements ensure efficient database usage, clear architectural boundaries, and enhanced operational resilience.

---

Thank you for reviewing this submission!
