import { Module } from '@nestjs/common';
import { AudioModule } from '../audio/audio.module';
import { DiscogsModule } from '../discogs/discogs.module';
import { ReleasesController } from './releases.controller';
import { ReleasesService } from './releases.service';
import { CoverMaintenanceService } from './cover-maintenance.service';

@Module({
  imports: [DiscogsModule, AudioModule],
  controllers: [ReleasesController],
  providers: [ReleasesService, CoverMaintenanceService],
  exports: [ReleasesService],
})
export class ReleasesModule {}
