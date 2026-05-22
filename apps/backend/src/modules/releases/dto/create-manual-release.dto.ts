import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export type ManualTrackInput = {
  position?: string;
  artist?: string;
  title: string;
  bpm?: number | string;
  key?: string;
};

export class CreateManualReleaseDto {
  @IsString()
  artist!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  year?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  styles?: string;

  @IsOptional()
  @IsBooleanString()
  isMix?: string;

  @IsString()
  tracks!: string;
}
