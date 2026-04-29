import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/auth.guards';
import { SyncDiscogsDto } from './dto/sync-discogs.dto';
import { DiscogsService } from './discogs.service';

@Controller('discogs')
export class DiscogsController {
  constructor(private readonly discogsService: DiscogsService) {}

  @Post('sync')
  @UseGuards(AdminGuard)
  sync(@Body() dto: SyncDiscogsDto) {
    return this.discogsService.syncDiscogsCollection(dto);
  }

  @Post('backfill-covers')
  @UseGuards(AdminGuard)
  backfillCovers() {
    return this.discogsService.backfillCoverStorage();
  }
}
