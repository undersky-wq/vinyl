import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Body,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../auth/auth.guards';
import { AuthService } from '../auth/auth.service';
import { CreateManualReleaseDto } from './dto/create-manual-release.dto';
import { QueryReleasesDto } from './dto/query-releases.dto';
import { UpdateTrackMetadataDto } from './dto/update-track-metadata.dto';
import { ReleasesService } from './releases.service';

@Controller('releases')
export class ReleasesController {
  constructor(
    private readonly releasesService: ReleasesService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async findAll(@Req() request: any, @Query() query: QueryReleasesDto) {
    const user = await this.authService.getUserFromRequest(request);
    return this.releasesService.findAll(query, Boolean(user));
  }

  @Get('styles')
  async findStyles(@Query() query: QueryReleasesDto) {
    return this.releasesService.findStyles(query);
  }

  @Get('library-feed')
  async findLibraryFeed(@Query() query: QueryReleasesDto) {
    return this.releasesService.findLibraryFeed(query);
  }

  @Get('suggestions')
  async findSearchSuggestions(@Query() query: QueryReleasesDto) {
    return this.releasesService.findSearchSuggestions(query);
  }

  @Post('manual')
  @UseGuards(AdminGuard)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: {
        fileSize: 100 * 1024 * 1024,
        files: 24,
      },
    }),
  )
  async createManual(
    @Req() request: any,
    @Body() body: CreateManualReleaseDto,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    if (!body.artist?.trim() || !body.title?.trim()) {
      throw new BadRequestException('Artist and release title are required');
    }

    return this.releasesService.createManualRelease(request.user, body, files || []);
  }

  @Get(':id')
  async findOne(@Req() request: any, @Param('id') id: string) {
    const user = await this.authService.getUserFromRequest(request);
    return this.releasesService.findOne(id, Boolean(user));
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async deleteRelease(@Param('id') id: string) {
    return this.releasesService.deleteRelease(id);
  }

  @Patch('tracks/:trackId/metadata')
  @UseGuards(AdminGuard)
  async updateTrackMetadata(
    @Param('trackId') trackId: string,
    @Body() dto: UpdateTrackMetadataDto,
  ) {
    return this.releasesService.updateTrackMetadata(trackId, dto);
  }
}
