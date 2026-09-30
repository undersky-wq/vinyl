import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AdminGuard, AuthGuard, PlaybackGuard } from './auth.guards';
import { AuthService } from './auth.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AdminGuard, PlaybackGuard],
  exports: [AuthService, AuthGuard, AdminGuard, PlaybackGuard],
})
export class AuthModule {}
