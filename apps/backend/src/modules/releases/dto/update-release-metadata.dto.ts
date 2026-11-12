import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReleaseMetadataDto {
  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  labels?: string[];

  @IsOptional()
  @IsInt()
  year?: number | null;
}
