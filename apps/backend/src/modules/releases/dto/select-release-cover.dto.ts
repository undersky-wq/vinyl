import { IsIn, IsString, MaxLength } from 'class-validator';

export class SelectReleaseCoverDto {
  @IsString()
  @MaxLength(128)
  imageId!: string;

  @IsIn(['front', 'back', 'front2', 'back2'])
  side!: 'front' | 'back' | 'front2' | 'back2';
}
