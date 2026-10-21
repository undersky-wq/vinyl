import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AdminGuard, AuthGuard, PlaybackGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, TwoFactorService, AuthGuard, AdminGuard, PlaybackGuard],
  exports: [AuthService, AuthGuard, AdminGuard, PlaybackGuard],
})
export class AuthModule {}
