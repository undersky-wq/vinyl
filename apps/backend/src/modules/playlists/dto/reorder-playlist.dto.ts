import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderPlaylistDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  trackIds!: string[];
}
