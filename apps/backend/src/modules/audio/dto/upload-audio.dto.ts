import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UploadAudioBodyDto {
  @IsString()
  @IsNotEmpty()
  trackId!: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
