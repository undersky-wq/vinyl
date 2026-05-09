import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guards';
import { AddPlaylistItemDto } from './dto/add-playlist-item.dto';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { ReorderPlaylistDto } from './dto/reorder-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { PlaylistsService } from './playlists.service';

@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlistsService: PlaylistsService) {}

  @Get()
  @UseGuards(AuthGuard)
  findAll(@Req() request: any) {
    return this.playlistsService.findAll(request.user.id);
  }

  @Get('summary')
  @UseGuards(AuthGuard)
  findSummaries(@Req() request: any) {
    return this.playlistsService.findSummaries(request.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.playlistsService.findOne(id);
  }

  @Post()
  @UseGuards(AuthGuard)
  create(@Req() request: any, @Body() dto: CreatePlaylistDto) {
    return this.playlistsService.create(request.user.id, dto);
  }

  @Post(':id/items')
  @UseGuards(AuthGuard)
  addItem(@Req() request: any, @Param('id') id: string, @Body() dto: AddPlaylistItemDto) {
    return this.playlistsService.addItem(request.user.id, id, dto.trackId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  update(@Req() request: any, @Param('id') id: string, @Body() dto: UpdatePlaylistDto) {
    return this.playlistsService.update(request.user.id, id, dto);
  }

  @Delete(':id/items/:trackId')
  @UseGuards(AuthGuard)
  removeItem(@Req() request: any, @Param('id') id: string, @Param('trackId') trackId: string) {
    return this.playlistsService.removeItem(request.user.id, id, trackId);
  }

  @Put(':id/reorder')
  @UseGuards(AuthGuard)
  reorder(@Req() request: any, @Param('id') id: string, @Body() dto: ReorderPlaylistDto) {
    return this.playlistsService.reorder(request.user.id, id, dto.trackIds);
  }
}
