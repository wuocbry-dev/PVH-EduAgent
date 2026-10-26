import { Module } from '@nestjs/common';
import { ActivationModule } from '../activation/activation.module.js';
import { RosterController } from './roster.controller.js';
import { RosterService } from './roster.service.js';

@Module({
  imports: [ActivationModule],
  controllers: [RosterController],
  providers: [RosterService],
})
export class RosterModule {}
