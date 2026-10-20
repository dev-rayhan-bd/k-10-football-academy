import { AppError } from '@/utils/AppError';
import { PlayerProfile, PlayerMedia } from '../player.model';
import { videoQueue } from '@/jobs/queues/video.queue';
import { playerCacheService } from './player-cache.service';
import { playerStatsService } from './player-stats.service';
import QueryBuilder from '@/builder/QueryBuilder';

export class PlayerMediaService {
  async uploadHighlightVideo(
    playerId: string,
    mediaUrl?: string,
    _thumbnailUrl?: string,
    _title?: string,
  ) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });

    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    if (mediaUrl) {
      profile.highlightVideo = mediaUrl;
      await profile.save();
      const updated = await playerStatsService.recalculatePlayerStats(profile._id);
      await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

      // BullMQ Background Video Processing Queue
      try {
        await videoQueue.add(
          'process-highlight-video',
          {
            videoId: profile._id.toString(),
            videoUrl: mediaUrl,
            playerId: profile._id.toString(),
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          },
        );
      } catch {
        // Safe logging without interrupting HTTP response
      }

      return updated || profile;
    }

    return profile;
  }

  async uploadMediaGallery(
    playerId: string,
    mediaUrl: string,
    thumbnailUrl?: string,
    title?: string,
  ) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });

    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    const isImage =
      mediaUrl.includes('/image/upload/') || mediaUrl.match(/\.(jpeg|jpg|gif|png)$/i) != null;
    const mediaType = isImage ? 'IMAGE' : 'VIDEO';

    const newMedia = await PlayerMedia.create({
      playerId: profile._id,
      url: mediaUrl,
      title: title || 'Untitled Media',
      mediaType,
      thumbnailUrl,
    });

    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    // BullMQ Background Video Processing Queue for gallery videos
    if (mediaType === 'VIDEO') {
      try {
        await videoQueue.add(
          'process-media-video',
          {
            videoId: newMedia._id.toString(),
            videoUrl: mediaUrl,
            playerId: profile._id.toString(),
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          },
        );
      } catch {
        // Safe logging without interrupting HTTP response
      }
    }

    return newMedia;
  }

  async getMediaGallery(
    playerId: string,
    queryOrPage: any = {},
    limit?: number,
    mediaType?: string,
  ) {
    const profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    const targetId = profile ? profile._id : playerId;

    const normalizedQuery: Record<string, unknown> =
      typeof queryOrPage === 'object' && queryOrPage !== null
        ? { ...queryOrPage }
        : {
            page: queryOrPage || 1,
            limit: limit || 10,
            ...(mediaType ? { mediaType } : {}),
          };

    const targetType = (normalizedQuery.mediaType || normalizedQuery.type) as string;
    const filter: Record<string, unknown> = { playerId: targetId };
    if (targetType && targetType !== 'ALL') {
      const upper = targetType.trim().toUpperCase();
      if (upper === 'IMAGE' || upper === 'VIDEO') {
        filter.mediaType = upper;
      }
    }

    const mediaQuery = new QueryBuilder(PlayerMedia.find(filter), normalizedQuery)
      .search(['title', 'description'])
      .filter()
      .sort()
      .paginate();

    const media = await mediaQuery.modelQuery;
    const pagination = await mediaQuery.countTotal();

    return {
      media,
      meta: {
        total: pagination.total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: pagination.totalPage,
      },
    };
  }
}

export const playerMediaService = new PlayerMediaService();
