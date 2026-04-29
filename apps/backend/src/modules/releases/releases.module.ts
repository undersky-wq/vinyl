import { Module } from '@nestjs/common';
import { AudioModule } from '../audio/audio.module';
import { DiscogsModule } from '../discogs/discogs.module';
import { ReleasesController } from './releases.controller';
import { ReleasesService } from './releases.service';

@Module({
  imports: [DiscogsModule, AudioModule],
  controllers: [ReleasesController],
  providers: [ReleasesService],
  exports: [ReleasesService],
})
export class ReleasesModule {}
