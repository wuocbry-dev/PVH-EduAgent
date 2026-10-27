import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { LibraryItemsService } from './library-items.service.js';
import { LibraryAgentTools } from './library.agent-tools.js';
import { LibraryController, PublicLibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';

// Thư viện số (bước 21): file tài liệu trong kho riêng tư (PrivateStorageService), ảnh bìa qua media (kho công khai).
@Module({
  imports: [MediaModule],
  controllers: [PublicLibraryController, LibraryController],
  providers: [LibraryService, LibraryItemsService, LibraryAgentTools],
  exports: [LibraryService, LibraryAgentTools],
})
export class LibraryModule {}
