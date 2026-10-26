import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { AcademyCoach, AcademySponsor, AcademyNews, AcademySuccessStory } from '../academy.model';
import { NotificationService } from '@/modules/notification/notification.service';
import { PlayerProfile } from '@/modules/player/player.model';
import { academyResolverService } from './academy-resolver.service';

const notificationService = new NotificationService();

export class AcademyMediaService {
  private async notifyAcademyUsersAboutNews(academy: any, article: any) {
    try {
      const players = await PlayerProfile.find({
        $or: [{ academyId: academy._id }, { academy: academy.name }, { currentClub: academy.name }],
      }).select('userId');

      const coaches = await AcademyCoach.find({
        academyId: academy._id,
        status: 'APPROVED',
      }).populate('coachId', 'userId');

      const recipientUserIds = new Set<string>();

      players.forEach((p) => {
        if (p.userId) recipientUserIds.add(p.userId.toString());
      });

      coaches.forEach((c: any) => {
        if (c.coachId?.userId) recipientUserIds.add(c.coachId.userId.toString());
      });

      const messagePreview =
        article.excerpt ||
        (article.fullArticle
          ? article.fullArticle.substring(0, 100)
          : 'New announcement posted by academy management.');

      for (const userId of recipientUserIds) {
        await notificationService.createNotification({
          recipientId: userId,
          title: `News: ${article.articleTitle}`,
          message: messagePreview,
          type: 'ACADEMY_NEWS',
          data: {
            newsId: article._id,
            academyId: academy._id,
          },
        });
      }
    } catch {
      // Non-blocking notification dispatch
    }
  }

  async getSponsorsMeta(_user: any, _academyIdentifier?: string) {
    return {
      sponsorshipTypes: [
        'EQUIPMENT',
        'APPAREL',
        'FINANCIAL',
        'TECHNOLOGY',
        'MEDIA',
        'MEDICAL',
        'NUTRITION',
        'OTHER',
      ],
      sponsorshipStatuses: ['ACTIVE', 'EXPIRING SOON', 'EXPIRED', 'PENDING', 'TERMINATED'],
      paymentStatuses: ['PAID', 'PENDING', 'PARTIALLY_PAID', 'OVERDUE'],
    };
  }

