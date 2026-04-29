import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AdminGuard, AuthGuard } from './auth.guards';
import { AuthService } from './auth.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AdminGuard],
  exports: [AuthService, AuthGuard, AdminGuard],
})
export class AuthModule {}
