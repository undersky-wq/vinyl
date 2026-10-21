import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard, AuthGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, UpdateAuthSettingsDto, TwoFactorSetupDto, TwoFactorVerifyDto } from './dto/auth.dto';
import { TwoFactorService } from './two-factor.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly twoFactor: TwoFactorService) {}

  @Get('2fa/status')
  @UseGuards(AdminGuard)
  twoFactorStatus(@Req() request: any) { return this.twoFactor.status(request.user.id); }

  @Post('2fa/setup')
  @UseGuards(AdminGuard)
  setupTwoFactor(@Req() request: any, @Body() input: TwoFactorSetupDto) {
    return this.twoFactor.setup(request.user.id, input.password, input.code);
  }

  @Post('2fa/confirm')
  @UseGuards(AdminGuard)
  async confirmTwoFactor(@Req() request: any, @Body() input: TwoFactorVerifyDto, @Res({ passthrough: true }) response: any) {
    const { token, recoveryCodes } = await this.twoFactor.confirm(request.user.id, input.password, input.code);
    this.authService.setSessionCookie(response, token);
    return { recoveryCodes };
  }

  @Post('2fa/disable')
  @UseGuards(AdminGuard)
  async disableTwoFactor(@Req() request: any, @Body() input: TwoFactorVerifyDto, @Res({ passthrough: true }) response: any) {
    const { token } = await this.twoFactor.change(request.user.id, input.password, input.code, 'disable');
    this.authService.setSessionCookie(response, token);
    return { enabled: false };
  }

  @Post('2fa/recovery')
  @UseGuards(AdminGuard)
  async regenerateRecovery(@Req() request: any, @Body() input: TwoFactorVerifyDto, @Res({ passthrough: true }) response: any) {
    const { token, recoveryCodes } = await this.twoFactor.change(request.user.id, input.password, input.code, 'recovery');
    this.authService.setSessionCookie(response, token);
    return { recoveryCodes };
  }

  @Post('register')
  register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: any) {
    return this.authService.register(dto, response);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: any) {
    return this.authService.login(dto, response);
  }

  @Post('logout')
  async logout(@Req() request: any, @Res({ passthrough: true }) response: any) {
    request.securityAuditActor = await this.authService.getUserFromRequest(request);
    return this.authService.logout(request, response);
  }

  @Get('me')
  me(@Req() request: any) {
    return this.authService.me(request);
  }

  @Get('stats')
  @UseGuards(AuthGuard)
  stats(@Req() request: any) {
    return this.authService.stats(request.user);
  }

  @Get('settings')
  @UseGuards(AdminGuard)
  settings() {
    return this.authService.getAuthSettings();
  }

  @Get('site-settings')
  siteSettings() {
    return this.authService.getSiteSettings();
  }

  @Post('settings')
  @UseGuards(AdminGuard)
  updateSettings(@Body() dto: UpdateAuthSettingsDto) {
    return this.authService.updateAuthSettings(dto);
  }

  @Get('about-audio')
  aboutAudio() {
    return this.authService.getAboutAudio();
  }

  @Post('about-audio')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  uploadAboutAudio(@UploadedFile() file: Express.Multer.File) {
    return this.authService.uploadAboutAudio(file);
  }

  @Post('avatar')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  uploadAvatar(@Req() request: any, @UploadedFile() file: Express.Multer.File) {
    return this.authService.uploadAvatar(request.user, file);
  }
}
