import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreatePlaylistDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsArray()
  trackIds?: string[];
}
