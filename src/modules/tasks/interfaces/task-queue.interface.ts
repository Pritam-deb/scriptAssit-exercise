export interface ITaskQueueService {
  enqueueStatusUpdate(taskId: string, status: string): Promise<void>;
}
