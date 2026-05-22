import { Transform } from 'class-transformer';
import { IsBooleanString, IsNumberString, IsOptional, IsString } from 'class-validator';

export class QueryReleasesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  bpm?: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsBooleanString()
  hasAudio?: string;

  @IsOptional()
  @IsBooleanString()
  isMix?: string;

  @IsOptional()
  @IsBooleanString()
  summary?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsNumberString()
  offset?: string;

  @IsOptional()
  @Transform(({ value }) => value ?? 'default-user')
  @IsString()
  userId?: string;
}
