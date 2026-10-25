import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { IAgentProfile, IVerificationDocument } from './agent.interface';
import { AgentProfile, VerificationDocument, SuccessStory } from './agent.model';
import { UserModel } from '@/modules/user/user.model';
import { Notification } from '@/modules/notification/notification.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { clubService } from '@/modules/club/club.service';
import { ClubFavourite } from '@/modules/club/club.model';
import { Types } from 'mongoose';

function calculateAge(dateOfBirth?: Date | string | null): number | undefined {
  if (!dateOfBirth) return undefined;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : undefined;
}

function calculateProfileCompletion(profile: any, user: any): number {
  const fields = [
    profile?.fullName || profile?.name || user?.name,
    profile?.nationality || profile?.country || user?.country,
    profile?.licenseId || profile?.fifaLicenseNumber || user?.fifaLicenseNumber,
    profile?.dateOfBirth || user?.dateOfBirth,
    profile?.contact || profile?.phone || user?.phone,
    user?.email || profile?.email,
    profile?.coverPhoto || user?.coverPhoto,
    profile?.yearsOfExperience !== undefined &&
      profile?.yearsOfExperience !== null &&
      profile?.yearsOfExperience !== '',
    profile?.certifications,
    profile?.achievements,
    profile?.bio || profile?.professionalBio,
  ];
  const filledCount = fields.filter((f) => Boolean(f)).length;
  return Math.round((filledCount / fields.length) * 100);
}

function formatAgentProfileResponse(rawDoc: any) {
  if (!rawDoc) return rawDoc;
  const profile = rawDoc.toObject ? rawDoc.toObject() : { ...rawDoc };
  const user = profile.userId && typeof profile.userId === 'object' ? profile.userId : null;

  const age = calculateAge(profile.dateOfBirth || user?.dateOfBirth);
  const profileCompletion = calculateProfileCompletion(profile, user);

  const fullName = profile.fullName || profile.name || user?.name || '';
  const nationality = profile.nationality || profile.country || user?.country || '';
  const licenseId = profile.licenseId || profile.fifaLicenseNumber || user?.fifaLicenseNumber || '';
  const contact = profile.contact || profile.phone || user?.phone || '';
  const email = user?.email || profile.email || '';
  const avatar = profile.avatar || user?.avatar || '';
  const coverPhoto = profile.coverPhoto || user?.coverPhoto || '';
  const certifications = profile.certifications || 'FIFA Licensed Agent';
  const bio = profile.bio || profile.professionalBio || '';

  return {
    ...profile,
    fullName,
    name: fullName,
    nationality,
    country: nationality,
    licenseId,
    fifaLicenseNumber: licenseId,
    dateOfBirth: profile.dateOfBirth || user?.dateOfBirth || null,
    age,
    contact,
    phone: contact,
    email,
    avatar,
    coverPhoto,
    certifications,
    achievements: profile.achievements || '',
    bio,
    professionalBio: bio,
    agencyName: profile.agencyName || user?.agencyName || '',
    officialWebsite: profile.officialWebsite || user?.officialWebsite || '',
    countryOfOperation: profile.countryOfOperation || user?.countryOfOperation || '',
    profileCompletion,
    tier: 'ACTIVE AGENT',
    currentTier: 'ACTIVE AGENT',
    isVerified: profile.verificationStatus === 'APPROVED' || Boolean(user?.isVerified),
    personalInformation: {
      fullName,
      nationality,
      licenseId,
      dateOfBirth: profile.dateOfBirth || user?.dateOfBirth || null,
      age,
      contact,
      email,
      coverPhoto,
      avatar,
    },
    professionalDetails: {
      yearsOfExperience: profile.yearsOfExperience ?? null,
      certifications,
      achievements: profile.achievements || '',
      agencyName: profile.agencyName || user?.agencyName || '',
      officialWebsite: profile.officialWebsite || user?.officialWebsite || '',
      countryOfOperation: profile.countryOfOperation || user?.countryOfOperation || '',
    },
    biography: {
      bio,
      professionalBio: bio,
    },
    headerCard: {
      fullName,
      tagline: `PREMIUM AGENT • ${age ? `${age} YEARS OLD • ` : ''}${nationality.toUpperCase() || 'BRAZIL'}`,
      licenseId,
      certifications,
      contact,
      email,
      coverPhoto,
      avatar,
      profileCompletion,
      tier: 'ACTIVE AGENT',
    },
    licensedVerification: {
      status: profile.verificationStatus || user?.verificationStatus || 'PENDING',
      statusLabel:
        (profile.verificationStatus || user?.verificationStatus) === 'APPROVED'
          ? 'Approved'
          : (profile.verificationStatus || user?.verificationStatus) === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      isVerified: profile.verificationStatus === 'APPROVED' || Boolean(user?.isVerified),
      message:
        profile.verificationStatus === 'APPROVED' || user?.isVerified
          ? 'Your account is currently verified'
          : profile.verificationStatus === 'REJECTED'
            ? 'Your verification request was rejected. Please upload valid documents.'
            : 'Your verification documents are currently under review',
      documents: [
        {
          documentType: 'LICENSE_CERTIFICATE',
          title: 'License Certificate',
          status: profile.verificationStatus || 'PENDING',
          statusLabel:
            profile.verificationStatus === 'APPROVED'
              ? 'Approved'
              : profile.verificationStatus === 'REJECTED'
                ? 'Rejected'
                : 'Pending',
          fileUrl: profile.licenseCertificateDocument || user?.licenseCertificateDocument || null,
          isUploaded: Boolean(
            profile.licenseCertificateDocument || user?.licenseCertificateDocument,
          ),
        },
        {
          documentType: 'NATIONAL_ID_PASSPORT',
          title: 'National ID / Passport',
          status: profile.verificationStatus || 'PENDING',
          statusLabel:
            profile.verificationStatus === 'APPROVED'
              ? 'Approved'
              : profile.verificationStatus === 'REJECTED'
                ? 'Rejected'
                : 'Pending',
          fileUrl: profile.identityDocument || user?.identityDocument || null,
          isUploaded: Boolean(profile.identityDocument || user?.identityDocument),
        },
        {
          documentType: 'ASSOCIATION_MEMBERSHIP',
          title: 'Association Membership',
          status: profile.verificationStatus || 'PENDING',
          statusLabel:
            profile.verificationStatus === 'APPROVED'
              ? 'Approved'
              : profile.verificationStatus === 'REJECTED'
                ? 'Rejected'
                : 'Pending',
          fileUrl: profile.associationMembershipDocument || null,
          isUploaded: Boolean(profile.associationMembershipDocument),
        },
      ],
    },
  };
}

