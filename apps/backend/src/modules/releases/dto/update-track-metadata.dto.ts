import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateTrackMetadataDto {
  @IsOptional()
  @Transform(({ value }) => (value === null || value === '' ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  bpm?: number;

  @IsOptional()
  @IsString()
  key?: string;
}
