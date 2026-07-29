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
import { LoginDto, RegisterDto, UpdateAuthSettingsDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: any) {
    return this.authService.register(dto, response);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: any) {
    return this.authService.login(dto, response);
  }

  @Post('logout')
  logout(@Req() request: any, @Res({ passthrough: true }) response: any) {
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

  @Post('settings')
  @UseGuards(AdminGuard)
  updateSettings(@Body() dto: UpdateAuthSettingsDto) {
    return this.authService.updateAuthSettings(dto);
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
