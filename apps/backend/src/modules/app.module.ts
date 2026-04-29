import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { ReleasesModule } from './releases/releases.module';
import { DiscogsModule } from './discogs/discogs.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { AudioModule } from './audio/audio.module';
import { PlaylistsModule } from './playlists/playlists.module';
import { validateEnv } from '../shared/env.validation';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    StorageModule,
    AuthModule,
    ReleasesModule,
    DiscogsModule,
    AudioModule,
    PlaylistsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