export class AgentService {
  async getMyAgentProfile(userId: string) {
    let profile = await AgentProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone country role coverPhoto dateOfBirth',
    );
    if (!profile) {
      profile = await AgentProfile.create({ userId: new Types.ObjectId(userId) });
      profile = await AgentProfile.findById(profile._id).populate(
        'userId',
        'name email avatar phone country role coverPhoto dateOfBirth',
      );
    }
    return formatAgentProfileResponse(profile);
  }

  async updateMyAgentProfile(userId: string, rawPayload: any) {
    const payload = { ...rawPayload };

    // Standardize field aliases
    if (payload.fullName) {
      payload.name = payload.fullName;
    } else if (payload.name) {
      payload.fullName = payload.name;
    }

    if (payload.nationality) {
      payload.country = payload.nationality;
    } else if (payload.country) {
      payload.nationality = payload.country;
    }

    if (payload.licenseId) {
      payload.fifaLicenseNumber = payload.licenseId;
    } else if (payload.fifaLicenseNumber) {
      payload.licenseId = payload.fifaLicenseNumber;
    }

    if (payload.contact) {
      payload.phone = payload.contact;
    } else if (payload.phone) {
      payload.contact = payload.phone;
    }

    if (payload.bio) {
      payload.professionalBio = payload.bio;
    } else if (payload.professionalBio) {
      payload.bio = payload.professionalBio;
    }

    if (
      payload.yearsOfExperience !== undefined &&
      payload.yearsOfExperience !== null &&
      payload.yearsOfExperience !== ''
    ) {
      payload.yearsOfExperience = Number(payload.yearsOfExperience);
    }

    if (payload.dateOfBirth) {
      const birthDate = new Date(payload.dateOfBirth);
      if (!isNaN(birthDate.getTime())) {
        payload.dateOfBirth = birthDate;
        payload.age = calculateAge(birthDate);
      }
    }

    // Calculate profile completion
    const currentUser = await UserModel.findById(userId).lean();
    payload.profileCompletion = calculateProfileCompletion(payload, currentUser);

    const updated = await AgentProfile.findOneAndUpdate(
      { userId },
      { $set: payload },
      { new: true, upsert: true },
    ).populate('userId', 'name email avatar phone country role coverPhoto dateOfBirth');

    // Keep UserModel in sync with profile and documents
    const userUpdates: Record<string, unknown> = {};
    if (payload.fullName || payload.name) userUpdates.name = payload.fullName || payload.name;
    if (payload.phone || payload.contact) userUpdates.phone = payload.phone || payload.contact;
    if (payload.country || payload.nationality) {
      userUpdates.country = payload.country || payload.nationality;
    }
    if (payload.avatar) userUpdates.avatar = payload.avatar;
    if (payload.coverPhoto) userUpdates.coverPhoto = payload.coverPhoto;
    if (payload.dateOfBirth) userUpdates.dateOfBirth = payload.dateOfBirth;
    if (payload.age !== undefined) userUpdates.age = payload.age;
    if (payload.fifaLicenseNumber || payload.licenseId) {
      userUpdates.fifaLicenseNumber = payload.fifaLicenseNumber || payload.licenseId;
    }
    if (payload.agencyName) userUpdates.agencyName = payload.agencyName;
    if (payload.officialWebsite) userUpdates.officialWebsite = payload.officialWebsite;
    if (payload.countryOfOperation) userUpdates.countryOfOperation = payload.countryOfOperation;
    if (payload.licenseCertificateDocument) {
      userUpdates.licenseCertificateDocument = payload.licenseCertificateDocument;
    }
    if (payload.identityDocument) {
      userUpdates.identityDocument = payload.identityDocument;
    }
    if (payload.profileCompletion !== undefined) {
      userUpdates.profileCompletion = payload.profileCompletion;
    }

    if (Object.keys(userUpdates).length > 0) {
      await UserModel.findByIdAndUpdate(userId, { $set: userUpdates });
    }

    // Sync verification documents table
    if (payload.licenseCertificateDocument) {
      await VerificationDocument.findOneAndUpdate(
        { agentId: new Types.ObjectId(userId), documentType: 'LICENSE_CERTIFICATE' },
        { fileUrl: payload.licenseCertificateDocument, status: 'PENDING' },
        { upsert: true },
      );
    }
    if (payload.identityDocument) {
      await VerificationDocument.findOneAndUpdate(
        { agentId: new Types.ObjectId(userId), documentType: 'NATIONAL_ID_PASSPORT' },
        { fileUrl: payload.identityDocument, status: 'PENDING' },
        { upsert: true },
      );
    }
    if (payload.associationMembershipDocument) {
      await VerificationDocument.findOneAndUpdate(
        { agentId: new Types.ObjectId(userId), documentType: 'ASSOCIATION_MEMBERSHIP' },
        { fileUrl: payload.associationMembershipDocument, status: 'PENDING' },
        { upsert: true },
      );
    }

    if (
      payload.licenseCertificateDocument ||
      payload.identityDocument ||
      payload.associationMembershipDocument
    ) {
      const user = await UserModel.findById(userId);
      const admins = await UserModel.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] } }).select(
        '_id role',
      );
      for (const admin of admins) {
        await Notification.create({
          recipientId: admin._id,
          recipientRole: admin.role,
          title: 'New Agent Verification Request',
          message: `${user?.name || 'A Football Agent'} has submitted FIFA license and verification documents for review.`,
          type: 'VERIFICATION',
          data: { userId, role: 'AGENT' },
        });
      }
    }

    return formatAgentProfileResponse(updated);
  }

  async createProfile(payload: Partial<IAgentProfile>) {
    const existing = await AgentProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Agent profile already exists');
    }
    return AgentProfile.create(payload);
  }

  async getProfileById(id: string) {
    const profile = await AgentProfile.findById(id).populate(
      'userId',
      'name email avatar phone country role coverPhoto dateOfBirth',
    );
    if (!profile) {
      throw new AppError(404, 'Agent profile not found');
    }
    return formatAgentProfileResponse(profile);
  }

  async uploadVerificationDocument(
    agentIdOrUserId: string,
    payload: Partial<IVerificationDocument>,
  ) {
    let agentUserId = agentIdOrUserId;
    if (Types.ObjectId.isValid(agentIdOrUserId)) {
      const profile = await AgentProfile.findOne({
        $or: [{ _id: agentIdOrUserId }, { userId: agentIdOrUserId }],
      });
      if (profile) {
        agentUserId = profile.userId.toString();
      }
    }

    const doc = await VerificationDocument.create({
      ...payload,
      agentId: new Types.ObjectId(agentUserId),
    });

    // Also sync to AgentProfile and UserModel
    if (payload.fileUrl && payload.documentType) {
      const fieldMap: Record<string, string> = {
        LICENSE_CERTIFICATE: 'licenseCertificateDocument',
        NATIONAL_ID_PASSPORT: 'identityDocument',
        ASSOCIATION_MEMBERSHIP: 'associationMembershipDocument',
      };
      const fieldName = fieldMap[payload.documentType];
      if (fieldName) {
        await AgentProfile.findOneAndUpdate(
          { userId: agentUserId },
          { $set: { [fieldName]: payload.fileUrl } },
          { upsert: true },
        );
        if (fieldName !== 'associationMembershipDocument') {
          await UserModel.findByIdAndUpdate(agentUserId, {
            $set: { [fieldName]: payload.fileUrl },
          });
        }
      }
    }

    return doc;
  }

  async getVerificationDocuments(agentIdOrUserId: string) {
    let agentUserId = agentIdOrUserId;
    let profile: any = null;
    if (Types.ObjectId.isValid(agentIdOrUserId)) {
      profile = await AgentProfile.findOne({
        $or: [{ _id: agentIdOrUserId }, { userId: agentIdOrUserId }],
      }).lean();
      if (profile) {
        agentUserId = profile.userId.toString();
      }
    }
    if (!profile && Types.ObjectId.isValid(agentUserId)) {
      profile = await AgentProfile.findOne({ userId: agentUserId }).lean();
    }

    const [user, docs] = await Promise.all([
      UserModel.findById(agentUserId).lean(),
      VerificationDocument.find({
        $or: [
          { agentId: agentUserId },
          ...(Types.ObjectId.isValid(agentUserId)
            ? [{ agentId: new Types.ObjectId(agentUserId) }]
            : []),
        ],
      }).sort({ createdAt: -1 }),
    ]);

    const docConfigs = [
      {
        documentType: 'LICENSE_CERTIFICATE',
        title: 'License Certificate',
        fileKey: 'licenseCertificateDocument',
        description: 'PDF, JPG, PNG (Max 10MB)',
        fallbackUrl: profile?.licenseCertificateDocument || user?.licenseCertificateDocument,
      },
      {
        documentType: 'NATIONAL_ID_PASSPORT',
        title: 'National ID / Passport',
        fileKey: 'identityDocument',
        description: 'PDF, JPG, PNG (Max 10MB)',
        fallbackUrl: profile?.identityDocument || user?.identityDocument,
      },
      {
        documentType: 'ASSOCIATION_MEMBERSHIP',
        title: 'Association Membership',
        fileKey: 'associationMembershipDocument',
        description: 'PDF, JPG, PNG (Max 10MB)',
        fallbackUrl: profile?.associationMembershipDocument,
      },
    ];

    const documents = docConfigs.map((cfg) => {
      const found = docs.find((d) => d.documentType === cfg.documentType);
      const fileUrl = found?.fileUrl || cfg.fallbackUrl || null;
      const docStatus = found?.status || (fileUrl ? 'PENDING' : 'PENDING');
      const uploadedAt =
        found?.updatedAt || found?.createdAt || (fileUrl ? profile?.updatedAt || new Date() : null);

      return {
        _id: found?._id || null,
        documentType: cfg.documentType,
        title: cfg.title,
        description: cfg.description,
        fileKey: cfg.fileKey,
        status: docStatus,
        statusLabel:
          docStatus === 'APPROVED' ? 'Approved' : docStatus === 'REJECTED' ? 'Rejected' : 'Pending',
        isUploaded: Boolean(fileUrl),
        fileUrl,
        uploadedAt,
        adminReviewNotes: (found as any)?.adminReviewNotes || '',
      };
    });

    const hasAnyRejected = documents.some((d) => d.status === 'REJECTED');
    const hasAnyPending = documents.some((d) => d.status === 'PENDING');
    const allApproved = documents.every((d) => d.status === 'APPROVED');

    let overallStatus = profile?.verificationStatus || user?.verificationStatus || 'PENDING';
    if (allApproved) {
      overallStatus = 'APPROVED';
    } else if (hasAnyRejected) {
      overallStatus = 'REJECTED';
    } else if (hasAnyPending) {
      overallStatus = 'PENDING';
    }

    const isVerified = overallStatus === 'APPROVED';

    const statusMessage = isVerified
      ? 'Your account is currently verified'
      : overallStatus === 'PENDING'
        ? 'Your verification documents are currently under review'
        : 'One or more verification documents were rejected. Please re-upload required documents.';

    return {
      verificationStatus: overallStatus,
      status: overallStatus,
      statusLabel:
        overallStatus === 'APPROVED'
          ? 'Approved'
          : overallStatus === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      isVerified,
      message: statusMessage,
      adminReviewNotes: profile?.adminReviewNotes || user?.adminReviewNotes || '',
      documents,
      uploadEndpoint: {
        method: 'PATCH',
        url: '/api/v1/agents/agent-profile',
        supportedFileKeys: [
          'licenseCertificateDocument',
          'identityDocument',
          'associationMembershipDocument',
        ],
      },
      rawDocuments: docs,
    };
  }

  async createSuccessStory(creatorId: string, payload: any, creatorRole: string = 'AGENT') {
    const storyTitle = payload.storyTitle || payload.title;
    const category = payload.category;
    if (!storyTitle) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Story title is required');
    }
    if (!category) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Category is required');
    }

    const img = payload.image || payload.photo || payload.coverImage || '';
    const isSuperAdmin = creatorRole === 'SUPER_ADMIN';
    const initialStatus = isSuperAdmin ? 'APPROVED' : 'PENDING';

    const story = await SuccessStory.create({
      creatorId,
      creatorRole,
      storyTitle,
      category,
      playerName: payload.playerName || '',
      position: payload.position || '',
      previousAcademy: payload.previousAcademy || '',
      date: payload.date ? new Date(payload.date) : new Date(),
      signedClub: payload.signedClub || payload.achievement || '',
      image: img,
      photo: img,
      storyContent: payload.storyContent || payload.content || '',
      status: initialStatus,
      adminReviewNotes: '',
      isDeleted: false,
    });

    // Notify admins of new success story submitted for review
    if (!isSuperAdmin) {
      const creatorUser = await UserModel.findById(creatorId).select('name email agencyName');
      const creatorName = creatorUser?.agencyName || creatorUser?.name || 'An Agent';
      const admins = await UserModel.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] } }).select(
        '_id role',
      );
      for (const admin of admins) {
        await Notification.create({
          recipientId: admin._id,
          recipientRole: admin.role,
          title: 'New Agent Success Story Submitted for Approval',
          message: `${creatorName} has submitted a new success story "${storyTitle}" for review and approval.`,
          type: 'STORY',
          data: { creatorId, storyId: story._id },
        });
      }
    }

    return {
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      playerName: story.playerName,
      position: story.position,
      previousAcademy: story.previousAcademy,
      signedClub: story.signedClub,
      date: story.date,
      formattedDate: story.formattedDate,
      image: story.image,
      storyContent: story.storyContent,
      status: story.status,
      statusLabel:
        story.status === 'APPROVED'
          ? 'Approved'
          : story.status === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      createdAt: story.createdAt,
    };
  }

  async getSuccessStories(query: any = {}, callerUser?: any) {
    const filter: any = { isDeleted: false };

    // If caller is an agent or coach, default to showing their own stories (so they see Approved, Pending, Rejected in their dashboard)
    if (callerUser && ['AGENT', 'COACH'].includes(callerUser.role)) {
      filter.creatorId = callerUser.userId || callerUser.id;
    } else if (callerUser && ['SUPER_ADMIN', 'ADMIN'].includes(callerUser.role)) {
      if (query.creatorId) {
        filter.creatorId = query.creatorId;
      }
    } else {
      // Public / guest callers only see APPROVED stories
      filter.status = 'APPROVED';
    }

    if (query.status && query.status !== 'ALL') {
      filter.status = String(query.status).toUpperCase();
    }

    if (query.category && query.category !== 'ALL') {
      filter.category = new RegExp(String(query.category).trim(), 'i');
    }

    if (query.searchTerm) {
      const searchRegex = new RegExp(String(query.searchTerm).trim(), 'i');
      filter.$or = [
        { storyTitle: searchRegex },
        { playerName: searchRegex },
        { signedClub: searchRegex },
        { category: searchRegex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));

    const total = await SuccessStory.countDocuments(filter);
    const stories = await SuccessStory.find(filter)
      .populate('creatorId', 'name email avatar agencyName')
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
        playerName: s.playerName || '',
        position: s.position || '',
        previousAcademy: s.previousAcademy || '',
        signedClub: s.signedClub || '',
        date: s.date,
        formattedDate:
          s.formattedDate || (s.date ? new Date(s.date).toISOString().split('T')[0] : ''),
        image: s.image || '',
        storyContent: s.storyContent || '',
        status: s.status,
        statusLabel:
          s.status === 'APPROVED' ? 'Approved' : s.status === 'REJECTED' ? 'Rejected' : 'Pending',
        adminReviewNotes: s.adminReviewNotes || '',
        creatorId: s.creatorId,
        createdAt: s.createdAt,
      })),
    };
  }

  async getSuccessStoryById(storyId: string, callerUser?: any) {
    const filter: any = { _id: storyId, isDeleted: false };
    if (callerUser && ['AGENT', 'COACH'].includes(callerUser.role)) {
      filter.creatorId = callerUser.userId || callerUser.id;
    }
    const story = await SuccessStory.findOne(filter).populate(
      'creatorId',
      'name email avatar agencyName',
    );
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    return {
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      playerName: story.playerName || '',
      position: story.position || '',
      previousAcademy: story.previousAcademy || '',
      signedClub: story.signedClub || '',
      date: story.date,
      formattedDate:
        story.formattedDate || (story.date ? new Date(story.date).toISOString().split('T')[0] : ''),
      image: story.image || '',
      storyContent: story.storyContent || '',
      status: story.status,
      statusLabel:
        story.status === 'APPROVED'
          ? 'Approved'
          : story.status === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      adminReviewNotes: story.adminReviewNotes || '',
      creator: story.creatorId,
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
    };
  }

  async updateSuccessStory(
    userId: string,
    storyId: string,
    payload: any,
    userRole: string = 'AGENT',
  ) {
    const filter: any = { _id: storyId, isDeleted: false };
    if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
      filter.creatorId = userId;
    }

    const story = await SuccessStory.findOne(filter);
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    if (payload.storyTitle || payload.title) story.storyTitle = payload.storyTitle || payload.title;
    if (payload.category) story.category = payload.category;
    if (payload.playerName !== undefined) story.playerName = payload.playerName;
    if (payload.position !== undefined) story.position = payload.position;
    if (payload.previousAcademy !== undefined) story.previousAcademy = payload.previousAcademy;
    if (payload.signedClub !== undefined || payload.achievement !== undefined) {
      story.signedClub = payload.signedClub ?? payload.achievement;
    }
    if (payload.date) story.date = new Date(payload.date);
    if (payload.image || payload.photo || payload.coverImage) {
      story.image = payload.image || payload.photo || payload.coverImage;
    }
    if (payload.storyContent !== undefined || payload.content !== undefined) {
      story.storyContent = payload.storyContent ?? payload.content;
    }

    // Editing re-submits for approval if updated by agent/coach
    if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
      story.status = 'PENDING';
    }
    await story.save();

    return {
      _id: story._id,
      storyTitle: story.storyTitle,
      category: story.category,
      playerName: story.playerName,
      position: story.position,
      previousAcademy: story.previousAcademy,
      signedClub: story.signedClub,
      date: story.date,
      formattedDate: story.formattedDate,
      image: story.image,
      storyContent: story.storyContent,
      status: story.status,
      statusLabel:
        story.status === 'APPROVED'
          ? 'Approved'
          : story.status === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      adminReviewNotes: story.adminReviewNotes,
      createdAt: story.createdAt,
    };
  }

  async deleteSuccessStory(userId: string, storyId: string, userRole: string = 'AGENT') {
    const filter: any = { _id: storyId, isDeleted: false };
    if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
      filter.creatorId = userId;
    }

    const story = await SuccessStory.findOne(filter);
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    story.isDeleted = true;
    story.deletedAt = new Date();
    await story.save();

    return { message: 'Success story deleted successfully' };
  }

  async reviewSuccessStory(
    storyId: string,
    status: 'APPROVED' | 'REJECTED',
    adminReviewNotes?: string,
  ) {
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Status must be APPROVED or REJECTED');
    }

    const story = await SuccessStory.findByIdAndUpdate(
      storyId,
      { status, adminReviewNotes: adminReviewNotes || '' },
      { new: true },
    );
    if (!story) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Success story not found');
    }

    if (story.creatorId) {
      await Notification.create({
        recipientId: story.creatorId,
        recipientRole: story.creatorRole || 'AGENT',
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

  async getAgentDashboard(userId: string) {
    const rawProfile = await this.getMyAgentProfile(userId);
    const profile = (rawProfile || {}) as any;
    const user = await UserModel.findById(userId).lean();

    const [totalPlayersCount, totalCoachesCount, subscription] = await Promise.all([
      PlayerProfile.countDocuments({}),
      CoachProfile.countDocuments({}),
      UserSubscription.findOne({ userId, status: 'ACTIVE' }).populate('planId').lean(),
    ]);

    const isApproved =
      profile.verificationStatus === 'APPROVED' ||
      user?.verificationStatus === 'APPROVED' ||
      Boolean(user?.isVerified);

    return {
      agent: {
        id: profile._id || null,
        name: user?.name || '',
        email: user?.email || '',
        phone: user?.phone || '',
        country: user?.country || '',
        avatar: user?.avatar || '',
        agencyName: profile.agencyName || user?.agencyName || '',
        fifaLicenseNumber:
          profile.fifaLicenseNumber || profile.licenseId || user?.fifaLicenseNumber || '',
        officialWebsite: profile.officialWebsite || user?.officialWebsite || '',
        verificationStatus: profile.verificationStatus || user?.verificationStatus || 'PENDING',
        isApproved,
        verifiedAt: profile.verifiedAt || user?.verifiedAt || null,
        cvsSharedCount: profile.cvsSharedCount || 0,
      },
      metrics: {
        players: { label: 'REGISTERED PLAYERS', count: totalPlayersCount },
        coaches: { label: 'REGISTERED COACHES', count: totalCoachesCount },
        cvsShared: { label: 'CVS SHARED', count: profile.cvsSharedCount || 0 },
        verification: {
          label: 'VERIFICATION STATUS',
          status: profile.verificationStatus || user?.verificationStatus || 'PENDING',
          isApproved,
        },
      },
      subscription: subscription
        ? {
            status: subscription.status,
            plan: subscription.planId,
            nextBillingDate: subscription.nextBillingDate,
            amountPaid: subscription.amountPaid,
          }
        : null,
      accessStatus: {
        isApproved,
        hasActiveSubscription: Boolean(subscription),
        isAccessActive: isApproved && Boolean(subscription),
      },
    };
  }

  async getAgentAnalytics(userId: string, query: any = {}) {
    const club = await clubService.resolveClub(userId);
    const agentProfile = await AgentProfile.findOne({ userId });

    const selectedYear = query.year ? Number(query.year) : new Date().getFullYear();
    const startOfYear = new Date(Date.UTC(selectedYear, 0, 1, 0, 0, 0));
    const endOfYear = new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59, 999));

    // Filter viewed profiles for the selected year
    const viewedProfiles = (club.viewedPlayerProfiles || []).filter((v: any) => {
      if (!v.viewedAt) return true;
      const d = new Date(v.viewedAt);
      return d >= startOfYear && d <= endOfYear;
    });
    const playersProfileViewedCount = viewedProfiles.length;

    // Filter liked CVs for the selected year
    const likedCvsCount = await ClubFavourite.countDocuments({
      clubId: club._id,
      targetType: 'PLAYER',
      createdAt: { $gte: startOfYear, $lte: endOfYear },
    });

    // Filter shared profiles for the selected year
    const sharedProfiles = (club.sharedPlayerProfiles || []).filter((s: any) => {
      if (!s.sharedAt) return true;
      const d = new Date(s.sharedAt);
      return d >= startOfYear && d <= endOfYear;
    });
    const sharedProfilesCount = sharedProfiles.reduce(
      (sum: number, s: any) => sum + (s.shareCount || 1),
      0,
    );

    const totalViewsOnPlayers = viewedProfiles.reduce(
      (sum: number, v: any) => sum + (v.viewCount || 1),
      0,
    );
    const profileViewsCount =
      club.profileViews ||
      totalViewsOnPlayers ||
      (agentProfile?.cvsSharedCount ? agentProfile.cvsSharedCount * 12 : 0) ||
      0;

    const now = new Date();
    const isCurrentYear = selectedYear === now.getFullYear();

    const weeks = isCurrentYear
      ? [
          {
            week: 'Week 1',
            start: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000),
            end: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 2',
            start: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000),
            end: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 3',
            start: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
            end: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 4',
            start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            end: now,
            views: 0,
            likes: 0,
            shares: 0,
          },
        ]
      : [
          {
            week: 'Week 1',
            start: new Date(Date.UTC(selectedYear, 0, 1)),
            end: new Date(Date.UTC(selectedYear, 2, 31, 23, 59, 59)),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 2',
            start: new Date(Date.UTC(selectedYear, 3, 1)),
            end: new Date(Date.UTC(selectedYear, 5, 30, 23, 59, 59)),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 3',
            start: new Date(Date.UTC(selectedYear, 6, 1)),
            end: new Date(Date.UTC(selectedYear, 8, 30, 23, 59, 59)),
            views: 0,
            likes: 0,
            shares: 0,
          },
          {
            week: 'Week 4',
            start: new Date(Date.UTC(selectedYear, 9, 1)),
            end: new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59)),
            views: 0,
            likes: 0,
            shares: 0,
          },
        ];

    viewedProfiles.forEach((v: any) => {
      const vDate = v.viewedAt ? new Date(v.viewedAt) : now;
      for (const w of weeks) {
        if (vDate >= w.start && vDate <= w.end) {
          w.views += v.viewCount || 1;
          break;
        }
      }
    });

    const favs = await ClubFavourite.find({
      clubId: club._id,
      targetType: 'PLAYER',
      createdAt: { $gte: weeks[0].start, $lte: weeks[weeks.length - 1].end },
    }).select('createdAt');

    favs.forEach((f: any) => {
      const fDate = new Date(f.createdAt);
      for (const w of weeks) {
        if (fDate >= w.start && fDate <= w.end) {
          w.likes++;
          break;
        }
      }
    });

    sharedProfiles.forEach((s: any) => {
      const sDate = s.sharedAt ? new Date(s.sharedAt) : now;
      for (const w of weeks) {
        if (sDate >= w.start && sDate <= w.end) {
          w.shares += s.shareCount || 1;
          break;
        }
      }
    });

    return {
      selectedYear,
      title: 'Analytics For Players Monitored',
      subtitle: 'Insights Based on Players Interactions, Profile Activity & Performance Data.',
      overview: {
        playersProfileViewed: {
          label: 'Players Profile Viewed',
          count: playersProfileViewedCount,
        },
        likedCvs: {
          label: 'Liked CVs',
          count: likedCvsCount,
        },
        sharedProfiles: {
          label: 'Shared Profiles',
          count: sharedProfilesCount,
        },
        profileViews: {
          label: 'Profile Views',
          count: profileViewsCount,
        },
      },
      cvsViewsOverTime: weeks.map((w) => ({
        week: w.week,
        views: w.views,
      })),
      likesAndSharesActivity: weeks.map((w) => ({
        week: w.week,
        likes: w.likes,
        shares: w.shares,
      })),
    };
  }
}

export const agentService = new AgentService();
