import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateTimelineCommentDto {
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  second!: number;

  @IsString()
  @IsNotEmpty()
  text!: string;
}