  async getSponsors(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    // 1. Calculate dynamic stats directly from DB (The 4 Top Cards from UI Screenshot 1)
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [allActive, activeCount, expiringSoonCount, pendingPayments] = await Promise.all([
      AcademySponsor.aggregate([
        { $match: { academyId: academy._id, sponsorshipStatus: 'ACTIVE' } },
        { $group: { _id: null, total: { $sum: '$contractValue' } } },
      ]),
      AcademySponsor.countDocuments({
        academyId: academy._id,
        sponsorshipStatus: 'ACTIVE',
      }),
      AcademySponsor.countDocuments({
        academyId: academy._id,
        $or: [
          { sponsorshipStatus: 'EXPIRING SOON' },
          {
            sponsorshipStatus: 'ACTIVE',
            endDate: { $gte: now, $lte: thirtyDaysFromNow },
          },
        ],
      }),
      AcademySponsor.aggregate([
        {
          $match: {
            academyId: academy._id,
            paymentStatus: { $in: ['PENDING', 'OVERDUE', 'PARTIALLY_PAID'] },
          },
        },
        { $group: { _id: null, total: { $sum: '$contractValue' } } },
      ]),
    ]);

    const totalContractValueNum = allActive[0]?.total || 0;
    const pendingPaymentsNum = pendingPayments[0]?.total || 0;

    // Helper format e.g. $185K or $185,000
    const formatK = (val: number) => {
      if (val >= 1000) {
        return `$${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
      }
      return `$${val}`;
    };

    const stats = {
      totalContractValue: totalContractValueNum,
      totalContractValueFormatted: formatK(totalContractValueNum),
      activeSponsors: activeCount,
      expiringSoon: expiringSoonCount,
      pendingPayments: pendingPaymentsNum,
      pendingPaymentsFormatted: formatK(pendingPaymentsNum),
    };

    // 2. Build table filters
    const filter: any = { academyId: academy._id };

    if (query.sponsorshipType) {
      filter.sponsorshipType = { $regex: new RegExp(String(query.sponsorshipType).trim(), 'i') };
    }

    if (query.sponsorshipStatus || query.status) {
      const st = String(query.sponsorshipStatus || query.status).trim();
      filter.sponsorshipStatus = { $regex: new RegExp(st, 'i') };
    }

    if (query.paymentStatus) {
      filter.paymentStatus = String(query.paymentStatus).toUpperCase();
    }

    if (query.searchTerm || query.search) {
      const term = String(query.searchTerm || query.search).trim();
      const regex = new RegExp(term, 'i');
      filter.$or = [
        { companyName: regex },
        { contactPerson: regex },
        { email: regex },
        { phone: regex },
        { sponsorshipType: regex },
      ];
    }

    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const [totalRecords, sponsors] = await Promise.all([
      AcademySponsor.countDocuments(filter),
      AcademySponsor.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const formattedSponsors = sponsors.map((sp: any) => {
      const val = Number(sp.contractValue) || 0;
      const currency = sp.currency || '$';

      // Badge type color matching UI screenshot 1
      let typeBadgeVariant = 'green';
      const upperType = String(sp.sponsorshipType).toUpperCase();
      if (upperType === 'APPAREL') typeBadgeVariant = 'navy';
      else if (upperType === 'FINANCIAL') typeBadgeVariant = 'yellow';
      else if (upperType === 'TECHNOLOGY') typeBadgeVariant = 'purple';
      else if (upperType === 'EQUIPMENT') typeBadgeVariant = 'green';

      return {
        _id: sp._id,
        companyName: sp.companyName,
        contactPerson: sp.contactPerson,
        email: sp.email,
        phone: sp.phone,
        fullAddress: sp.fullAddress,
        sponsorshipType: sp.sponsorshipType,
        sponsorshipTypeBadge: {
          label: sp.sponsorshipType,
          variant: typeBadgeVariant,
        },
        contractValue: val,
        currency,
        contractValueFormatted: `${currency} ${val.toLocaleString('en-US')}`,
        contractPeriod: sp.formattedContractPeriod || '',
        startDate: sp.startDate,
        endDate: sp.endDate,
        status: sp.sponsorshipStatus,
        statusBadge: {
          label: sp.sponsorshipStatus,
          variant:
            sp.sponsorshipStatus === 'ACTIVE'
              ? 'green'
              : sp.sponsorshipStatus === 'EXPIRING SOON'
                ? 'yellow'
                : 'gray',
        },
        paymentStatus: sp.paymentStatus,
        paymentBadge: {
          label: sp.paymentStatus,
          variant: sp.paymentStatus === 'PAID' ? 'green' : 'red',
        },
        sponsorshipDescription: sp.sponsorshipDescription,
        benefitsAndDeliverables: sp.benefitsAndDeliverables || '',
        logo: sp.logo || '',
        createdAt: sp.createdAt,
      };
    });

    return {
      stats,
      sponsors: formattedSponsors,
      meta: {
        page,
        limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  async getSponsorById(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const sponsor = await AcademySponsor.findOne({
      _id: id,
      academyId: academy._id,
    }).lean();

    if (!sponsor) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy sponsor not found');
    }

    const sp: any = sponsor;
    const val = Number(sp.contractValue) || 0;
    const currency = sp.currency || '$';

    return {
      _id: sp._id,
      companyName: sp.companyName,
      contactPerson: sp.contactPerson,
      email: sp.email,
      phone: sp.phone,
      fullAddress: sp.fullAddress,
      sponsorshipType: sp.sponsorshipType,
      contractValue: val,
      currency,
      contractValueFormatted: `${currency} ${val.toLocaleString('en-US')}`,
      contractPeriod: sp.formattedContractPeriod || '',
      startDate: sp.startDate,
      endDate: sp.endDate,
      sponsorshipStatus: sp.sponsorshipStatus,
      paymentStatus: sp.paymentStatus,
      sponsorshipDescription: sp.sponsorshipDescription,
      benefitsAndDeliverables: sp.benefitsAndDeliverables || '',
      logo: sp.logo || '',
      createdAt: sp.createdAt,
      updatedAt: sp.updatedAt,
    };
  }

  async createSponsor(user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const sponsor = new AcademySponsor({
      academyId: academy._id,
      companyName: payload.companyName,
      contactPerson: payload.contactPerson,
      email: payload.email,
      phone: payload.phone,
      fullAddress: payload.fullAddress,
      sponsorshipType: String(payload.sponsorshipType).toUpperCase(),
      sponsorshipStatus: payload.sponsorshipStatus || 'ACTIVE',
      contractValue: Number(payload.contractValue) || 0,
      currency: payload.currency || '$',
      paymentStatus: payload.paymentStatus || 'PENDING',
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      formattedContractPeriod: payload.formattedContractPeriod,
      sponsorshipDescription: payload.sponsorshipDescription,
      benefitsAndDeliverables: payload.benefitsAndDeliverables,
      logo: payload.logo,
    });

    await sponsor.save();

    return {
      message: 'Sponsor added successfully',
      sponsor,
    };
  }

  async updateSponsor(id: string, user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const sponsor = await AcademySponsor.findOne({
      _id: id,
      academyId: academy._id,
    });

    if (!sponsor) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy sponsor not found');
    }

    if (payload.companyName) sponsor.companyName = payload.companyName;
    if (payload.contactPerson) sponsor.contactPerson = payload.contactPerson;
    if (payload.email) sponsor.email = payload.email;
    if (payload.phone) sponsor.phone = payload.phone;
    if (payload.fullAddress) sponsor.fullAddress = payload.fullAddress;
    if (payload.sponsorshipType)
      sponsor.sponsorshipType = String(payload.sponsorshipType).toUpperCase();
    if (payload.sponsorshipStatus) sponsor.sponsorshipStatus = payload.sponsorshipStatus;
    if (payload.contractValue !== undefined)
      sponsor.contractValue = Number(payload.contractValue) || 0;
    if (payload.currency) sponsor.currency = payload.currency;
    if (payload.paymentStatus) sponsor.paymentStatus = payload.paymentStatus;
    if (payload.startDate) sponsor.startDate = new Date(payload.startDate);
    if (payload.endDate) sponsor.endDate = new Date(payload.endDate);
    if (payload.formattedContractPeriod !== undefined)
      sponsor.formattedContractPeriod = payload.formattedContractPeriod;
    if (payload.sponsorshipDescription)
      sponsor.sponsorshipDescription = payload.sponsorshipDescription;
    if (payload.benefitsAndDeliverables !== undefined)
      sponsor.benefitsAndDeliverables = payload.benefitsAndDeliverables;
    if (payload.logo !== undefined) sponsor.logo = payload.logo;

    await sponsor.save();

    return {
      message: 'Sponsor updated successfully',
      sponsor,
    };
  }

  async deleteSponsor(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const sponsor = await AcademySponsor.findOneAndDelete({
      _id: id,
      academyId: academy._id,
    });

    if (!sponsor) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy sponsor not found');
    }

    return {
      message: 'Sponsor deleted successfully',
    };
  }

  async getAcademyNewsMeta(user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const [allCount, publishedCount, privateCount, draftCount, binCount] = await Promise.all([
      AcademyNews.countDocuments({ academyId: academy._id, isDeleted: false }),
      AcademyNews.countDocuments({
        academyId: academy._id,
        status: 'PUBLISHED',
        isDeleted: false,
      }),
      AcademyNews.countDocuments({
        academyId: academy._id,
        visibility: 'PRIVATE',
        isDeleted: false,
      }),
      AcademyNews.countDocuments({
        academyId: academy._id,
        status: 'DRAFT',
        isDeleted: false,
      }),
      AcademyNews.countDocuments({
        academyId: academy._id,
        $or: [{ isDeleted: true }, { status: 'BIN' }],
      }),
    ]);

    return {
      categories: [
        'Match Report',
        'Championship',
        'Announcement',
        'Training',
        'Facility Update',
        'Tournament',
        'General News',
        'Club News',
      ],
      priorities: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      visibilities: ['PUBLIC', 'PRIVATE'],
      statuses: ['PUBLISHED', 'DRAFT', 'BIN'],
      tabCounts: {
        all: allCount,
        published: publishedCount,
        private: privateCount,
        draft: draftCount,
        bin: binCount,
      },
    };
  }

  async getAcademyNews(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    // 1. Calculate dynamic tab counts for UI Header Tabs
    const [allCount, publishedCount, privateCount, draftCount, binCount] = await Promise.all([
      AcademyNews.countDocuments({ academyId: academy._id, isDeleted: false }),
      AcademyNews.countDocuments({
        academyId: academy._id,
        status: 'PUBLISHED',
        isDeleted: false,
      }),
      AcademyNews.countDocuments({
        academyId: academy._id,
        visibility: 'PRIVATE',
        isDeleted: false,
      }),
      AcademyNews.countDocuments({
        academyId: academy._id,
        status: 'DRAFT',
        isDeleted: false,
      }),
      AcademyNews.countDocuments({
        academyId: academy._id,
        $or: [{ isDeleted: true }, { status: 'BIN' }],
      }),
    ]);

    const tabCounts = {
      all: allCount,
      published: publishedCount,
      private: privateCount,
      draft: draftCount,
      bin: binCount,
    };

    // 2. Build filter according to status / tab
    const filter: any = { academyId: academy._id };
    const statusParam = String(query.status || query.tab || 'ALL').toUpperCase();

    if (statusParam === 'BIN') {
      filter.$or = [{ isDeleted: true }, { status: 'BIN' }];
    } else {
      filter.isDeleted = false;
      if (statusParam === 'PUBLISHED') {
        filter.status = 'PUBLISHED';
      } else if (statusParam === 'PRIVATE') {
        filter.visibility = 'PRIVATE';
      } else if (statusParam === 'DRAFT') {
        filter.status = 'DRAFT';
      }
    }

    if (query.category) {
      filter.category = { $regex: new RegExp(String(query.category).trim(), 'i') };
    }

    if (query.visibility) {
      filter.visibility = String(query.visibility).toUpperCase();
    }

    if (query.priority) {
      filter.priority = String(query.priority).toUpperCase();
    }

    if (query.searchTerm || query.search) {
      const term = String(query.searchTerm || query.search).trim();
      const regex = new RegExp(term, 'i');
      filter.$or = [
        { articleTitle: regex },
        { fullArticle: regex },
        { author: regex },
        { category: regex },
        { tags: regex },
      ];
    }

    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const [totalRecords, articles] = await Promise.all([
      AcademyNews.countDocuments(filter),
      AcademyNews.find(filter)
        .sort({ publishDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const formattedArticles = articles.map((art: any) => {
      return {
        _id: art._id,
        articleTitle: art.articleTitle,
        category: art.category,
        author: art.author,
        publishedBy: art.author || 'ADMIN',
        publishDate: art.publishDate,
        formattedPublishDate: art.formattedPublishDate || '',
        fullArticle: art.fullArticle,
        excerpt: art.excerpt || '',
        featuredImage: art.featuredImage || '',
        tags: art.tags || [],
        priority: art.priority,
        visibility: art.visibility,
        visibilityBadge: {
          label: art.visibility,
          variant: art.visibility === 'PUBLIC' ? 'gray' : 'navy',
        },
        status: art.status,
        statusBadge: {
          label: art.status,
          variant:
            art.status === 'PUBLISHED' ? 'green' : art.status === 'DRAFT' ? 'yellow' : 'gray',
        },
        views: art.views || 0,
        sendPushNotification: art.sendPushNotification || false,
        isDeleted: art.isDeleted || false,
        createdAt: art.createdAt,
      };
    });

    return {
      tabCounts,
      news: formattedArticles,
      meta: {
        page,
        limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  async getAcademyNewsById(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const article = await AcademyNews.findOneAndUpdate(
      { _id: id, academyId: academy._id },
      { $inc: { views: 1 } },
      { new: true },
    ).lean();

    if (!article) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy news article not found');
    }

    return article;
  }

  async createAcademyNews(user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const isDraft = payload.status === 'DRAFT';
    const title =
      payload.articleTitle && payload.articleTitle.trim()
        ? payload.articleTitle.trim()
        : isDraft
          ? 'Untitled Draft'
          : 'Academy News Announcement';

    const tags = Array.isArray(payload.tags)
      ? payload.tags
      : typeof payload.tags === 'string'
        ? payload.tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [];

    const article = new AcademyNews({
      academyId: academy._id,
      articleTitle: title,
      category: payload.category || (isDraft ? 'Draft' : 'General News'),
      author: payload.author || user.name || 'Admin',
      publishDate: payload.publishDate ? new Date(payload.publishDate) : new Date(),
      fullArticle: payload.fullArticle || '',
      excerpt: payload.excerpt,
      featuredImage: payload.featuredImage || '',
      tags,
      priority: payload.priority || 'MEDIUM',
      visibility: payload.visibility || 'PUBLIC',
      status: payload.status || 'PUBLISHED',
      sendPushNotification: Boolean(payload.sendPushNotification),
      views: 0,
      isDeleted: false,
    });

    await article.save();

    // Trigger push notification to own academy users if toggle is on and published
    if (article.status === 'PUBLISHED' && article.sendPushNotification) {
      this.notifyAcademyUsersAboutNews(academy, article);
    }

    return {
      message: isDraft ? 'Draft article saved successfully' : 'News article published successfully',
      article,
    };
  }

  async updateAcademyNews(id: string, user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const article = await AcademyNews.findOne({
      _id: id,
      academyId: academy._id,
    });

    if (!article) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy news article not found');
    }

    if (payload.articleTitle) article.articleTitle = payload.articleTitle;
    if (payload.category) article.category = payload.category;
    if (payload.author) article.author = payload.author;
    if (payload.publishDate) article.publishDate = new Date(payload.publishDate);
    if (payload.fullArticle !== undefined) article.fullArticle = payload.fullArticle;
    if (payload.excerpt !== undefined) article.excerpt = payload.excerpt;
    if (payload.featuredImage !== undefined) article.featuredImage = payload.featuredImage;
    if (payload.priority) article.priority = payload.priority;
    if (payload.visibility) article.visibility = payload.visibility;

    if (payload.tags !== undefined) {
      article.tags = Array.isArray(payload.tags)
        ? payload.tags
        : typeof payload.tags === 'string'
          ? payload.tags
              .split(',')
              .map((t: string) => t.trim())
              .filter(Boolean)
          : [];
    }

    const wasDraft = article.status === 'DRAFT';
    if (payload.status) article.status = payload.status;
    if (payload.sendPushNotification !== undefined) {
      article.sendPushNotification = Boolean(payload.sendPushNotification);
    }

    await article.save();

    // If transitioned from DRAFT to PUBLISHED or republished with notification toggle
    if (
      article.status === 'PUBLISHED' &&
      article.sendPushNotification &&
      (wasDraft || payload.sendPushNotification)
    ) {
      this.notifyAcademyUsersAboutNews(academy, article);
    }

    return {
      message: 'News article updated successfully',
      article,
    };
  }

  async toggleNewsVisibility(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const article = await AcademyNews.findOne({
      _id: id,
      academyId: academy._id,
    });

    if (!article) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy news article not found');
    }

    article.visibility = article.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    await article.save();

    return {
      message: `News visibility set to ${article.visibility}`,
      visibility: article.visibility,
    };
  }

  async moveNewsToBin(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const article = await AcademyNews.findOne({
      _id: id,
      academyId: academy._id,
    });

    if (!article) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy news article not found');
    }

    article.isDeleted = true;
    article.status = 'BIN';
    article.deletedAt = new Date();
    await article.save();

    return {
      message: 'News article moved to bin',
    };
  }

  async restoreNewsFromBin(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const article = await AcademyNews.findOne({
      _id: id,
      academyId: academy._id,
    });

    if (!article) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy news article not found');
    }

    article.isDeleted = false;
    article.status = 'DRAFT';
    article.deletedAt = null;
    await article.save();

    return {
      message: 'News article restored from bin as draft',
      article,
    };
  }

  async deleteNewsPermanently(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const article = await AcademyNews.findOneAndDelete({
      _id: id,
      academyId: academy._id,
    });

    if (!article) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy news article not found');
    }

    return {
      message: 'News article deleted permanently',
    };
  }

  async getSuccessStoriesMeta(user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const [allCount, approvedCount, pendingCount, rejectedCount] = await Promise.all([
      AcademySuccessStory.countDocuments({ academyId: academy._id, isDeleted: false }),
      AcademySuccessStory.countDocuments({
        academyId: academy._id,
        status: 'APPROVED',
        isDeleted: false,
      }),
      AcademySuccessStory.countDocuments({
        academyId: academy._id,
        status: 'PENDING',
        isDeleted: false,
      }),
      AcademySuccessStory.countDocuments({
        academyId: academy._id,
        status: 'REJECTED',
        isDeleted: false,
      }),
    ]);

    return {
      currentAcademy: academy.name,
      categories: [
        'Tournament Achievement',
        'Seasonal Highlight',
        'Coach Promotion',
        'Player Signing',
        'National Team Callup',
        'International Debut',
        'General Achievement',
      ],
      positions: [
        'Goalkeeper',
        'Right Back',
        'Left Back',
        'Centre Back',
        'Defensive Midfielder',
        'Central Midfielder',
        'Attacking Midfielder',
        'Right Winger',
        'Left Winger',
        'Winger',
        'Forward',
        'Striker',
        'Coach',
      ],
      statuses: ['PENDING', 'APPROVED', 'REJECTED'],
      counts: {
        all: allCount,
        approved: approvedCount,
        pending: pendingCount,
        rejected: rejectedCount,
      },
    };
  }

  async getSuccessStories(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [allCount, approvedCount, pendingCount, rejectedCount] = await Promise.all([
      AcademySuccessStory.countDocuments({ academyId: academy._id, isDeleted: false }),
      AcademySuccessStory.countDocuments({
        academyId: academy._id,
        status: 'APPROVED',
        isDeleted: false,
      }),
      AcademySuccessStory.countDocuments({
        academyId: academy._id,
        status: 'PENDING',
        isDeleted: false,
      }),
      AcademySuccessStory.countDocuments({
        academyId: academy._id,
        status: 'REJECTED',
        isDeleted: false,
      }),
    ]);

    const counts = {
      all: allCount,
      approved: approvedCount,
      pending: pendingCount,
      rejected: rejectedCount,
    };

    const filter: any = {
      academyId: academy._id,
      isDeleted: false,
    };

    if (query.status && String(query.status).toUpperCase() !== 'ALL') {
      filter.status = String(query.status).toUpperCase();
    }

    if (query.category) {
      filter.category = { $regex: new RegExp(String(query.category).trim(), 'i') };
    }

    if (query.searchTerm || query.search) {
      const term = String(query.searchTerm || query.search).trim();
      const regex = new RegExp(term, 'i');
      filter.$or = [
        { storyTitle: regex },
        { playerName: regex },
        { position: regex },
        { currentAcademy: regex },
        { category: regex },
        { storyContent: regex },
      ];
    }

    const [totalRecords, stories] = await Promise.all([
      AcademySuccessStory.countDocuments(filter),
      AcademySuccessStory.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const formattedStories = stories.map((s: any) => ({
      _id: s._id,
      storyTitle: s.storyTitle,
      playerName: s.playerName || '',
      position: s.position || '',
      currentAcademy: s.currentAcademy || academy.name,
      date: s.date,
      formattedDate:
        s.formattedDate || (s.date ? new Date(s.date).toISOString().split('T')[0] : ''),
      category: s.category,
      photo: s.photo || '',
      storyContent: s.storyContent || '',
      status: s.status,
      statusBadge: {
        label: s.status,
        variant: s.status === 'APPROVED' ? 'green' : s.status === 'REJECTED' ? 'red' : 'yellow',
      },
      rejectionReason: s.rejectionReason,
      createdAt: s.createdAt,
    }));

    return {
      counts,
      stories: formattedStories,
      meta: {
        page,
        limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  async getSuccessStoryById(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const story = await AcademySuccessStory.findOne({
      _id: id,
      academyId: academy._id,
      isDeleted: false,
    }).lean();

    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy success story not found');
    }

    return story;
  }

  async createSuccessStory(user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const story = new AcademySuccessStory({
      academyId: academy._id,
      storyTitle: payload.storyTitle,
      playerName: payload.playerName,
      position: payload.position,
      currentAcademy: payload.currentAcademy || academy.name,
      date: payload.date ? new Date(payload.date) : new Date(),
      category: payload.category,
      photo: payload.photo || '',
      storyContent: payload.storyContent || '',
      status: payload.status || 'PENDING',
      isDeleted: false,
    });

    await story.save();

    return {
      message: 'Success story submitted for approval successfully',
      story,
    };
  }

  async updateSuccessStory(id: string, user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const story = await AcademySuccessStory.findOne({
      _id: id,
      academyId: academy._id,
      isDeleted: false,
    });

    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy success story not found');
    }

    if (payload.storyTitle) story.storyTitle = payload.storyTitle;
    if (payload.playerName !== undefined) story.playerName = payload.playerName;
    if (payload.position !== undefined) story.position = payload.position;
    if (payload.currentAcademy !== undefined) story.currentAcademy = payload.currentAcademy;
    if (payload.date) story.date = new Date(payload.date);
    if (payload.category) story.category = payload.category;
    if (payload.photo !== undefined) story.photo = payload.photo;
    if (payload.storyContent !== undefined) story.storyContent = payload.storyContent;
    if (payload.status) story.status = payload.status;
    if (payload.rejectionReason !== undefined) story.rejectionReason = payload.rejectionReason;

    await story.save();

    return {
      message: 'Success story updated successfully',
      story,
    };
  }

  async updateSuccessStoryStatus(
    id: string,
    user: any,
    status: string,
    rejectionReason?: string,
    academyIdentifier?: string,
  ) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const story = await AcademySuccessStory.findOne({
      _id: id,
      academyId: academy._id,
      isDeleted: false,
    });

    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy success story not found');
    }

    story.status = status;
    if (rejectionReason !== undefined) {
      story.rejectionReason = rejectionReason;
    }
    await story.save();

    return {
      message: `Success story status updated to ${status}`,
      story,
    };
  }

  async deleteSuccessStory(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const story = await AcademySuccessStory.findOne({
      _id: id,
      academyId: academy._id,
    });

    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy success story not found');
    }

    story.isDeleted = true;
    story.deletedAt = new Date();
    await story.save();

    return {
      message: 'Success story deleted successfully',
    };
  }
}

export const academyMediaService = new AcademyMediaService();
