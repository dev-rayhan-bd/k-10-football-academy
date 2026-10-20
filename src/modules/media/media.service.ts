import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { IJwtPayload } from '@/middlewares/auth.middleware';
import { IMedia } from './media.interface';
import { Media } from './media.model';
import { PlayerProfile, PlayerMedia } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { ClubProfile } from '@/modules/club/club.model';
import { AcademyProfile } from '@/modules/academy/academy.model';
import { videoQueue } from '@/jobs/queues/video.queue';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import QueryBuilder from '@/builder/QueryBuilder';

export class MediaService {
  /**
   * Upload media for ANY authenticated role (Player, Coach, Club, Academy, Parent, Agent, etc.)
   */
  async uploadMedia(user: IJwtPayload, payload: Partial<IMedia>) {
    if (!payload.url) {
      throw new AppError(400, 'Media URL is required');
    }

    const userId = new Types.ObjectId(user.userId);
    const role = user.role;
    const mediaType = payload.mediaType || 'IMAGE';

    // Auto-link profile ID based on role
    let playerId: Types.ObjectId | undefined;
    let coachId: Types.ObjectId | undefined;
    let clubId: Types.ObjectId | undefined;
    let academyId: Types.ObjectId | undefined;

    if (role === 'PLAYER') {
      const player = await PlayerProfile.findOne({ userId });
      if (player) {
        playerId = player._id as Types.ObjectId;
      }
    } else if (role === 'COACH') {
      const coach = await CoachProfile.findOne({ userId });
      if (coach) {
        coachId = coach._id as Types.ObjectId;
      }
    } else if (role === 'CLUB') {
      const club = await ClubProfile.findOne({ userId });
      if (club) {
        clubId = club._id as Types.ObjectId;
      }
    } else if (role === 'ACADEMY') {
      const academy = await AcademyProfile.findOne({ userId });
      if (academy) {
        academyId = academy._id as Types.ObjectId;
      }
    }

    const newMedia = await Media.create({
      userId,
      role,
      playerId,
      coachId,
      clubId,
      academyId,
      url: payload.url,
      thumbnailUrl: payload.thumbnailUrl,
      title: payload.title || 'Untitled Media',
      description: payload.description,
      mediaType,
      isPublic: payload.isPublic ?? true,
      tags: payload.tags || [],
    });

    // Also sync to legacy PlayerMedia for backwards compatibility if the uploader is a player
    if (playerId) {
      await PlayerMedia.create({
        playerId,
        url: payload.url,
        title: payload.title || 'Untitled Media',
        mediaType,
        thumbnailUrl: payload.thumbnailUrl,
      }).catch(() => {});
      await playerCacheService.invalidatePlayerCache(playerId, userId.toString()).catch(() => {});
    }

    // BullMQ Video Processing Queue for gallery videos
    if (mediaType === 'VIDEO') {
      try {
        await videoQueue.add(
          'process-media-video',
          {
            videoId: newMedia._id.toString(),
            videoUrl: payload.url,
            playerId: playerId ? playerId.toString() : undefined,
            userId: user.userId,
            role: user.role,
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

  /**
   * Get media gallery for the current logged in user (with standard QueryBuilder)
   */
  async getMyMedia(userId: string, query: Record<string, unknown> = {}) {
    const userObjId = new Types.ObjectId(userId);
    const orConditions: Record<string, unknown>[] = [{ userId: userObjId }];

    const player = await PlayerProfile.findOne({ userId: userObjId }).select('_id');
    if (player) {
      orConditions.push({ playerId: player._id });
    }
    const coach = await CoachProfile.findOne({ userId: userObjId }).select('_id');
    if (coach) {
      orConditions.push({ coachId: coach._id });
    }
    const club = await ClubProfile.findOne({ userId: userObjId }).select('_id');
    if (club) {
      orConditions.push({ clubId: club._id });
    }
    const academy = await AcademyProfile.findOne({ userId: userObjId }).select('_id');
    if (academy) {
      orConditions.push({ academyId: academy._id });
    }

    const baseFilter: Record<string, unknown> = {
      $or: orConditions,
    };

    if (query.mediaType) {
      const type = String(query.mediaType).trim().toUpperCase();
      if (type === 'IMAGE' || type === 'VIDEO') {
        baseFilter.mediaType = type;
      }
    }

    const queryForBuilder = { ...query };
    delete queryForBuilder.mediaType;

    const mediaQuery = new QueryBuilder(Media.find(baseFilter), queryForBuilder)
      .search(['title', 'description', 'tags'])
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

  /**
   * Get media gallery for a specific user, coach, player, or club by ID
   */
  async getUserMedia(targetId: string, query: Record<string, unknown> = {}) {
    let baseFilter: Record<string, unknown>;

    if (Types.ObjectId.isValid(targetId)) {
      const objId = new Types.ObjectId(targetId);
      baseFilter = {
        $or: [
          { userId: objId },
          { playerId: objId },
          { coachId: objId },
          { clubId: objId },
          { academyId: objId },
        ],
        isPublic: true,
      };
    } else {
      throw new AppError(400, 'Invalid User or Entity ID format');
    }

    if (query.mediaType) {
      const type = String(query.mediaType).trim().toUpperCase();
      if (type === 'IMAGE' || type === 'VIDEO') {
        baseFilter.mediaType = type;
      }
    }

    const queryForBuilder = { ...query };
    delete queryForBuilder.mediaType;

    const mediaQuery = new QueryBuilder(Media.find(baseFilter), queryForBuilder)
      .search(['title', 'description', 'tags'])
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

  /**
   * Update media metadata (title, description, isPublic, tags)
   */
  async updateMedia(mediaId: string, userId: string, userRole: string, payload: Partial<IMedia>) {
    const media = await Media.findById(mediaId);
    if (!media) {
      throw new AppError(404, 'Media item not found');
    }

    // Owner or Super Admin permission check
    const isOwner = media.userId.toString() === userId;
    const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

    if (!isOwner && !isSuperAdmin) {
      throw new AppError(403, 'You do not have permission to modify this media item');
    }

    if (payload.title !== undefined) media.title = payload.title;
    if (payload.description !== undefined) media.description = payload.description;
    if (payload.url !== undefined) media.url = payload.url;
    if (payload.thumbnailUrl !== undefined) media.thumbnailUrl = payload.thumbnailUrl;
    if (payload.mediaType !== undefined) media.mediaType = payload.mediaType;
    if (payload.isPublic !== undefined) media.isPublic = payload.isPublic;
    if (payload.tags !== undefined) media.tags = payload.tags;

    await media.save();

    // Also update legacy PlayerMedia if linked
    if (media.playerId) {
      await PlayerMedia.findOneAndUpdate(
        { $or: [{ _id: media._id }, { url: media.url }] },
        {
          ...(payload.title !== undefined ? { title: payload.title } : {}),
          ...(payload.thumbnailUrl !== undefined ? { thumbnailUrl: payload.thumbnailUrl } : {}),
        },
      ).catch(() => {});
    }

    return media;
  }

  /**
   * Delete media item
   */
  async deleteMedia(mediaId: string, userId: string, userRole: string) {
    const media = await Media.findById(mediaId);
    if (!media) {
      throw new AppError(404, 'Media item not found');
    }

    const isOwner = media.userId.toString() === userId;
    const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

    if (!isOwner && !isSuperAdmin) {
      throw new AppError(403, 'You do not have permission to delete this media item');
    }

    await Media.findByIdAndDelete(mediaId);

    // Also remove from PlayerMedia if linked
    if (media.playerId) {
      await PlayerMedia.findOneAndDelete({ url: media.url }).catch(() => {});
      await playerCacheService
        .invalidatePlayerCache(media.playerId, media.userId.toString())
        .catch(() => {});
    }

    return { success: true, message: 'Media item deleted successfully' };
  }
}

export const mediaService = new MediaService();
