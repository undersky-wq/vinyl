import { Equals, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

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
}

export class UpdateAuthSettingsDto {
  @IsOptional()
  @IsBoolean()
  registrationInviteRequired?: boolean;

  @IsOptional()
  @IsIn(['classic', 'shelf'])
  siteDesign?: 'classic' | 'shelf';
}
