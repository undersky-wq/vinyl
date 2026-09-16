import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateTrackMetadataDto {
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  bpm?: number | null;

  @IsOptional()
  @IsString()
  key?: string | null;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  artists?: string[];
}
