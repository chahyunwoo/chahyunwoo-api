import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StorageService } from './storage.service';

@Injectable()
export class StorageCleanupTask {
  private readonly logger = new Logger(StorageCleanupTask.name);

  constructor(private readonly storage: StorageService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    this.logger.log('Starting temp file cleanup...');
    const deleted = await this.storage.cleanupTempFiles();
    this.logger.log(`Temp cleanup complete: ${deleted} files deleted`);
  }
}
