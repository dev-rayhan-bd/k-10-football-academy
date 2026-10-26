import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { User } from '@/modules/user/user.model';
import { Notification } from '@/modules/notification/notification.model';
import { ClubProfile, ClubSuccessStory } from '../club.model';
import { clubResolverService } from './club-resolver.service';

export class ClubStoriesService {
  async getClubSuccessStories(userId: string, query: any = {}) {
    const club = await clubResolverService.resolveClub(userId);
    const filter: any = { clubId: club._id, isDeleted: false };
    if (query.status && query.status !== 'ALL') {
      filter.status = String(query.status).toUpperCase();
    }
    if (query.category && query.category !== 'ALL') {
      filter.category = new RegExp(String(query.category).trim(), 'i');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));

    const total = await ClubSuccessStory.countDocuments(filter);
    const stories = await ClubSuccessStory.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      data: stories.map((s) => ({
        _id: s._id,
        storyTitle: s.storyTitle,
        category: s.category,
        date: s.date,
        formattedDate:
          s.formattedDate || (s.date ? new Date(s.date).toISOString().split('T')[0] : ''),
        coverImage: s.coverImage || '',
        status: s.status,
        statusLabel:
          s.status === 'APPROVED' ? 'Approved' : s.status === 'REJECTED' ? 'Rejected' : 'Pending',
        adminReviewNotes: s.adminReviewNotes || '',
        createdAt: s.createdAt,
      })),
    };
  }

  async getClubSuccessStoryById(userId: string, storyId: string, userRole?: string) {
    let story: any;
    if (userRole && ['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
      story = await ClubSuccessStory.findOne({ _id: storyId, isDeleted: false });
    } else {
      const club = await clubResolverService.resolveClub(userId);
      story = await ClubSuccessStory.findOne({ _id: storyId, clubId: club._id, isDeleted: false });
    }
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    return {
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      date: story.date,
      formattedDate:
        story.formattedDate || (story.date ? new Date(story.date).toISOString().split('T')[0] : ''),
      coverImage: story.coverImage || '',
      status: story.status,
      statusLabel:
        story.status === 'APPROVED'
          ? 'Approved'
          : story.status === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      adminReviewNotes: story.adminReviewNotes || '',
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
    };
  }

  async createClubSuccessStory(userId: string, payload: any) {
    const club = await clubResolverService.resolveClub(userId);
    const storyTitle = payload.storyTitle || payload.title;
    const category = payload.category;
    if (!storyTitle) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Story title is required');
    }
    if (!category) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Category is required');
    }

    const img = payload.coverImage || payload.photo || payload.image || '';

    const story = await ClubSuccessStory.create({
      clubId: club._id,
      storyTitle,
      category,
      date: payload.date ? new Date(payload.date) : new Date(),
      coverImage: img,
      status: 'PENDING',
      adminReviewNotes: '',
    });

    // Notify admins of new club success story submitted for review
    const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] } }).select('_id role');
    for (const admin of admins) {
      await Notification.create({
        recipientId: admin._id,
        recipientRole: admin.role,
        title: 'New Club Success Story Submitted for Approval',
        message: `${club.name || 'A Football Club'} has submitted a new success story "${storyTitle}" for review and approval.`,
        type: 'STORY',
        data: { clubId: club._id, storyId: story._id },
      });
    }

    return {
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      date: story.date,
      formattedDate: story.formattedDate,
      coverImage: story.coverImage,
      status: story.status,
      statusLabel: 'Pending',
      createdAt: story.createdAt,
    };
  }

  async updateClubSuccessStory(userId: string, storyId: string, payload: any) {
    const club = await clubResolverService.resolveClub(userId);
    const story = await ClubSuccessStory.findOne({
      _id: storyId,
      clubId: club._id,
      isDeleted: false,
    });
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    if (payload.storyTitle || payload.title) story.storyTitle = payload.storyTitle || payload.title;
    if (payload.category) story.category = payload.category;
    if (payload.date) story.date = new Date(payload.date);
    if (payload.coverImage || payload.photo || payload.image) {
      story.coverImage = payload.coverImage || payload.photo || payload.image;
    }

    // Editing re-submits for approval
    story.status = 'PENDING';
    await story.save();

    return {
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      date: story.date,
      formattedDate: story.formattedDate,
      coverImage: story.coverImage,
      status: story.status,
      statusLabel: 'Pending',
      createdAt: story.createdAt,
    };
  }

  async reviewClubSuccessStory(
    storyId: string,
    status: 'APPROVED' | 'REJECTED',
    adminReviewNotes?: string,
  ) {
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Status must be APPROVED or REJECTED');
    }
    const story = await ClubSuccessStory.findByIdAndUpdate(
      storyId,
      { status, adminReviewNotes: adminReviewNotes || '' },
      { new: true },
    );
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    const club = await ClubProfile.findById(story.clubId);
    if (club && club.userId) {
      await Notification.create({
        recipientId: club.userId,
        recipientRole: 'CLUB',
        title: status === 'APPROVED' ? 'Success Story Approved!' : 'Success Story Review Update',
        message:
          status === 'APPROVED'
            ? `Your success story "${story.storyTitle}" has been approved and is now live!`
            : `Your success story "${story.storyTitle}" was rejected.${adminReviewNotes ? ` Reason: ${adminReviewNotes}` : ''}`,
        type: 'STORY',
        data: { storyId: story._id, status },
      });
    }

    return story;
  }

  async deleteClubSuccessStory(userId: string, storyId: string) {
    const club = await clubResolverService.resolveClub(userId);
    const story = await ClubSuccessStory.findOne({
      _id: storyId,
      clubId: club._id,
      isDeleted: false,
    });
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    story.isDeleted = true;
    story.deletedAt = new Date();
    await story.save();

    return { message: 'Success story deleted successfully' };
  }
}

export const clubStoriesService = new ClubStoriesService();
