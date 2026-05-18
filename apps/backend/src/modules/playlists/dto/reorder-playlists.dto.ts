import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderPlaylistsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  playlistIds!: string[];
}
