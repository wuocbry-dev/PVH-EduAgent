import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import type { Role } from '@pvh/shared';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  roleCodeSchema,
  updateRolePermissionsSchema,
  type UpdateRolePermissionsInput,
} from './dto/roles.dto.js';
import { RolesService } from './roles.service.js';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.roles.overview(user);
  }

  @Put(':code/permissions')
  updatePermissions(
    @CurrentUser() user: AuthUser,
    @Param('code', new ZodValidationPipe(roleCodeSchema)) code: Role,
    @Body(new ZodValidationPipe(updateRolePermissionsSchema))
    body: UpdateRolePermissionsInput,
    @Req() req: Request,
  ) {
    return this.roles.updatePermissions(user, code, body.permissions, req.ip);
  }
}
