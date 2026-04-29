import { IsOptional, IsString } from 'class-validator';

export class SyncDiscogsDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
