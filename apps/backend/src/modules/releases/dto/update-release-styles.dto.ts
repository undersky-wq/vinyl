import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdateReleaseStylesDto {
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  styles!: string[];
}
