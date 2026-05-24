import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateTimelineCommentDto {
  @IsString()
  @IsNotEmpty()
  text!: string;
}
