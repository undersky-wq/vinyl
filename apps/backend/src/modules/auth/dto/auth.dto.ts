import { Equals, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsOptional()
  @IsString()
  inviteCode?: string;

  @Equals(true)
  privacyConsent!: boolean;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;
}

export class TwoFactorSetupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;
}

export class TwoFactorVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;
}

export class UpdateAuthSettingsDto {
  @IsOptional()
  @IsBoolean()
  allowGuestMixPlayback?: boolean;

  @IsOptional()
  @IsBoolean()
  playbackRequiresRegistration?: boolean;

  @IsOptional()
  @IsBoolean()
  registrationInviteRequired?: boolean;

  @IsOptional()
  @IsIn(['classic', 'shelf'])
  siteDesign?: 'classic' | 'shelf';
}
