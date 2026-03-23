import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageCleanupTask } from './storage-cleanup.task';

@Global()
@Module({
  providers: [StorageService, StorageCleanupTask],
  exports: [StorageService],
})
export class StorageModule {}
