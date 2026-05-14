import { IsOptional, IsString } from 'class-validator';

export class UpdateReleaseMetadataDto {
  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  title?: string;
}
