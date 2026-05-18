import { IsOptional, IsString } from 'class-validator';

export class CreateReleaseTrackDto {
  @IsOptional()
  @IsString()
  position?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  artist?: string;
}
