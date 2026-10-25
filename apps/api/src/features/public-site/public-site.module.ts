import { Module } from '@nestjs/common';
import { PublicSiteController } from './public-site.controller.js';
import { PublicSiteService } from './public-site.service.js';

@Module({
  controllers: [PublicSiteController],
  providers: [PublicSiteService],
})
export class PublicSiteModule {}
