import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { IAcademyProfile, ITeam, IGameReport, IPlayerEvaluation } from './academy.interface';
import {
  AcademyProfile,
  Team,
  GameReport,
  PlayerEvaluation,
  AcademyCoach,
  TransferRequest,
} from './academy.model';
import QueryBuilder from '@/builder/QueryBuilder';

import bcrypt from 'bcryptjs';
import { NotificationService } from '@/modules/notification/notification.service';
import { PlayerProfile, PlayerAttributes, MatchRecord } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { User } from '@/modules/user/user.model';
import { ParentProfile, ParentChild } from '@/modules/parent/parent.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { playerCacheService } from '@/modules/player/services/player-cache.service';

const notificationService = new NotificationService();

export class AcademyService {
  async createProfile(payload: Partial<IAcademyProfile>) {
    const existing = await AcademyProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Academy profile already exists');
    }
    return AcademyProfile.create(payload);
  }

  async getProfileById(id: string) {
    let profile = null;
    if (Types.ObjectId.isValid(id)) {
      profile = await AcademyProfile.findOne({
        $or: [{ _id: id }, { userId: id }],
      }).populate('userId', 'name email avatar phone');
    }
    if (!profile) {
      throw new AppError(404, 'Academy profile not found');
    }
    return profile;
  }

  async getMyProfile(userId: string) {
    const profile = await AcademyProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone',
    );
    if (!profile) {
      throw new AppError(404, 'Academy profile not found for this user');
    }
    return profile;
  }

  async getAllProfiles(query: Record<string, unknown> = {}) {
    const academyQuery = new QueryBuilder(
      AcademyProfile.find().populate('userId', 'name email avatar phone'),
      query,
    )
      .search([
        'name',
        'category',
        'country',
        'city',
        'location',
        'registrationId',
        'estimatedAcademySize',
      ])
      .filter()
      .sort()
      .paginate()
      .fields();

    const result = await academyQuery.modelQuery;
    const meta = await academyQuery.countTotal();
    return { meta, result };
  }

  async resolveAcademyProfile(identifier: string) {
    if (!identifier) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Academy identifier is required');
    }
    let academy = null;
    if (Types.ObjectId.isValid(identifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: identifier }, { userId: identifier }],
      });
    }
    if (!academy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy profile not found');
    }
    return academy;
  }

  // ==========================================
  // COACH AND PLAYERS DASHBOARD & TEAM ROSTER
  // ==========================================
  async getCoachAndPlayersDashboard(academyIdentifier: string) {
    const academy = await this.resolveAcademyProfile(academyIdentifier);

    // 1. Fetch Teams with populated coaches and players
    const teams = await Team.find({ academyId: academy._id })
      .populate(
        'coachIds',
        'fullName title profileImage licenseStatus cvTier yearsExperience phone email',
      )
      .populate('playerIds', 'fullName position profileImage overallRating age cvTier dateOfBirth')
      .sort({ createdAt: -1 });

    const formattedTeams = teams.map((team) => {
      const cCount = team.coachIds ? team.coachIds.length : team.coachesCount || 0;
      const pCount = team.playerIds ? team.playerIds.length : team.playersCount || 0;
      const tMembers = cCount + pCount;
      return {
        _id: team._id,
        academyId: team.academyId,
        teamName: team.teamName,
        ageGroup: team.ageGroup,
        coachesCount: cCount,
        playersCount: pCount,
        totalMembers: tMembers,
        status: team.status || 'ACTIVE',
        coachIds: team.coachIds,
        playerIds: team.playerIds,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      };
    });

    // 2. Total Teams count
    const totalTeams = teams.length;

    // 3. Total Coaches count in academy
    const approvedCoachAffiliationIds = await AcademyCoach.find({
      academyId: academy._id,
      status: 'APPROVED',
    }).distinct('coachId');

    const directCoachIds = await CoachProfile.find({
      academyId: academy._id,
    }).distinct('_id');

    const uniqueCoachIdStrings = new Set([
      ...approvedCoachAffiliationIds.map((id) => id.toString()),
      ...directCoachIds.map((id) => id.toString()),
    ]);
    const totalCoaches = uniqueCoachIdStrings.size;

    // 4. Total Players count in academy
    const totalPlayers = await PlayerProfile.countDocuments({
      $or: [{ academyId: academy._id }, { academy: academy.name }],
    });

    // 5. Total Roster Members (Coaches + Players)
    const totalRosterMembers = totalCoaches + totalPlayers;

    // 6. Plan & Team Capacity details
    const currentPlan = academy.currentPlan || 'FREE';
    const isPremium = currentPlan === 'PREMIUM';
    const isUnlimited = isPremium || (academy.maxTeams !== undefined && academy.maxTeams >= 99999);

    const planLimits: Record<string, number> = {
      FREE: 1,
      BASIC: 3,
      PRO: 5,
      PREMIUM: 999999,
    };
    const maxTeams = isUnlimited
      ? 999999
      : academy.maxTeams && academy.maxTeams > 0
        ? academy.maxTeams
        : planLimits[currentPlan] || 1;

    const usedTeams = totalTeams;
    const capacityDisplay = isUnlimited ? `${usedTeams}/∞` : `${usedTeams}/${maxTeams}`;
    const usagePercentage = isUnlimited
      ? 0
      : Math.min(100, Math.round((usedTeams / maxTeams) * 100));
    const isLimitReached = !isUnlimited && usedTeams >= maxTeams;

    const message = isUnlimited
      ? 'Premium Plan Active: Unlimited team slots available.'
      : isLimitReached
        ? `You are using ${usedTeams} out of ${maxTeams} available team slot. Upgrade your plan for more.`
        : `You are using ${usedTeams} out of ${maxTeams} available team slots. You have ${maxTeams - usedTeams} slot(s) remaining.`;

    return {
      summary: {
        totalTeams,
        totalCoaches,
        totalPlayers,
        totalRosterMembers,
      },
      teamCapacity: {
        currentPlan,
        usedTeams,
        maxTeams: isUnlimited ? null : maxTeams,
        isUnlimited,
        capacityDisplay,
        usagePercentage,
        isLimitReached,
        upgradeRequired: !isUnlimited && isLimitReached,
        message,
      },
      teams: formattedTeams,
    };
  }

  async getAvailableMembers(academyIdentifier: string) {
    const academy = await this.resolveAcademyProfile(academyIdentifier);

    // Fetch all approved coach affiliations
    const approvedAffiliations = await AcademyCoach.find({
      academyId: academy._id,
      status: 'APPROVED',
    }).populate(
      'coachId',
      'fullName title profileImage licenseStatus cvTier yearsExperience phone email',
    );

    // Fetch direct coaches
    const directCoaches = await CoachProfile.find({
      academyId: academy._id,
    }).select('fullName title profileImage licenseStatus cvTier yearsExperience phone email');

    const coachMap = new Map();
    approvedAffiliations.forEach((aff: any) => {
      if (aff.coachId && aff.coachId._id) {
        coachMap.set(aff.coachId._id.toString(), aff.coachId);
      }
    });
    directCoaches.forEach((c: any) => {
      coachMap.set(c._id.toString(), c);
    });

    const allTeams = await Team.find({ academyId: academy._id }).select(
      'teamName coachIds playerIds',
    );

    const coaches = Array.from(coachMap.values()).map((coach: any) => {
      const assignedTeam = allTeams.find(
        (t) => t.coachIds && t.coachIds.some((id: any) => id.toString() === coach._id.toString()),
      );
      return {
        _id: coach._id,
        fullName: coach.fullName,
        title: coach.title || 'Coach',
        profileImage: coach.profileImage,
        licenseStatus: coach.licenseStatus,
        cvTier: coach.cvTier,
        yearsExperience: coach.yearsExperience,
        assignedTeamId: assignedTeam ? assignedTeam._id : null,
        assignedTeamName: assignedTeam ? assignedTeam.teamName : null,
      };
    });

    // Players list
    const playersList = await PlayerProfile.find({
      $or: [{ academyId: academy._id }, { academy: academy.name }],
    }).select('fullName position age overallRating profileImage cvTier teamId');

    const players = playersList.map((player: any) => {
      const assignedTeam = allTeams.find(
        (t) =>
          (player.teamId && player.teamId.toString() === t._id.toString()) ||
          (t.playerIds && t.playerIds.some((id: any) => id.toString() === player._id.toString())),
      );
      return {
        _id: player._id,
        fullName: player.fullName,
        position: player.position,
        age: player.age,
        overallRating: player.overallRating,
        profileImage: player.profileImage,
        cvTier: player.cvTier,
        assignedTeamId: assignedTeam ? assignedTeam._id : null,
        assignedTeamName: assignedTeam ? assignedTeam.teamName : null,
      };
    });

    return { coaches, players };
  }

  async createTeam(
    academyIdentifier: string,
    payload: Partial<ITeam> & { coachIds?: string[]; playerIds?: string[] },
  ) {
    const academy = await this.resolveAcademyProfile(academyIdentifier);

    // Plan capacity check
    const existingTeamsCount = await Team.countDocuments({ academyId: academy._id });
    const currentPlan = academy.currentPlan || 'FREE';
    const isPremium = currentPlan === 'PREMIUM';
    const isUnlimited = isPremium || (academy.maxTeams !== undefined && academy.maxTeams >= 99999);

    if (!isUnlimited) {
      const planLimits: Record<string, number> = {
        FREE: 1,
        BASIC: 3,
        PRO: 5,
        PREMIUM: 999999,
      };
      const maxTeams =
        academy.maxTeams && academy.maxTeams > 0 ? academy.maxTeams : planLimits[currentPlan] || 1;

      if (existingTeamsCount >= maxTeams) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          `Team capacity limit reached for your ${currentPlan} plan (${existingTeamsCount}/${maxTeams}). Upgrade to Premium for unlimited teams.`,
        );
      }
    }

    const coachIds = (payload.coachIds || []).map((id) => new Types.ObjectId(id));
    const playerIds = (payload.playerIds || []).map((id) => new Types.ObjectId(id));

    if (coachIds.length > 2) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Maximum 2 coaches allowed per team');
    }
    if (playerIds.length > 18) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Maximum 18 players allowed per team');
    }

    const ageGroup =
      payload.ageGroup ||
      (payload.teamName && payload.teamName.match(/U-?\d+/i)
        ? payload.teamName.match(/U-?\d+/i)![0].toUpperCase()
        : 'U17');

    const newTeam = await Team.create({
      academyId: academy._id,
      teamName: payload.teamName,
      ageGroup,
      status: payload.status || 'ACTIVE',
      coachIds,
      playerIds,
      coachesCount: coachIds.length,
      playersCount: playerIds.length,
      totalMembers: coachIds.length + playerIds.length,
    });

    // Update assigned players
    if (playerIds.length > 0) {
      await PlayerProfile.updateMany(
        { _id: { $in: playerIds } },
        { $set: { teamId: newTeam._id, academyId: academy._id } },
      );
    }

    // Update assigned coaches
    if (coachIds.length > 0) {
      await CoachProfile.updateMany(
        { _id: { $in: coachIds } },
        { $addToSet: { teamIds: newTeam._id }, $set: { academyId: academy._id } },
      );
    }

    return Team.findById(newTeam._id)
      .populate(
        'coachIds',
        'fullName title profileImage licenseStatus cvTier yearsExperience phone email',
      )
      .populate('playerIds', 'fullName position profileImage overallRating age cvTier dateOfBirth');
  }

  async getTeams(academyIdentifier: string) {
    const academy = await this.resolveAcademyProfile(academyIdentifier);
    return Team.find({ academyId: academy._id })
      .populate(
        'coachIds',
        'fullName title profileImage licenseStatus cvTier yearsExperience phone email',
      )
      .populate('playerIds', 'fullName position profileImage overallRating age cvTier dateOfBirth')
      .sort({ createdAt: -1 });
  }

  async getTeamById(teamId: string) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid team ID');
    }
    const team = await Team.findById(teamId)
      .populate(
        'coachIds',
        'fullName title profileImage licenseStatus cvTier yearsExperience phone email',
      )
      .populate(
        'playerIds',
        'fullName position profileImage overallRating age cvTier dateOfBirth marketValue',
      )
      .populate('academyId', 'name logo city country currentPlan maxTeams');

    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Team not found');
    }
    return team;
  }

  async updateTeam(
    teamId: string,
    payload: Partial<ITeam> & { coachIds?: string[]; playerIds?: string[] },
  ) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid team ID');
    }
    const team = await Team.findById(teamId);
    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Team not found');
    }

    if (payload.teamName !== undefined) team.teamName = payload.teamName;
    if (payload.ageGroup !== undefined) team.ageGroup = payload.ageGroup;
    if (payload.status !== undefined) team.status = payload.status;

    if (payload.coachIds !== undefined) {
      const newCoachIds = payload.coachIds.map((id) => new Types.ObjectId(id));
      const previousCoachIds = (team.coachIds || []).map((id) => id.toString());
      const newCoachIdStrings = newCoachIds.map((id) => id.toString());

      const removedCoachIds = previousCoachIds.filter((id) => !newCoachIdStrings.includes(id));
      if (removedCoachIds.length > 0) {
        await CoachProfile.updateMany(
          { _id: { $in: removedCoachIds } },
          { $pull: { teamIds: team._id } },
        );
      }
      if (newCoachIds.length > 0) {
        await CoachProfile.updateMany(
          { _id: { $in: newCoachIds } },
          { $addToSet: { teamIds: team._id }, $set: { academyId: team.academyId } },
        );
      }

      team.coachIds = newCoachIds;
      team.coachesCount = newCoachIds.length;
    }

    if (payload.playerIds !== undefined) {
      const newPlayerIds = payload.playerIds.map((id) => new Types.ObjectId(id));
      const previousPlayerIds = (team.playerIds || []).map((id) => id.toString());
      const newPlayerIdStrings = newPlayerIds.map((id) => id.toString());

      const removedPlayerIds = previousPlayerIds.filter((id) => !newPlayerIdStrings.includes(id));
      if (removedPlayerIds.length > 0) {
        await PlayerProfile.updateMany(
          { _id: { $in: removedPlayerIds }, teamId: team._id },
          { $unset: { teamId: 1 } },
        );
      }
      if (newPlayerIds.length > 0) {
        await PlayerProfile.updateMany(
          { _id: { $in: newPlayerIds } },
          { $set: { teamId: team._id, academyId: team.academyId } },
        );
      }

      team.playerIds = newPlayerIds;
      team.playersCount = newPlayerIds.length;
    }

    team.totalMembers = (team.coachesCount || 0) + (team.playersCount || 0);
    await team.save();

    return Team.findById(team._id)
      .populate(
        'coachIds',
        'fullName title profileImage licenseStatus cvTier yearsExperience phone email',
      )
      .populate(
        'playerIds',
        'fullName position profileImage overallRating age cvTier dateOfBirth marketValue',
      );
  }

  async deleteTeam(teamId: string) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid team ID');
    }
    const team = await Team.findById(teamId);
    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Team not found');
    }

    // Unassign teamId from players
    await PlayerProfile.updateMany({ teamId: team._id }, { $unset: { teamId: 1 } });
    // Remove team reference from coaches
    await CoachProfile.updateMany({ teamIds: team._id }, { $pull: { teamIds: team._id } });

    await Team.findByIdAndDelete(teamId);
    return { message: 'Team deleted successfully', teamId };
  }

  async upgradePlan(
    academyIdentifier: string,
    plan: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM',
    customMaxTeams?: number,
  ) {
    const academy = await this.resolveAcademyProfile(academyIdentifier);
    const isPremium = plan === 'PREMIUM';
    const planLimits: Record<string, number> = {
      FREE: 1,
      BASIC: 3,
      PRO: 5,
      PREMIUM: 999999,
    };
    const newMaxTeams = isPremium
      ? 999999
      : customMaxTeams && customMaxTeams > 0
        ? customMaxTeams
        : planLimits[plan] || 1;

    academy.currentPlan = plan;
    academy.maxTeams = newMaxTeams;
    await academy.save();

    const usedTeams = await Team.countDocuments({ academyId: academy._id });

    return {
      message: `Plan updated successfully to ${plan}`,
      currentPlan: academy.currentPlan,
      isUnlimited: isPremium,
      usedTeams,
      maxTeams: isPremium ? null : academy.maxTeams,
      capacityDisplay: isPremium ? `${usedTeams}/∞` : `${usedTeams}/${academy.maxTeams}`,
    };
  }

  async activateAcademyPremiumPlan(academyId: string, transactionId?: string) {
    const academy = await AcademyProfile.findById(academyId);
    if (!academy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy profile not found');
    }

    academy.currentPlan = 'PREMIUM';
    academy.maxTeams = 999999;
    await academy.save();

    const usedTeams = await Team.countDocuments({ academyId: academy._id });

    // Upsert subscription
    await UserSubscription.findOneAndUpdate(
      { userId: academy.userId },
      {
        userId: academy.userId,
        status: 'ACTIVE',
        nextBillingDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      { upsert: true, new: true },
    );

    // Send in-app notification
    try {
      await notificationService.createNotification({
        recipientId: academy.userId,
        recipientRole: 'ACADEMY',
        title: 'Premium Plan Activated! 🎉',
        message:
          'Your payment was successful. Unlimited team creation and roster features are now unlocked!',
        type: 'PAYMENT_SUCCESS',
        data: { transactionId, plan: 'PREMIUM' },
      });
    } catch {
      // non-blocking
    }

    return {
      message: 'Premium Plan purchased and activated successfully. Unlimited team slots unlocked!',
      currentPlan: 'PREMIUM',
      isUnlimited: true,
      maxTeams: null,
      usedTeams,
      capacityDisplay: `${usedTeams}/∞`,
      status: 'ACTIVE',
      transactionId,
      planDetails: {
        plan: 'PREMIUM',
        price: 49,
        billingCycle: 'YEARLY',
        unlimitedTeams: true,
      },
    };
  }

  async purchasePremiumPlan(
    academyIdentifier: string,
    _payload?: { plan?: string; paymentMethod?: string; price?: number },
  ) {
    const academy = await this.resolveAcademyProfile(academyIdentifier);
    return this.activateAcademyPremiumPlan(academy._id.toString(), 'DIRECT_PURCHASE');
  }

  async createPlanCheckoutSession(
    academyIdentifier: string,
    payload?: { successUrl?: string; cancelUrl?: string; price?: number },
  ) {
    const academy = await this.resolveAcademyProfile(academyIdentifier);
    const stripe = getStripeClient();

    const price = payload?.price || 49;
    const clientBaseUrl = env.CLIENT_URL || process.env.CLIENT_URL || 'http://localhost:3000';

    const successUrl =
      payload?.successUrl ||
      `${clientBaseUrl}/academy/plan/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = payload?.cancelUrl || `${clientBaseUrl}/academy/plan/cancel`;

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'K10 Football Academy - Premium Plan',
              description: 'Unlock unlimited teams, full squad management, and advanced features.',
            },
            unit_amount: Math.round(price * 100), // cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: (academy.userId as any)?.email,
      metadata: {
        paymentType: 'ACADEMY_PREMIUM_PLAN',
        type: 'ACADEMY_PREMIUM_PLAN',
        academyId: academy._id.toString(),
        userId: academy.userId.toString(),
        plan: 'PREMIUM',
        price: price.toString(),
      },
    });

    return {
      sessionId: session.id,
      checkoutUrl: session.url,
      plan: 'PREMIUM',
      amount: price,
      currency: 'USD',
      status: 'AWAITING_PAYMENT',
    };
  }

  async verifyStripePayment(sessionId: string) {
    if (!sessionId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Stripe session ID is required');
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Stripe checkout session not found');
    }

    if (session.payment_status === 'paid' || session.status === 'complete') {
      const academyId = session.metadata?.academyId;
      if (!academyId) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'Session metadata missing academyId');
      }

      const result = await this.activateAcademyPremiumPlan(academyId, session.id);
      return {
        success: true,
        isPaid: true,
        message: 'Payment verified and Premium Plan activated successfully!',
        data: result,
      };
    }

    return {
      success: false,
      isPaid: false,
      message: `Payment is not completed. Current status: ${session.payment_status}`,
      status: session.payment_status,
    };
  }

  async handleAcademyPlanStripeWebhook(eventObject: any) {
    const academyId = eventObject?.metadata?.academyId;
    if (!academyId) return;
    await this.activateAcademyPremiumPlan(academyId, eventObject?.id);
  }

  // ==========================================
  // TEAM ROSTER DETAILS (SCREENSHOT 3, 4, 5)
  // ==========================================
  async getTeamRoster(teamId: string) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid team ID');
    }

    const team = await Team.findById(teamId)
      .populate(
        'coachIds',
        'fullName title profileImage licenseStatus cvTier yearsExperience phone email status',
      )
      .populate(
        'playerIds',
        'fullName position profileImage overallRating age cvTier dateOfBirth fitnessStatus marketValue',
      )
      .populate('academyId', 'name logo city country currentPlan');

    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Team not found');
    }

    // Format coaches list (Screenshot 3 & 4)
    const coaches = ((team.coachIds as any[]) || []).map((coach) => ({
      _id: coach._id,
      name: coach.fullName,
      role: coach.title || 'COACH',
      profileImage: coach.profileImage || '',
      cvType: coach.cvTier || 'SILVER',
      status: 'ACTIVE',
    }));

    // Fetch match stats for players to compute Rating, Matches, Goals, Assists (Screenshot 5)
    const playerIds = ((team.playerIds as any[]) || []).map((p) => p._id);
    const matchRecords = await MatchRecord.find({ playerId: { $in: playerIds } }).lean();

    const statsMap = new Map<
      string,
      { matches: number; goals: number; assists: number; totalRating: number }
    >();
    for (const match of matchRecords) {
      const pId = match.playerId ? match.playerId.toString() : '';
      if (!pId) continue;
      const current = statsMap.get(pId) || { matches: 0, goals: 0, assists: 0, totalRating: 0 };
      current.matches += 1;
      current.goals += (match.homeScore || 0) + ((match as any).goals || 0);
      current.assists += (match as any).assists || 0;
      statsMap.set(pId, current);
    }

    // Format players list (Screenshot 5)
    const players = ((team.playerIds as any[]) || []).map((player) => {
      const pId = player._id.toString();
      const st = statsMap.get(pId) || { matches: 0, goals: 0, assists: 0, totalRating: 0 };

      let rating = player.overallRating || 85;
      if (rating > 10) {
        rating = +(rating / 10).toFixed(1);
      }

      return {
        _id: player._id,
        name: player.fullName,
        position: player.position || 'PLAYER',
        profileImage: player.profileImage || '',
        rating,
        matches: st.matches || 0,
        goals: st.goals || 0,
        assists: st.assists || 0,
        cvType: player.cvTier || 'BRONZE',
        status: player.fitnessStatus || 'ACTIVE',
      };
    });

    const coachesCount = coaches.length;
    const playersCount = players.length;
    const totalTeamRoster = coachesCount + playersCount;

    return {
      team: {
        _id: team._id,
        teamName: team.teamName,
        ageGroup: team.ageGroup,
        status: team.status,
        academy: team.academyId,
      },
      summary: {
        coaches: `${coachesCount} / 2`,
        coachesCount,
        maxCoaches: 2,
        players: `${playersCount} / 18`,
        playersCount,
        maxPlayers: 18,
        totalTeamRoster,
        availableCoachSlots: Math.max(0, 2 - coachesCount),
        availablePlayerSlots: Math.max(0, 18 - playersCount),
      },
      coaches,
      players,
    };
  }

  async getAvailableCoachesForTeam(teamId: string, search?: string) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid team ID');
    }
    const team = await Team.findById(teamId).populate('academyId', 'name');
    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Team not found');
    }

    const academyName = (team.academyId as any)?.name || 'ACADEMY';

    // 1. Get approved academy coaches
    const approvedAffiliations = await AcademyCoach.find({
      academyId: team.academyId,
      status: 'APPROVED',
    }).populate('coachId', 'fullName title profileImage licenseStatus cvTier currentClub');

    // 2. Get direct coaches with this academyId
    const directCoaches = await CoachProfile.find({
      academyId: team.academyId,
    }).select('fullName title profileImage licenseStatus cvTier currentClub');

    // 3. Get independent available coaches
    const independentCoaches = await CoachProfile.find({
      $or: [{ academyId: { $exists: false } }, { academyId: null }, { status: 'AVAILABLE' }],
    })
      .limit(20)
      .select('fullName title profileImage licenseStatus cvTier currentClub');

    const coachMap = new Map<string, any>();
    approvedAffiliations.forEach((aff: any) => {
      if (aff.coachId && aff.coachId._id) {
        coachMap.set(aff.coachId._id.toString(), {
          coach: aff.coachId,
          affiliation: `ACADEMY: ${academyName}`,
        });
      }
    });
    directCoaches.forEach((c: any) => {
      coachMap.set(c._id.toString(), {
        coach: c,
        affiliation: `ACADEMY: ${academyName}`,
      });
    });
    independentCoaches.forEach((c: any) => {
      if (!coachMap.has(c._id.toString())) {
        coachMap.set(c._id.toString(), {
          coach: c,
          affiliation: c.currentClub ? `IN ${c.currentClub.toUpperCase()}` : 'ACADEMY: AVAILABLE',
        });
      }
    });

    const currentAssignedCoachIds = (team.coachIds || []).map((id) => id.toString());
    const isTeamCoachSlotFull = currentAssignedCoachIds.length >= 2;

    let coachesList = Array.from(coachMap.values()).map(({ coach, affiliation }) => {
      const isAssigned = currentAssignedCoachIds.includes(coach._id.toString());
      return {
        _id: coach._id,
        fullName: coach.fullName,
        title: coach.title || 'ASSISTANT COACH',
        profileImage: coach.profileImage || '',
        cvType: coach.cvTier || 'SILVER',
        academyAffiliation: affiliation,
        isAssigned,
        canAssign: !isAssigned && !isTeamCoachSlotFull,
      };
    });

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      coachesList = coachesList.filter(
        (c) =>
          c.fullName.toLowerCase().includes(term) ||
          c.title.toLowerCase().includes(term) ||
          c.academyAffiliation.toLowerCase().includes(term),
      );
    }

    return {
      teamId: team._id,
      teamName: team.teamName,
      currentCoachesCount: currentAssignedCoachIds.length,
      maxCoaches: 2,
      isTeamCoachSlotFull,
      coaches: coachesList,
    };
  }

  async assignCoachToTeam(teamId: string, coachId: string, role?: string) {
    if (!Types.ObjectId.isValid(teamId) || !Types.ObjectId.isValid(coachId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid team ID or coach ID');
    }

    const team = await Team.findById(teamId);
    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Team not found');
    }

    const coach = await CoachProfile.findById(coachId);
    if (!coach) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Coach not found');
    }

    const currentCoachIds = (team.coachIds || []).map((id) => id.toString());
    if (currentCoachIds.includes(coachId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Coach is already assigned to this team');
    }

    if (currentCoachIds.length >= 2) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Maximum 2 coaches allowed per team. Please remove an existing coach first.',
      );
    }

    team.coachIds = [...(team.coachIds || []), new Types.ObjectId(coachId)];
    team.coachesCount = team.coachIds.length;
    team.totalMembers = (team.coachesCount || 0) + (team.playersCount || 0);
    await team.save();

    await CoachProfile.findByIdAndUpdate(coachId, {
      $addToSet: { teamIds: team._id },
      $set: { academyId: team.academyId, ...(role ? { title: role } : {}) },
    });

    return {
      message: `${coach.fullName} assigned to ${team.teamName} successfully`,
      teamId: team._id,
      coachesCount: team.coachesCount,
      maxCoaches: 2,
      assignedCoach: {
        _id: coach._id,
        name: coach.fullName,
        role: role || coach.title || 'ASSISTANT COACH',
        profileImage: coach.profileImage || '',
        cvType: coach.cvTier || 'SILVER',
        status: 'ACTIVE',
      },
    };
  }

  async removeCoachFromTeam(teamId: string, coachId: string) {
    if (!Types.ObjectId.isValid(teamId) || !Types.ObjectId.isValid(coachId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid team ID or coach ID');
    }

    const team = await Team.findById(teamId);
    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Team not found');
    }

    team.coachIds = (team.coachIds || []).filter((id) => id.toString() !== coachId);
    team.coachesCount = team.coachIds.length;
    team.totalMembers = (team.coachesCount || 0) + (team.playersCount || 0);
    await team.save();

    await CoachProfile.findByIdAndUpdate(coachId, {
      $pull: { teamIds: team._id },
    });

    return {
      message: 'Coach removed from team successfully',
      teamId: team._id,
      coachesCount: team.coachesCount,
      maxCoaches: 2,
      removedCoachId: coachId,
    };
  }

  async getAvailablePlayersForTeam(teamId: string, search?: string) {
    let team: any = null;
    let academyId: any = null;
    let academyName = 'ACADEMY';

    if (teamId && Types.ObjectId.isValid(teamId)) {
      team = await Team.findById(teamId).populate('academyId', 'name');
      if (team) {
        academyId = team.academyId?._id || team.academyId;
        academyName = (team.academyId as any)?.name || 'ACADEMY';
      }
    }

    if (!team) {
      // Fallback if teamId is actually an academy identifier
      const academy = await this.resolveAcademyProfile(teamId);
      academyId = academy._id;
      academyName = academy.name || 'ACADEMY';
    }

    // 1. Own academy players
    const ownPlayers = await PlayerProfile.find({
      $or: [{ academyId }, { academy: academyName }],
    })
      .select(
        'fullName position overallRating cvTier fitnessStatus profileImage teamId currentClub academy academyId',
      )
      .lean();

    // 2. Free agents / available players in platform
    const freeAgentPlayers = await PlayerProfile.find({
      $or: [
        { academyId: null },
        { academyId: { $exists: false } },
        { currentClub: null },
        { currentClub: 'WITHOUT_CLUB' },
        { currentClub: '' },
      ],
    })
      .limit(30)
      .select(
        'fullName position overallRating cvTier fitnessStatus profileImage teamId currentClub academy academyId',
      )
      .lean();

    // 3. Fallback: all platform players (limit 30)
    const allPlatformPlayers = await PlayerProfile.find({})
      .limit(30)
      .select(
        'fullName position overallRating cvTier fitnessStatus profileImage teamId currentClub academy academyId',
      )
      .lean();

    const playerMap = new Map<string, any>();

    ownPlayers.forEach((p) => {
      playerMap.set(p._id.toString(), {
        player: p,
        affiliation: `ACADEMY: ${academyName}`,
        isOwn: true,
      });
    });

    freeAgentPlayers.forEach((p) => {
      if (!playerMap.has(p._id.toString())) {
        playerMap.set(p._id.toString(), {
          player: p,
          affiliation: 'ACADEMY: AVAILABLE',
          isOwn: false,
        });
      }
    });

    allPlatformPlayers.forEach((p) => {
      if (!playerMap.has(p._id.toString())) {
        const clubName = p.currentClub || p.academy || 'ANOTHER CLUB';
        playerMap.set(p._id.toString(), {
          player: p,
          affiliation: `IN ${clubName.toUpperCase()}`,
          isOwn: false,
        });
      }
    });

    const currentAssignedPlayerIds = team
      ? (team.playerIds || []).map((id: any) => id.toString())
      : [];
    const isTeamPlayerSlotFull = team ? currentAssignedPlayerIds.length >= 18 : false;

    let players = Array.from(playerMap.values()).map(({ player, affiliation }) => {
      const isAssigned = currentAssignedPlayerIds.includes(player._id.toString());
      let rating = player.overallRating || 85;
      if (rating > 10) rating = +(rating / 10).toFixed(1);

      return {
        _id: player._id,
        name: player.fullName,
        position: player.position || 'PLAYER',
        profileImage: player.profileImage || '',
        rating,
        cvType: player.cvTier || 'BRONZE',
        status: player.fitnessStatus || 'ACTIVE',
        academyAffiliation: affiliation,
        isAssigned,
        canAssign: !isAssigned && !isTeamPlayerSlotFull,
      };
    });

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      players = players.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.position.toLowerCase().includes(term) ||
          p.academyAffiliation.toLowerCase().includes(term),
      );
    }

    return {
      teamId: team ? team._id : null,
      teamName: team ? team.teamName : null,
      currentPlayersCount: currentAssignedPlayerIds.length,
      maxPlayers: 18,
      isTeamPlayerSlotFull,
      players,
    };
  }

  async assignPlayerToTeam(teamId: string, playerId: string) {
    if (!Types.ObjectId.isValid(teamId) || !Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid team ID or player ID');
    }

    const team = await Team.findById(teamId);
    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Team not found');
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    const currentPlayerIds = (team.playerIds || []).map((id) => id.toString());
    if (currentPlayerIds.includes(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Player is already assigned to this team');
    }

    if (currentPlayerIds.length >= 18) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Maximum 18 players allowed per team. Team roster is full.',
      );
    }

    team.playerIds = [...(team.playerIds || []), new Types.ObjectId(playerId)];
    team.playersCount = team.playerIds.length;
    team.totalMembers = (team.coachesCount || 0) + (team.playersCount || 0);
    await team.save();

    await PlayerProfile.findByIdAndUpdate(playerId, {
      $set: { teamId: team._id, academyId: team.academyId },
    });
    await playerCacheService.invalidatePlayerCache(playerId, player.userId);

    let rating = player.overallRating || 85;
    if (rating > 10) rating = +(rating / 10).toFixed(1);

    return {
      message: `${player.fullName} assigned to ${team.teamName} successfully`,
      teamId: team._id,
      playersCount: team.playersCount,
      maxPlayers: 18,
      assignedPlayer: {
        _id: player._id,
        name: player.fullName,
        position: player.position,
        profileImage: player.profileImage || '',
        rating,
        cvType: player.cvTier || 'BRONZE',
        status: player.fitnessStatus || 'ACTIVE',
      },
    };
  }

  async removePlayerFromTeam(teamId: string, playerId: string) {
    if (!Types.ObjectId.isValid(teamId) || !Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid team ID or player ID');
    }

    const team = await Team.findById(teamId);
    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Team not found');
    }

    team.playerIds = (team.playerIds || []).filter((id) => id.toString() !== playerId);
    team.playersCount = team.playerIds.length;
    team.totalMembers = (team.coachesCount || 0) + (team.playersCount || 0);
    await team.save();

    const updatedPlayer = await PlayerProfile.findByIdAndUpdate(playerId, {
      $unset: { teamId: 1 },
    });
    if (updatedPlayer) {
      await playerCacheService.invalidatePlayerCache(playerId, updatedPlayer.userId);
    }

    return {
      message: 'Player removed from team successfully',
      teamId: team._id,
      playersCount: team.playersCount,
      maxPlayers: 18,
      removedPlayerId: playerId,
    };
  }

  async createGameReport(academyId: string, payload: Partial<IGameReport>) {
    return GameReport.create({ ...payload, academyId });
  }

  async getGameReports(academyId: string) {
    return GameReport.find({ academyId })
      .populate('playerId', 'fullName position overallRating')
      .populate('coachId', 'fullName title');
  }

  async createPlayerEvaluation(academyId: string, payload: Partial<IPlayerEvaluation>) {
    return PlayerEvaluation.create({ ...payload, academyId });
  }

  async getPlayerEvaluations(academyId: string, playerId?: string) {
    const filter: Record<string, unknown> = { academyId };
    if (playerId) filter.playerId = playerId;
    return PlayerEvaluation.find(filter)
      .populate('playerId', 'fullName position profileImage overallRating currentClub')
      .populate('coachId', 'fullName title profileImage licenseStatus');
  }

  // ==========================================
  // 4-MONTH EVALUATION & REMINDER SYSTEM
  // ==========================================
  async getEvaluationDashboard(academyIdentifier: string) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    const evaluations = await PlayerEvaluation.find({ academyId: academy._id })
      .populate('playerId', 'fullName position profileImage overallRating currentClub')
      .populate('coachId', 'fullName title profileImage phone email licenseStatus')
      .sort({ createdAt: -1 });

    const now = new Date();
    const evaluated: any[] = [];
    const due: any[] = [];
    const overdue: any[] = [];

    for (const item of evaluations) {
      // Auto check expiration (4-month cycle)
      if (item.expiresAt && new Date(item.expiresAt) < now && item.status !== 'EXPIRED') {
        item.status = 'EXPIRED';
        item.save().catch(() => {});
      }

      if (item.status === 'EVALUATED') {
        evaluated.push(item);
      } else if (item.status === 'EXPIRED' || item.status === 'OVERDUE') {
        overdue.push(item);
      } else {
        due.push(item);
      }
    }

    return {
      summary: {
        totalEvaluations: evaluations.length,
        evaluatedCount: evaluated.length,
        dueCount: due.length,
        overdueCount: overdue.length,
        evaluationCycleMonths: 4,
      },
      due,
      overdue,
      evaluated,
    };
  }

  async requestPlayerEvaluation(
    academyIdentifier: string,
    managerUserId: string,
    payload: { playerId: string; coachId: string; notes?: string },
  ) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    const player = await PlayerProfile.findById(payload.playerId);
    if (!player) {
      throw new AppError(404, 'Player not found');
    }

    const coach = await CoachProfile.findOne({
      $or: [{ _id: payload.coachId }, { userId: payload.coachId }],
    });
    if (!coach) {
      throw new AppError(404, 'Coach not found');
    }

    // Ensure the coach is an officially approved coach of this academy
    const approvedAffiliation = await AcademyCoach.findOne({
      academyId: academy._id,
      coachId: coach._id,
      status: 'APPROVED',
    });
    if (!approvedAffiliation) {
      throw new AppError(
        400,
        `Coach ${coach.fullName} is not an officially approved coach of ${academy.name}. Only verified academy coaches can evaluate academy players.`,
      );
    }

    // 4-month expiration deadline
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000); // 120 days = 4 months

    const evaluation = await PlayerEvaluation.create({
      academyId: academy._id,
      playerId: player._id,
      coachId: coach._id,
      status: 'NEED_EVALUATION',
      nextEvaluationDue: now,
      expiresAt,
      requestedByManagerId: new Types.ObjectId(managerUserId),
      notes: payload.notes || '4-month official academy player evaluation requested by management.',
    });

    // Notify Coach
    await notificationService.createNotification({
      recipientId: coach.userId,
      recipientRole: 'COACH',
      title: 'Player Evaluation Required',
      message: `Management has requested an evaluation for ${player.fullName}. Evaluations expire every 4 months.`,
      type: 'PLAYER_EVALUATION_REQUESTED',
      data: {
        evaluationId: evaluation._id,
        playerId: player._id,
        playerName: player.fullName,
      },
    });

    return evaluation;
  }

  async sendEvaluationReminder(evaluationId: string, _managerUserId?: string) {
    const evaluation = await PlayerEvaluation.findById(evaluationId)
      .populate('playerId', 'fullName')
      .populate('coachId', 'userId fullName');

    if (!evaluation) {
      throw new AppError(404, 'Player evaluation record not found');
    }

    const coach = evaluation.coachId as any;
    const player = evaluation.playerId as any;

    evaluation.reminderCount = (evaluation.reminderCount || 0) + 1;
    evaluation.reminderSentAt = new Date();
    await evaluation.save();

    // Send urgent reminder notification to Coach
    await notificationService.createNotification({
      recipientId: coach.userId,
      recipientRole: 'COACH',
      title: 'Reminder: Player Evaluation Due',
      message: `URGENT: Player evaluation for ${player?.fullName || 'your player'} is due. Please submit the evaluation assessment.`,
      type: 'PLAYER_EVALUATION_REMINDER',
      data: {
        evaluationId: evaluation._id,
        reminderCount: evaluation.reminderCount,
      },
    });

    return {
      message: 'Evaluation reminder sent to coach successfully',
      evaluationId: evaluation._id,
      coachId: coach._id,
      reminderCount: evaluation.reminderCount,
      sentAt: evaluation.reminderSentAt,
    };
  }

  async submitPlayerEvaluation(
    evaluationId: string,
    coachUserId: string,
    payload: {
      technicalScore: number;
      physicalScore: number;
      mentalScore: number;
      overallRating?: number;
      coachFeedback?: string;
    },
  ) {
    const evaluation = await PlayerEvaluation.findById(evaluationId);
    if (!evaluation) {
      throw new AppError(404, 'Player evaluation record not found');
    }

    const coach = await CoachProfile.findOne({ userId: coachUserId });
    if (!coach || evaluation.coachId.toString() !== coach._id.toString()) {
      throw new AppError(403, 'Only the assigned coach can submit this player evaluation');
    }

    const overallRating =
      payload.overallRating ||
      Math.round((payload.technicalScore + payload.physicalScore + payload.mentalScore) / 3);

    const now = new Date();
    const nextDue = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000); // 4 months cycle

    evaluation.evaluationDate = now;
    evaluation.overallRating = overallRating;
    evaluation.technicalScore = payload.technicalScore;
    evaluation.physicalScore = payload.physicalScore;
    evaluation.mentalScore = payload.mentalScore;
    evaluation.status = 'EVALUATED';
    evaluation.nextEvaluationDue = nextDue;
    evaluation.expiresAt = nextDue;
    evaluation.coachFeedback = payload.coachFeedback;
    await evaluation.save();

    // Also update Player attributes & mental analysis
    await PlayerAttributes.findOneAndUpdate(
      { playerId: evaluation.playerId },
      {
        stamina: payload.physicalScore,
        strength: payload.physicalScore,
        ballControl: payload.technicalScore,
        dribbling: payload.technicalScore,
      },
      { upsert: true },
    );

    // Notify player and manager
    const player = await PlayerProfile.findById(evaluation.playerId);
    if (player && player.userId) {
      await notificationService.createNotification({
        recipientId: player.userId,
        recipientRole: 'PLAYER',
        title: 'Player Evaluation Completed',
        message: `Coach ${coach.fullName} has completed your official 4-month evaluation. Rating: ${overallRating}/100.`,
        type: 'PLAYER_EVALUATION_COMPLETED',
        data: { evaluationId: evaluation._id, overallRating },
      });
    }

    return evaluation;
  }

  // ==========================================
  // ACADEMY COACH AFFILIATION & APPROVAL SYSTEM
  // ==========================================

  async inviteCoach(
    academyIdentifier: string,
    managerUserId: string,
    payload: { coachId?: string; coachEmail?: string; role?: string; message?: string },
  ) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    if (managerUserId && academy.userId.toString() !== managerUserId) {
      const managerUser = await User.findById(managerUserId);
      if (managerUser && managerUser.role !== 'SUPER_ADMIN') {
        throw new AppError(
          403,
          'You are not authorized to invite coaches on behalf of this academy',
        );
      }
    }

    let coach = null;
    if (payload.coachId && Types.ObjectId.isValid(payload.coachId)) {
      coach = await CoachProfile.findOne({
        $or: [{ _id: payload.coachId }, { userId: payload.coachId }],
      });
    }

    if (!coach && payload.coachEmail) {
      const user = await User.findOne({ email: payload.coachEmail.toLowerCase() });
      if (user) {
        coach = await CoachProfile.findOne({ userId: user._id });
      }
    }

    if (!coach) {
      throw new AppError(404, 'Coach profile not found for the given ID or Email');
    }

    const existingAffiliation = await AcademyCoach.findOne({
      academyId: academy._id,
      coachId: coach._id,
    });

    if (existingAffiliation) {
      if (existingAffiliation.status === 'APPROVED') {
        throw new AppError(400, 'Coach is already an officially approved member of this academy');
      }
      if (existingAffiliation.status === 'PENDING') {
        throw new AppError(
          400,
          'An affiliation invitation or request is already pending for this coach',
        );
      }

      existingAffiliation.status = 'PENDING';
      existingAffiliation.requestedBy = 'ACADEMY';
      existingAffiliation.role = payload.role || existingAffiliation.role || 'Youth Coach';
      existingAffiliation.requestMessage =
        payload.message || `Official invitation from ${academy.name} to join as coach.`;
      existingAffiliation.responseNote = undefined;
      existingAffiliation.approvedAt = undefined;
      existingAffiliation.rejectedAt = undefined;
      await existingAffiliation.save();

      await notificationService.createNotification({
        recipientId: coach.userId,
        recipientRole: 'COACH',
        title: 'New Academy Invitation ⚽',
        message: `${academy.name} has invited you to join their official coaching staff as ${existingAffiliation.role}.`,
        type: 'ACADEMY_INVITATION',
        data: { affiliationId: existingAffiliation._id, academyId: academy._id },
      });

      return existingAffiliation;
    }

    const affiliation = await AcademyCoach.create({
      academyId: academy._id,
      coachId: coach._id,
      coachUserId: coach.userId,
      role: payload.role || 'Youth Coach',
      status: 'PENDING',
      requestedBy: 'ACADEMY',
      requestMessage:
        payload.message || `Official invitation from ${academy.name} to join as coach.`,
    });

    await notificationService.createNotification({
      recipientId: coach.userId,
      recipientRole: 'COACH',
      title: 'New Academy Invitation ⚽',
      message: `${academy.name} has invited you to join their official coaching staff as ${affiliation.role}.`,
      type: 'ACADEMY_INVITATION',
      data: { affiliationId: affiliation._id, academyId: academy._id },
    });

    return affiliation;
  }

  async requestCoachAffiliation(
    coachUserId: string,
    payload: { academyId: string; role?: string; message?: string },
  ) {
    const coach = await CoachProfile.findOne({ userId: coachUserId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found for this user');
    }

    let academy = null;
    if (Types.ObjectId.isValid(payload.academyId)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: payload.academyId }, { userId: payload.academyId }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy not found');
    }

    const existingAffiliation = await AcademyCoach.findOne({
      academyId: academy._id,
      coachId: coach._id,
    });

    const defaultRole = coach.title || 'Coach';

    if (existingAffiliation) {
      if (existingAffiliation.status === 'APPROVED') {
        throw new AppError(400, 'You are already an approved coach in this academy');
      }
      if (existingAffiliation.status === 'PENDING') {
        throw new AppError(400, 'Your affiliation request is already pending academy review');
      }

      existingAffiliation.status = 'PENDING';
      existingAffiliation.requestedBy = 'COACH';
      existingAffiliation.role = defaultRole;
      existingAffiliation.requestMessage =
        payload.message || `Coach ${coach.fullName} requested to join ${academy.name}.`;
      existingAffiliation.responseNote = undefined;
      existingAffiliation.approvedAt = undefined;
      existingAffiliation.rejectedAt = undefined;
      await existingAffiliation.save();

      await notificationService.createNotification({
        recipientId: academy.userId,
        recipientRole: 'ACADEMY',
        title: 'Coach Affiliation Request',
        message: `Coach ${coach.fullName} has requested to join your academy.`,
        type: 'COACH_AFFILIATION_REQUEST',
        data: { affiliationId: existingAffiliation._id, coachId: coach._id },
      });

      return existingAffiliation;
    }

    const affiliation = await AcademyCoach.create({
      academyId: academy._id,
      coachId: coach._id,
      coachUserId: coach.userId,
      role: defaultRole,
      status: 'PENDING',
      requestedBy: 'COACH',
      requestMessage:
        payload.message || `Coach ${coach.fullName} requested to join ${academy.name}.`,
    });

    await notificationService.createNotification({
      recipientId: academy.userId,
      recipientRole: 'ACADEMY',
      title: 'Coach Affiliation Request',
      message: `Coach ${coach.fullName} has requested to join your academy.`,
      type: 'COACH_AFFILIATION_REQUEST',
      data: { affiliationId: affiliation._id, coachId: coach._id },
    });

    return affiliation;
  }

  async getAcademyCoaches(academyIdentifier: string, status?: string) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    const filter: Record<string, unknown> = { academyId: academy._id };
    if (status && status !== 'ALL') {
      filter.status = status;
    }

    const affiliations = await AcademyCoach.find(filter)
      .populate(
        'coachId',
        'fullName title profileImage licenseStatus yearsExperience cvTier coachType overallRatingScore phone email',
      )
      .populate('coachUserId', 'name email avatar')
      .sort({ createdAt: -1 });

    return {
      academy: {
        id: academy._id,
        name: academy.name,
        logo: academy.logo,
      },
      total: affiliations.length,
      coaches: affiliations,
    };
  }

  async getCoachAffiliations(coachUserId: string) {
    const coach = await CoachProfile.findOne({ userId: coachUserId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const affiliations = await AcademyCoach.find({ coachId: coach._id })
      .populate('academyId', 'name category logo coverPhoto country city location registrationId')
      .sort({ createdAt: -1 });

    return affiliations;
  }

  async respondToCoachAffiliation(
    affiliationId: string,
    responderUserId: string,
    action: 'APPROVE' | 'REJECT',
    responseNote?: string,
  ) {
    const affiliation = await AcademyCoach.findById(affiliationId);
    if (!affiliation) {
      throw new AppError(404, 'Affiliation request not found');
    }

    if (affiliation.status !== 'PENDING') {
      throw new AppError(400, `Affiliation request is already ${affiliation.status}`);
    }

    const academy = await AcademyProfile.findById(affiliation.academyId);
    const coach = await CoachProfile.findById(affiliation.coachId);
    if (!academy || !coach) {
      throw new AppError(404, 'Associated academy or coach profile not found');
    }

    // Role-based authorization
    if (affiliation.requestedBy === 'COACH') {
      // Coach initiated -> Academy management must respond
      if (academy.userId.toString() !== responderUserId) {
        throw new AppError(
          403,
          'Only the academy management can approve or reject this coach request',
        );
      }
    } else {
      // Academy initiated -> Coach must respond
      if (coach.userId.toString() !== responderUserId) {
        throw new AppError(
          403,
          'Only the invited coach can accept or decline this academy invitation',
        );
      }
    }

    if (action === 'APPROVE') {
      affiliation.status = 'APPROVED';
      affiliation.approvedAt = new Date();
      affiliation.responseNote = responseNote;
      await affiliation.save();

      // Apply verified official academy affiliation to Coach Profile
      coach.academyId = academy._id as Types.ObjectId;
      coach.isVerifiedByAcademy = true;
      coach.academyRole = affiliation.role || 'Youth Coach';
      coach.currentClub = academy.name; // Verified official name
      coach.clubLogo = academy.logo;
      coach.coachType = 'CLUB_COACH';

      // Update club history to reflect current verified club
      const history = Array.isArray(coach.clubHistory) ? coach.clubHistory : [];
      history.forEach((c: any) => {
        c.isCurrent = false;
      });
      history.unshift({
        clubName: academy.name,
        role: affiliation.role || 'Youth Coach',
        period: `${new Date().getFullYear()} - Present`,
        startYear: new Date().getFullYear(),
        isCurrent: true,
        logoUrl: academy.logo,
      });
      coach.clubHistory = history;
      await coach.save();

      // Notify the other party
      const notifyUserId = affiliation.requestedBy === 'COACH' ? coach.userId : academy.userId;
      const notifyRole = affiliation.requestedBy === 'COACH' ? 'COACH' : 'ACADEMY';

      await notificationService.createNotification({
        recipientId: notifyUserId,
        recipientRole: notifyRole,
        title: 'Official Affiliation Approved! ⚽',
        message: `Coaching affiliation between Coach ${coach.fullName} and ${academy.name} has been APPROVED! Coach is now officially verified.`,
        type: 'ACADEMY_AFFILIATION_APPROVED',
        data: {
          affiliationId: affiliation._id,
          academyId: academy._id,
          coachId: coach._id,
        },
      });
    } else {
      affiliation.status = 'REJECTED';
      affiliation.rejectedAt = new Date();
      affiliation.responseNote = responseNote;
      await affiliation.save();

      const notifyUserId = affiliation.requestedBy === 'COACH' ? coach.userId : academy.userId;
      const notifyRole = affiliation.requestedBy === 'COACH' ? 'COACH' : 'ACADEMY';

      await notificationService.createNotification({
        recipientId: notifyUserId,
        recipientRole: notifyRole,
        title: 'Affiliation Request Declined',
        message: `The affiliation request between ${coach.fullName} and ${academy.name} was declined.`,
        type: 'ACADEMY_AFFILIATION_REJECTED',
        data: { affiliationId: affiliation._id },
      });
    }

    return affiliation;
  }

  async removeCoachAffiliation(academyIdentifier: string, affiliationId: string) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    const affiliation = await AcademyCoach.findOne({
      _id: affiliationId,
      academyId: academy._id,
    });
    if (!affiliation) {
      throw new AppError(404, 'Affiliation not found for this academy');
    }

    affiliation.status = 'REMOVED';
    await affiliation.save();

    const coach = await CoachProfile.findById(affiliation.coachId);
    if (coach && coach.academyId?.toString() === academy._id.toString()) {
      coach.isVerifiedByAcademy = false;
      coach.academyId = undefined;
      coach.coachType = 'INDIVIDUAL_COACH';

      if (Array.isArray(coach.clubHistory)) {
        coach.clubHistory.forEach((c: any) => {
          if (c.clubName.toLowerCase() === academy.name.toLowerCase() && c.isCurrent) {
            c.isCurrent = false;
            c.endYear = new Date().getFullYear();
            c.period = `${c.startYear || new Date().getFullYear()} - ${new Date().getFullYear()}`;
          }
        });
      }
      await coach.save();

      await notificationService.createNotification({
        recipientId: coach.userId,
        recipientRole: 'COACH',
        title: 'Academy Affiliation Revoked',
        message: `Your affiliation with ${academy.name} has been revoked. Profile reverted to Individual Coach.`,
        type: 'ACADEMY_AFFILIATION_REMOVED',
        data: { academyId: academy._id },
      });
    }

    return { message: 'Coach removed from academy successfully', affiliation };
  }

  // ==========================================
  // TRANSFER REQUESTS (ACROSS TEAMS & ACADEMIES)
  // ==========================================

  async resolveUserAcademy(user: any, academyIdentifier?: string) {
    if (academyIdentifier) {
      return this.resolveAcademyProfile(academyIdentifier);
    }
    const userId = user?.userId || user?.id || user?._id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'User authentication required');
    }
    let academy = await AcademyProfile.findOne({ userId });
    if (!academy) {
      const coach = await CoachProfile.findOne({ userId });
      if (coach?.academyId) {
        academy = await AcademyProfile.findById(coach.academyId);
      }
    }
    if (!academy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy profile not found for this user account');
    }
    return academy;
  }

  async getTransferRequestsDashboard(user: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    // 1. Fetch Incoming Requests (Target is current academy)
    const incomingDocs = await TransferRequest.find({ toAcademyId: academy._id })
      .populate('playerId', 'fullName position profileImage overallRating age country')
      .populate('fromAcademyId', 'name logo city country')
      .populate('toAcademyId', 'name logo city country')
      .populate('fromTeamId', 'teamName ageGroup')
      .populate('toTeamId', 'teamName ageGroup')
      .populate('requestedByUserId', 'name email avatar')
      .populate('requestedByCoachId', 'fullName title profileImage')
      .sort({ createdAt: -1 });

    // 2. Fetch Outgoing Requests (Origin is current academy)
    const outgoingDocs = await TransferRequest.find({ fromAcademyId: academy._id })
      .populate('playerId', 'fullName position profileImage overallRating age country')
      .populate('fromAcademyId', 'name logo city country')
      .populate('toAcademyId', 'name logo city country')
      .populate('fromTeamId', 'teamName ageGroup')
      .populate('toTeamId', 'teamName ageGroup')
      .populate('requestedByUserId', 'name email avatar')
      .populate('requestedByCoachId', 'fullName title profileImage')
      .sort({ createdAt: -1 });

    // 3. Stats computation
    const incomingCount = incomingDocs.length;
    const outgoingCount = outgoingDocs.length;
    const approvedCount = await TransferRequest.countDocuments({
      $or: [{ toAcademyId: academy._id }, { fromAcademyId: academy._id }],
      status: 'APPROVED',
    });
    const pendingCount = await TransferRequest.countDocuments({
      $or: [{ toAcademyId: academy._id }, { fromAcademyId: academy._id }],
      status: 'PENDING',
    });
    const rejectedCount = await TransferRequest.countDocuments({
      $or: [{ toAcademyId: academy._id }, { fromAcademyId: academy._id }],
      status: 'REJECTED',
    });

    // 4. Format requests matching the exact frontend table columns
    const formatTransferRow = (doc: any, isIncoming: boolean) => {
      const p = doc.playerId || {};
      const fromAcad = doc.fromAcademyId || {};
      const toAcad = doc.toAcademyId || {};
      const fromTeam = doc.fromTeamId || {};
      const toTeam = doc.toTeamId || {};
      const coach = doc.requestedByCoachId || {};
      const reqUser = doc.requestedByUserId || {};

      const incomingLabel = toTeam.teamName
        ? `${toAcad.name || ''} - ${toTeam.teamName}`
        : toAcad.name || 'Target Academy';
      const outgoingLabel = fromTeam.teamName
        ? `${fromAcad.name || ''} - ${fromTeam.teamName}`
        : fromAcad.name || 'Source Academy';

      const requestedBy =
        doc.requesterName || coach.fullName || reqUser.name || 'Academy Management';

      return {
        _id: doc._id,
        id: doc._id,
        name: p.fullName || 'Athlete',
        position: p.position || 'Forward',
        avatar: p.profileImage || '',
        player: {
          _id: p._id,
          name: p.fullName || 'Athlete',
          position: p.position || 'Forward',
          avatar: p.profileImage || '',
          rating: p.overallRating || 0,
          age: p.age || null,
        },
        incoming: incomingLabel,
        outgoing: outgoingLabel,
        fromAcademy: {
          _id: fromAcad._id,
          name: fromAcad.name || 'Unknown Academy',
          logo: fromAcad.logo || '',
        },
        toAcademy: {
          _id: toAcad._id,
          name: toAcad.name || 'Unknown Academy',
          logo: toAcad.logo || '',
        },
        requestedBy,
        date: doc.createdAt ? new Date(doc.createdAt).toISOString().split('T')[0] : 'N/A',
        status: doc.status || 'PENDING',
        transferType: doc.transferType,
        reason: doc.reason || '',
        responseNote: doc.responseNote || '',
        canApprove: isIncoming && doc.status === 'PENDING',
        canReject: doc.status === 'PENDING',
        canCancel: !isIncoming && doc.status === 'PENDING',
      };
    };

    return {
      academy: {
        _id: academy._id,
        name: academy.name,
        logo: academy.logo || '',
      },
      stats: {
        incomingCount,
        outgoingCount,
        approvedCount,
        pendingCount,
        rejectedCount,
      },
      incoming: incomingDocs.map((d) => formatTransferRow(d, true)),
      outgoing: outgoingDocs.map((d) => formatTransferRow(d, false)),
    };
  }

  async getTargetAcademiesForTransfer(user: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    const otherAcademies = await AcademyProfile.find({
      _id: { $ne: academy._id },
    })
      .select('name logo city country')
      .sort({ name: 1 })
      .lean();

    const academiesWithTeams = await Promise.all(
      otherAcademies.map(async (acad: any) => {
        const teams = await Team.find({
          academyId: acad._id,
          status: 'ACTIVE',
        })
          .select('teamName ageGroup')
          .lean();

        return {
          _id: acad._id,
          name: acad.name,
          logo: acad.logo || '',
          city: acad.city || '',
          country: acad.country || '',
          teams: teams.map((t) => ({
            _id: t._id,
            teamName: t.teamName,
            ageGroup: t.ageGroup,
          })),
        };
      }),
    );

    return academiesWithTeams;
  }

  async getMyAcademyPlayersForTransfer(user: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    // Get all teams of this academy to collect member players
    const academyTeams = await Team.find({ academyId: academy._id }).select(
      'playerIds teamName ageGroup',
    );
    const teamPlayerIds = academyTeams.flatMap((t) => t.playerIds || []);

    const players = await PlayerProfile.find({
      $or: [{ academyId: academy._id }, { academy: academy.name }, { _id: { $in: teamPlayerIds } }],
    })
      .populate('teamId', 'teamName ageGroup')
      .select('fullName position profileImage overallRating age teamId fitnessStatus')
      .sort({ fullName: 1 })
      .lean();

    return players.map((p: any) => {
      let currentTeamName = (p.teamId as any)?.teamName;
      if (!currentTeamName) {
        const matchingTeam = academyTeams.find((t) =>
          (t.playerIds || []).some((id) => id.toString() === p._id.toString()),
        );
        if (matchingTeam) currentTeamName = matchingTeam.teamName;
      }

      return {
        _id: p._id,
        id: p._id,
        name: p.fullName,
        position: p.position || 'Forward',
        avatar: p.profileImage || '',
        rating: p.overallRating || 0,
        age: p.age || null,
        currentTeamName: currentTeamName || 'Academy Squad',
        teamId: p.teamId?._id || null,
        fitnessStatus: p.fitnessStatus || 'ACTIVE',
      };
    });
  }

  async getTransferRequestById(id: string, _user?: any) {
    const transfer = await TransferRequest.findById(id)
      .populate('playerId', 'fullName position profileImage overallRating age country')
      .populate('fromAcademyId', 'name logo city country')
      .populate('toAcademyId', 'name logo city country')
      .populate('fromTeamId', 'teamName ageGroup')
      .populate('toTeamId', 'teamName ageGroup')
      .populate('requestedByUserId', 'name email avatar')
      .populate('requestedByCoachId', 'fullName title profileImage')
      .lean();

    if (!transfer) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Transfer request not found');
    }

    return transfer;
  }

  async createTransferRequest(user: any, payload: any) {
    const academy = await this.resolveUserAcademy(user);

    // 1. Resolve athlete/player: supports playerId or athleteName/fullName/name
    let player = null;
    if (payload.playerId && Types.ObjectId.isValid(payload.playerId)) {
      player = await PlayerProfile.findById(payload.playerId);
    }
    if (!player) {
      const searchName = (
        payload.athleteName ||
        payload.fullName ||
        payload.name ||
        payload.playerId ||
        ''
      ).trim();
      if (searchName) {
        player = await PlayerProfile.findOne({
          $or: [
            { fullName: { $regex: new RegExp(`^${searchName}$`, 'i') } },
            { fullName: { $regex: new RegExp(searchName, 'i') } },
          ],
        });
      }
    }
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Athlete not found by the specified name or ID');
    }

    // 2. Resolve target academy: supports targetAcademyId or targetAcademy (name)
    let targetAcademy = null;
    const targetAcadIdentifier =
      payload.targetAcademyId || payload.targetAcademy || payload.targetAcademyName;
    if (targetAcadIdentifier && Types.ObjectId.isValid(targetAcadIdentifier)) {
      targetAcademy = await AcademyProfile.findById(targetAcadIdentifier);
    }
    if (!targetAcademy && targetAcadIdentifier) {
      const acadName = String(targetAcadIdentifier).trim();
      targetAcademy = await AcademyProfile.findOne({
        name: { $regex: new RegExp(`^${acadName}$`, 'i') },
      });
      if (!targetAcademy) {
        targetAcademy = await AcademyProfile.findOne({
          name: { $regex: new RegExp(acadName, 'i') },
        });
      }
    }
    if (!targetAcademy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Target academy not found');
    }

    // 3. Parse transferType: "Outgoing (To Another Academy)" -> "OUTGOING", "Incoming..." -> "INCOMING"
    const rawType = String(payload.transferType || '').toUpperCase();
    const transferType: 'OUTGOING' | 'INCOMING' = rawType.includes('INCOMING')
      ? 'INCOMING'
      : 'OUTGOING';

    let fromAcademyId: Types.ObjectId;
    let toAcademyId: Types.ObjectId;

    if (transferType === 'INCOMING') {
      fromAcademyId = player.academyId || targetAcademy._id;
      toAcademyId = academy._id;
    } else {
      fromAcademyId = academy._id;
      toAcademyId = targetAcademy._id;
    }

    // Check for existing pending request
    const existing = await TransferRequest.findOne({
      playerId: player._id,
      fromAcademyId,
      toAcademyId,
      status: 'PENDING',
    });
    if (existing) {
      throw new AppError(
        StatusCodes.CONFLICT,
        'A pending transfer request already exists for this athlete between these academies',
      );
    }

    const userId = user.userId || user.id || user._id;
    const coach = await CoachProfile.findOne({ userId });
    const requesterUser = await User.findById(userId);
    const requesterName =
      coach?.fullName || requesterUser?.name || academy.name || 'Academy Management';

    const transfer = await TransferRequest.create({
      playerId: player._id,
      fromAcademyId,
      toAcademyId,
      fromTeamId: player.teamId || undefined,
      transferType,
      requestedByUserId: userId,
      requestedByCoachId: coach?._id,
      requestedByRole: user.role || 'ACADEMY',
      requesterName,
      reason: payload.reason || '',
      status: 'PENDING',
    });

    // Notify receiving academy
    const targetUserId = targetAcademy.userId;
    if (targetUserId) {
      await notificationService.createNotification({
        recipientId: targetUserId,
        recipientRole: 'ACADEMY',
        title: 'New Transfer Request Received',
        message: `${requesterName} from ${academy.name} has submitted a transfer request for athlete ${player.fullName}.`,
        type: 'TRANSFER_REQUEST_RECEIVED',
        data: { transferRequestId: transfer._id, playerId: player._id },
      });
    }

    return {
      message: 'Transfer request submitted successfully',
      transfer,
    };
  }

  async respondToTransferRequest(
    id: string,
    user: any,
    status: 'APPROVED' | 'REJECTED',
    responseNote?: string,
  ) {
    const transfer = await TransferRequest.findById(id);
    if (!transfer) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Transfer request not found');
    }

    if (transfer.status !== 'PENDING') {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Transfer request is already ${transfer.status.toLowerCase()}`,
      );
    }

    const currentAcademy = await this.resolveUserAcademy(user);

    // Authorization: User must belong to toAcademyId or fromAcademyId or be SUPER_ADMIN
    const isToAcademy = transfer.toAcademyId.toString() === currentAcademy._id.toString();
    const isFromAcademy = transfer.fromAcademyId.toString() === currentAcademy._id.toString();

    if (!isToAcademy && !isFromAcademy && user.role !== 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to respond to this transfer request',
      );
    }

    if (status === 'APPROVED' && !isToAcademy && user.role !== 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Only the receiving academy can approve this incoming transfer request',
      );
    }

    const userId = user.userId || user.id || user._id;
    transfer.status = status;
    transfer.responseNote = responseNote || '';
    transfer.respondedByUserId = userId;
    transfer.resolvedAt = new Date();

    if (status === 'APPROVED') {
      const player = await PlayerProfile.findById(transfer.playerId);
      const toAcademy = await AcademyProfile.findById(transfer.toAcademyId);

      if (player && toAcademy) {
        // 1. Remove from previous team roster if in one
        if (player.teamId) {
          await Team.findByIdAndUpdate(player.teamId, {
            $pull: { playerIds: player._id },
          });
          const oldTeam = await Team.findById(player.teamId);
          if (oldTeam) {
            oldTeam.playersCount = (oldTeam.playerIds || []).length;
            oldTeam.totalMembers = (oldTeam.coachesCount || 0) + oldTeam.playersCount;
            await oldTeam.save();
          }
          player.teamId = undefined as any;
        }

        // 2. Update player's academy profile references to target academy
        player.academyId = toAcademy._id;
        player.academy = toAcademy.name;
        player.currentClub = toAcademy.name;
        await player.save();

        // 3. Invalidate Redis cache immediately
        await playerCacheService.invalidatePlayerCache(player._id, player.userId);
      }
    }

    await transfer.save();

    // Notify requester
    await notificationService.createNotification({
      recipientId: transfer.requestedByUserId,
      recipientRole: transfer.requestedByRole as any,
      title: `Transfer Request ${status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
      message: `Transfer request for player has been ${status.toLowerCase()}.${responseNote ? ` Note: ${responseNote}` : ''}`,
      type: `TRANSFER_REQUEST_${status}`,
      data: { transferRequestId: transfer._id, status },
    });

    return {
      message: `Transfer request ${status.toLowerCase()} successfully`,
      transfer,
    };
  }

  // ==========================================
  // PARENT MANAGEMENT (ACADEMY DASHBOARD)
  // ==========================================

  async getAcademyParents(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    // 1. Gather all players belonging to this academy (directly or through teams)
    const academyTeams = await Team.find({ academyId: academy._id }).select('playerIds teamName');
    const teamPlayerIds = academyTeams.flatMap((t) => t.playerIds || []);
    const teamMap = new Map<string, string>();
    academyTeams.forEach((t) => {
      (t.playerIds || []).forEach((pid) => teamMap.set(pid.toString(), t.teamName));
    });

    const directAcademyPlayers = await PlayerProfile.find({
      $or: [
        { academyId: academy._id },
        { academy: academy.name },
        { currentClub: academy.name },
        { _id: { $in: teamPlayerIds } },
      ],
    }).select('_id fullName position profileImage age currentClub userId');

    const academyPlayerIds = directAcademyPlayers.map((p) => p._id);
    const academyPlayerMap = new Map<string, any>();
    directAcademyPlayers.forEach((p) => {
      academyPlayerMap.set(p._id.toString(), p);
    });

    // 2. Find ParentChild links for these academy players
    const parentChildLinks = await ParentChild.find({
      childPlayerId: { $in: academyPlayerIds },
    }).lean();

    const linkedParentIds = parentChildLinks.map((l) => l.parentId);

    // 3. Find ParentProfiles onboarded by this academy directly
    const onboardedProfiles = await ParentProfile.find({ academyId: academy._id })
      .select('_id userId')
      .lean();
    const onboardedProfileIds = onboardedProfiles.map((p) => p._id);
    const onboardedUserIds = onboardedProfiles.map((p) => p.userId);

    // 4. Combine all parent identifiers (profile IDs & user IDs)
    const allParentLookupIds = Array.from(
      new Set([
        ...linkedParentIds.map((id) => id.toString()),
        ...onboardedProfileIds.map((id) => id.toString()),
        ...onboardedUserIds.filter(Boolean).map((id) => id.toString()),
      ]),
    );

    // 5. Fetch all ParentProfiles
    const parentProfiles = await ParentProfile.find({
      $or: [
        { _id: { $in: allParentLookupIds } },
        { userId: { $in: allParentLookupIds } },
        { academyId: academy._id },
      ],
    })
      .populate('userId', 'name email avatar phone address status')
      .sort({ createdAt: -1 })
      .lean();

    // In case some ParentChild records only pointed to User without a ParentProfile, handle user lookup
    const foundProfileUserIds = new Set(
      parentProfiles.map((p) => (p.userId as any)?._id?.toString() || p.userId?.toString()),
    );
    const missingUserIds = allParentLookupIds.filter(
      (id) => !foundProfileUserIds.has(id) && Types.ObjectId.isValid(id),
    );

    let orphanParentUsers: any[] = [];
    if (missingUserIds.length > 0) {
      orphanParentUsers = await User.find({
        _id: { $in: missingUserIds },
        role: { $in: ['PARENT', 'GUARDIAN'] },
      }).lean();
    }

    // 6. Gather all child links for each parent to format linked players
    const allProfilesAndUsers = [
      ...parentProfiles.map((p) => ({ type: 'profile', doc: p })),
      ...orphanParentUsers.map((u) => ({
        type: 'user',
        doc: {
          _id: u._id,
          userId: u,
          contactPhone: u.phone,
          firstName: u.name?.split(' ')[0] || '',
          lastName: u.name?.split(' ').slice(1).join(' ') || '',
          notes: '',
          createdAt: u.createdAt,
        },
      })),
    ];

    const allCandidateParentIds = allProfilesAndUsers.flatMap((item: any) => {
      const p = item.doc;
      const ids: string[] = [];
      if (p._id) ids.push(p._id.toString());
      if (p.userId?._id) ids.push(p.userId._id.toString());
      else if (p.userId) ids.push(p.userId.toString());
      return ids;
    });

    const allLinks = await ParentChild.find({
      parentId: { $in: allCandidateParentIds },
    })
      .populate({
        path: 'childPlayerId',
        select: 'fullName position profileImage age userId currentClub',
      })
      .lean();

    // Map parentId string to its children
    const linksByParentId = new Map<string, any[]>();
    allLinks.forEach((link: any) => {
      const pIdStr = link.parentId?.toString();
      if (!linksByParentId.has(pIdStr)) linksByParentId.set(pIdStr, []);
      linksByParentId.get(pIdStr)!.push(link);
    });

    // 7. Format rows
    const formattedParents = allProfilesAndUsers.map((item: any) => {
      const p = item.doc;
      const u = (p.userId && typeof p.userId === 'object' ? p.userId : {}) as any;

      const pProfileId = p._id ? p._id.toString() : '';
      const pUserId = u._id ? u._id.toString() : p.userId ? p.userId.toString() : '';

      const relevantLinks = [
        ...(linksByParentId.get(pProfileId) || []),
        ...(linksByParentId.get(pUserId) || []),
      ];

      // Deduplicate children by childPlayerId
      const seenChildIds = new Set<string>();
      const linkedPlayers: any[] = [];
      for (const l of relevantLinks) {
        const child = l.childPlayerId;
        if (!child || !child._id) continue;
        const cIdStr = child._id.toString();
        if (seenChildIds.has(cIdStr)) continue;
        seenChildIds.add(cIdStr);

        linkedPlayers.push({
          _id: child._id,
          id: child._id,
          name: child.fullName || 'Athlete',
          position: child.position || 'Forward',
          avatar: child.profileImage || '',
          teamName: teamMap.get(cIdStr) || '',
          age: child.age ? `${child.age} yrs` : '',
          ageValue: child.age || null,
          relationshipType: l.relationshipType,
        });
      }

      const fullName =
        u.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Parent / Guardian';

      const firstName = p.firstName || (u.name ? u.name.split(' ')[0] : '');
      const lastName = p.lastName || (u.name ? u.name.split(' ').slice(1).join(' ') : '');

      const phone = p.contactPhone || u.phone || '';
      const email = u.email || '';
      const relationship =
        p.relationship ||
        (linkedPlayers[0]?.relationshipType
          ? linkedPlayers[0].relationshipType.charAt(0) +
            linkedPlayers[0].relationshipType.slice(1).toLowerCase()
          : 'Parent');

      const streetAddress = p.streetAddress || '';
      const city = p.city || '';
      const zipCode = p.zipCode || '';
      const address = [streetAddress, city, zipCode].filter(Boolean).join(', ') || u.address || '';

      return {
        _id: p._id,
        id: p._id,
        userId: pUserId,
        name: fullName,
        firstName,
        lastName,
        email,
        phone,
        alternatePhone: p.alternatePhone || '',
        relationship,
        occupation: p.occupation || '',
        streetAddress,
        city,
        zipCode,
        address,
        notes: p.notes || '',
        avatar: u.avatar || '',
        status: u.status || 'ACTIVE',
        linkedPlayers,
        linkedPlayersCount: linkedPlayers.length,
        createdAt: p.createdAt || u.createdAt,
      };
    });

    // 8. Comprehensive Filtering
    let filtered = formattedParents;

    // Search filter (name, email, phone, relationship, occupation, notes, address, child athlete name, position, team)
    const searchTerm = (query.searchTerm || query.search || query.q || '').trim().toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter((item) => {
        const matchName = item.name.toLowerCase().includes(searchTerm);
        const matchEmail = item.email.toLowerCase().includes(searchTerm);
        const matchPhone = item.phone.toLowerCase().includes(searchTerm);
        const matchRel = item.relationship.toLowerCase().includes(searchTerm);
        const matchOcc = item.occupation.toLowerCase().includes(searchTerm);
        const matchAddr = item.address.toLowerCase().includes(searchTerm);
        const matchNotes = item.notes.toLowerCase().includes(searchTerm);
        const matchChild = item.linkedPlayers.some(
          (c: any) =>
            c.name.toLowerCase().includes(searchTerm) ||
            c.position.toLowerCase().includes(searchTerm) ||
            c.teamName.toLowerCase().includes(searchTerm),
        );
        return (
          matchName ||
          matchEmail ||
          matchPhone ||
          matchRel ||
          matchOcc ||
          matchAddr ||
          matchNotes ||
          matchChild
        );
      });
    }

    // Relationship filter (e.g. Father, Mother, Guardian)
    if (query.relationship) {
      const relFilter = String(query.relationship).trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.relationship.toLowerCase() === relFilter ||
          p.linkedPlayers.some(
            (c: any) =>
              (c.relationshipType || '').toLowerCase() === relFilter ||
              (c.relationshipType || '').toLowerCase() === relFilter.toUpperCase(),
          ),
      );
    }

    // Team filter (teamId or teamName)
    if (query.teamId || query.teamName) {
      const targetTeam = String(query.teamId || query.teamName)
        .trim()
        .toLowerCase();
      filtered = filtered.filter((p) =>
        p.linkedPlayers.some(
          (c: any) =>
            (c.teamName && c.teamName.toLowerCase().includes(targetTeam)) ||
            (c.teamId && c.teamId.toString() === targetTeam),
        ),
      );
    }

    // Player filter (playerId or playerName)
    if (query.playerId || query.playerName) {
      const targetPlayer = String(query.playerId || query.playerName)
        .trim()
        .toLowerCase();
      filtered = filtered.filter((p) =>
        p.linkedPlayers.some(
          (c: any) =>
            (c._id && c._id.toString() === targetPlayer) ||
            (c.name && c.name.toLowerCase().includes(targetPlayer)),
        ),
      );
    }

    // hasLinkedPlayers filter ('true' | 'false')
    if (query.hasLinkedPlayers !== undefined) {
      const hasLinks = String(query.hasLinkedPlayers).toLowerCase() === 'true';
      filtered = filtered.filter((p) => p.linkedPlayersCount > 0 === hasLinks);
    }

    // Status filter ('ACTIVE', 'INACTIVE', 'BLOCKED')
    if (query.status) {
      const statusFilter = String(query.status).trim().toUpperCase();
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    // Date range filter
    if (query.startDate) {
      const start = new Date(query.startDate).getTime();
      if (!isNaN(start)) {
        filtered = filtered.filter((p) => p.createdAt && new Date(p.createdAt).getTime() >= start);
      }
    }
    if (query.endDate) {
      const end = new Date(query.endDate).getTime();
      if (!isNaN(end)) {
        filtered = filtered.filter((p) => p.createdAt && new Date(p.createdAt).getTime() <= end);
      }
    }

    // 9. Sorting
    const sortBy = String(query.sortBy || 'createdAt');
    const sortOrder = String(query.sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;

    filtered.sort((a: any, b: any) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (sortBy === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === 'createdAt') {
        valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      } else if (sortBy === 'linkedPlayersCount') {
        valA = a.linkedPlayersCount || 0;
        valB = b.linkedPlayersCount || 0;
      }

      if (valA < valB) return -1 * sortOrder;
      if (valA > valB) return 1 * sortOrder;
      return 0;
    });

    // 10. Pagination
    const totalCount = filtered.length;
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit =
      query.limit === 'all' || query.limit === '0'
        ? totalCount || 10
        : Math.max(1, parseInt(query.limit as string, 10) || 10);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const paginatedParents =
      query.limit === 'all' || query.limit === '0'
        ? filtered
        : filtered.slice((page - 1) * limit, page * limit);

    return {
      academy: {
        _id: academy._id,
        name: academy.name,
        logo: academy.logo || '',
      },
      stats: {
        totalParents: totalCount,
        totalLinkedPlayers: filtered.reduce((acc, p) => acc + p.linkedPlayersCount, 0),
        parentsWithLinkedPlayers: filtered.filter((p) => p.linkedPlayersCount > 0).length,
        parentsWithoutLinkedPlayers: filtered.filter((p) => p.linkedPlayersCount === 0).length,
      },
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages,
      },
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      parents: paginatedParents,
    };
  }

  async getAvailablePlayersForParentLinking(
    user: any,
    query: any = {},
    academyIdentifier?: string,
  ) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    const teams = await Team.find({ academyId: academy._id }).select('teamName playerIds');
    const teamPlayerIds = teams.flatMap((t) => t.playerIds || []);
    const teamMap = new Map<string, string>();
    teams.forEach((t) => {
      (t.playerIds || []).forEach((pid) => teamMap.set(pid.toString(), t.teamName));
    });

    const playerFilter: any = {
      $or: [
        { academyId: academy._id },
        { academy: academy.name },
        { currentClub: academy.name },
        { _id: { $in: teamPlayerIds } },
      ],
    };

    if (query.teamId && Types.ObjectId.isValid(query.teamId)) {
      const selectedTeam = teams.find((t) => t._id.toString() === query.teamId);
      if (selectedTeam) {
        playerFilter._id = { $in: selectedTeam.playerIds || [] };
      }
    }

    const players = await PlayerProfile.find(playerFilter)
      .select('_id fullName position profileImage age userId currentClub teamId')
      .populate('userId', 'name avatar email phone')
      .sort({ fullName: 1 })
      .lean();

    const playerIds = players.map((p) => p._id);

    // Find all ParentChild links for these players
    const existingLinks = await ParentChild.find({
      childPlayerId: { $in: playerIds },
    })
      .populate({
        path: 'parentId',
        populate: { path: 'userId', select: 'name email phone avatar' },
      })
      .lean();

    // Map playerId -> list of linked parents
    const linksByPlayerId = new Map<string, any[]>();
    existingLinks.forEach((link: any) => {
      const pidStr = link.childPlayerId?.toString();
      if (!linksByPlayerId.has(pidStr)) linksByPlayerId.set(pidStr, []);
      linksByPlayerId.get(pidStr)!.push(link);
    });

    const formatted = players.map((p) => {
      const u = (p.userId && typeof p.userId === 'object' ? p.userId : {}) as any;
      const pidStr = p._id.toString();
      const pLinks = linksByPlayerId.get(pidStr) || [];

      const linkedParents = pLinks.map((l: any) => {
        const parentProf = (l.parentId && typeof l.parentId === 'object' ? l.parentId : {}) as any;
        const parentUser = (
          parentProf.userId && typeof parentProf.userId === 'object' ? parentProf.userId : {}
        ) as any;

        const parentName =
          parentUser.name ||
          [parentProf.firstName, parentProf.lastName].filter(Boolean).join(' ') ||
          'Parent';

        return {
          parentProfileId: parentProf._id || l.parentId,
          parentUserId: parentUser._id || undefined,
          name: parentName,
          relationshipType: l.relationshipType || parentProf.relationship || 'Guardian',
          email: parentUser.email || '',
          phone: parentProf.contactPhone || parentUser.phone || '',
        };
      });

      const isLinked = linkedParents.length > 0;
      const parentNames = linkedParents.map((lp) => `${lp.name} (${lp.relationshipType})`);

      return {
        _id: p._id,
        id: p._id,
        name: p.fullName || u.name || 'Athlete',
        position: p.position || 'Forward',
        avatar: p.profileImage || u.avatar || '',
        teamName: teamMap.get(pidStr) || '',
        age: p.age ? `${p.age} yrs` : '',
        ageValue: p.age || null,
        email: u.email || '',
        isLinked,
        hasParent: isLinked,
        status: isLinked ? 'LINKED' : 'AVAILABLE',
        parentsCount: linkedParents.length,
        linkedParents,
        parentNames,
      };
    });

    // Handle filters: unlinkedOnly / availableOnly / status / search
    let result = formatted;
    const filterStatus = String(query.status || '').toUpperCase();
    const unlinkedOnly =
      query.unlinkedOnly === 'true' ||
      query.availableOnly === 'true' ||
      filterStatus === 'AVAILABLE' ||
      filterStatus === 'UNLINKED';
    const linkedOnly = query.linkedOnly === 'true' || filterStatus === 'LINKED';

    if (unlinkedOnly) {
      result = result.filter((p) => !p.isLinked);
    } else if (linkedOnly) {
      result = result.filter((p) => p.isLinked);
    }

    if (query.searchTerm || query.search || query.q) {
      const q = String(query.searchTerm || query.search || query.q)
        .trim()
        .toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.position.toLowerCase().includes(q) ||
          p.teamName.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.parentNames.some((pn) => pn.toLowerCase().includes(q)),
      );
    }

    return result;
  }

  async onboardParent(user: any, payload: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    const email = String(payload.email || '')
      .toLowerCase()
      .trim();
    if (!email) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Email address is required');
    }

    const firstName = String(payload.firstName || '').trim();
    const lastName = String(payload.lastName || '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Parent / Guardian';
    const primaryPhone = String(payload.primaryPhone || payload.phone || '').trim();
    const alternatePhone = payload.alternatePhone
      ? String(payload.alternatePhone).trim()
      : undefined;
    const relationship = String(payload.relationship || 'Guardian').trim();
    const occupation = payload.occupation ? String(payload.occupation).trim() : undefined;
    const streetAddress = payload.streetAddress ? String(payload.streetAddress).trim() : undefined;
    const city = payload.city ? String(payload.city).trim() : undefined;
    const zipCode = payload.zipCode ? String(payload.zipCode).trim() : undefined;
    const notes = payload.notes ? String(payload.notes).trim() : undefined;

    const rawLinkedPlayerIds: any[] = Array.isArray(payload.linkedPlayerIds)
      ? payload.linkedPlayerIds
      : Array.isArray(payload.linkedPlayers)
        ? payload.linkedPlayers
        : Array.isArray(payload.playerIds)
          ? payload.playerIds
          : [];

    // 1. Find or create user
    let parentUser = await User.findOne({ email });
    let isNewUser = false;
    let initialPassword = '';

    if (!parentUser) {
      isNewUser = true;
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      initialPassword = `Parent@${randomSuffix}`;
      const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
      const hashedPassword = await bcrypt.hash(initialPassword, salt);

      parentUser = await User.create({
        name: fullName,
        email,
        password: hashedPassword,
        role: 'PARENT',
        phone: primaryPhone,
        contactPhone: primaryPhone,
        address: [streetAddress, city, zipCode].filter(Boolean).join(', ') || undefined,
        isEmailVerified: true,
        status: 'ACTIVE',
      });
    } else {
      if (parentUser.role !== 'PARENT' && (parentUser.role as any) !== 'GUARDIAN') {
        parentUser.role = 'PARENT';
      }
      if (primaryPhone && !parentUser.phone) {
        parentUser.phone = primaryPhone;
      }
      if (!parentUser.address && (streetAddress || city || zipCode)) {
        parentUser.address = [streetAddress, city, zipCode].filter(Boolean).join(', ');
      }
      await parentUser.save();
    }

    // 2. Find or create ParentProfile
    let parentProfile = await ParentProfile.findOne({
      $or: [{ userId: parentUser._id }, { _id: parentUser.parentProfileId }],
    });

    if (!parentProfile) {
      parentProfile = await ParentProfile.create({
        userId: parentUser._id,
        contactPhone: primaryPhone || parentUser.phone || '+8801700000000',
        alternatePhone,
        firstName,
        lastName,
        relationship,
        occupation,
        streetAddress,
        city,
        zipCode,
        notes,
        academyId: academy._id,
      });
    } else {
      if (firstName) parentProfile.firstName = firstName;
      if (lastName) parentProfile.lastName = lastName;
      if (primaryPhone) parentProfile.contactPhone = primaryPhone;
      if (alternatePhone !== undefined) parentProfile.alternatePhone = alternatePhone;
      if (relationship) parentProfile.relationship = relationship;
      if (occupation !== undefined) parentProfile.occupation = occupation;
      if (streetAddress !== undefined) parentProfile.streetAddress = streetAddress;
      if (city !== undefined) parentProfile.city = city;
      if (zipCode !== undefined) parentProfile.zipCode = zipCode;
      if (notes !== undefined) parentProfile.notes = notes;
      if (!parentProfile.academyId) parentProfile.academyId = academy._id;
      await parentProfile.save();
    }

    // Ensure user references parentProfile
    if (
      !parentUser.parentProfileId ||
      parentUser.parentProfileId.toString() !== parentProfile._id.toString()
    ) {
      parentUser.parentProfileId = parentProfile._id.toString();
      await parentUser.save();
    }

    // 3. Link child players in ParentChild
    const relUpper = relationship.toUpperCase();
    let relEnum: 'FATHER' | 'MOTHER' | 'GUARDIAN' = 'GUARDIAN';
    if (relUpper.includes('FATHER')) relEnum = 'FATHER';
    else if (relUpper.includes('MOTHER')) relEnum = 'MOTHER';

    const linkedResults: any[] = [];
    for (const rawId of rawLinkedPlayerIds) {
      const pidStr = typeof rawId === 'object' && rawId?._id ? rawId._id : String(rawId).trim();
      if (!pidStr) continue;

      let player = null;
      if (Types.ObjectId.isValid(pidStr)) {
        player = await PlayerProfile.findById(pidStr);
        if (!player) {
          player = await PlayerProfile.findOne({ userId: pidStr });
        }
      }
      if (!player) {
        player = await PlayerProfile.findOne({ fullName: pidStr });
      }
      if (!player) continue;

      // Upsert link
      const existingLink = await ParentChild.findOne({
        parentId: parentProfile._id,
        childPlayerId: player._id,
      });

      if (!existingLink) {
        await ParentChild.create({
          parentId: parentProfile._id,
          childPlayerId: player._id,
          relationshipType: relEnum,
        });
      } else if (existingLink.relationshipType !== relEnum) {
        existingLink.relationshipType = relEnum;
        await existingLink.save();
      }

      // Mark child user accountManagedBy = 'PARENT'
      if (player.userId) {
        await User.findByIdAndUpdate(player.userId, {
          accountManagedBy: 'PARENT',
        });
      }

      // Invalidate cache
      await playerCacheService.invalidatePlayerCache(player._id, player.userId);

      linkedResults.push({
        _id: player._id,
        name: player.fullName,
        position: player.position,
      });
    }

    return {
      message: isNewUser
        ? 'Parent onboarded and account created successfully'
        : 'Parent updated and players linked successfully',
      isNewUser,
      parent: {
        _id: parentProfile._id,
        id: parentProfile._id,
        userId: parentUser._id,
        name: parentUser.name,
        firstName: parentProfile.firstName,
        lastName: parentProfile.lastName,
        email: parentUser.email,
        phone: parentProfile.contactPhone,
        alternatePhone: parentProfile.alternatePhone,
        relationship: parentProfile.relationship,
        occupation: parentProfile.occupation,
        streetAddress: parentProfile.streetAddress,
        city: parentProfile.city,
        zipCode: parentProfile.zipCode,
        address: [parentProfile.streetAddress, parentProfile.city, parentProfile.zipCode]
          .filter(Boolean)
          .join(', '),
        notes: parentProfile.notes,
        linkedPlayers: linkedResults,
        linkedPlayersCount: linkedResults.length,
      },
      credentials: isNewUser
        ? {
            email: parentUser.email,
            temporaryPassword: initialPassword,
          }
        : undefined,
    };
  }

  async getAcademyParentById(parentId: string, user: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    let parentProfile = null;
    if (Types.ObjectId.isValid(parentId)) {
      parentProfile = await ParentProfile.findOne({
        $or: [{ _id: parentId }, { userId: parentId }],
      }).populate('userId', 'name email avatar phone address status');
    }
    if (!parentProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent profile not found');
    }

    const u = (
      parentProfile.userId && typeof parentProfile.userId === 'object' ? parentProfile.userId : {}
    ) as any;

    // Find linked children
    const links = await ParentChild.find({
      parentId: { $in: [parentProfile._id, u._id].filter(Boolean) },
    }).populate({
      path: 'childPlayerId',
      select: 'fullName position profileImage age userId currentClub academyId',
    });

    const teams = await Team.find({ academyId: academy._id }).select('teamName playerIds');
    const teamMap = new Map<string, string>();
    teams.forEach((t) => {
      (t.playerIds || []).forEach((pid) => teamMap.set(pid.toString(), t.teamName));
    });

    const linkedPlayers = links.map((l: any) => {
      const child = l.childPlayerId || {};
      const cIdStr = child._id ? child._id.toString() : '';
      return {
        _id: child._id,
        id: child._id,
        name: child.fullName || 'Athlete',
        position: child.position || 'Forward',
        avatar: child.profileImage || '',
        teamName: teamMap.get(cIdStr) || '',
        age: child.age ? `${child.age} yrs` : '',
        relationshipType: l.relationshipType,
      };
    });

    return {
      _id: parentProfile._id,
      id: parentProfile._id,
      userId: u._id,
      name: u.name || `${parentProfile.firstName || ''} ${parentProfile.lastName || ''}`.trim(),
      firstName: parentProfile.firstName,
      lastName: parentProfile.lastName,
      email: u.email,
      phone: parentProfile.contactPhone || u.phone,
      alternatePhone: parentProfile.alternatePhone,
      relationship: parentProfile.relationship,
      occupation: parentProfile.occupation,
      streetAddress: parentProfile.streetAddress,
      city: parentProfile.city,
      zipCode: parentProfile.zipCode,
      address:
        [parentProfile.streetAddress, parentProfile.city, parentProfile.zipCode]
          .filter(Boolean)
          .join(', ') ||
        u.address ||
        '',
      notes: parentProfile.notes,
      avatar: u.avatar || '',
      linkedPlayers,
      linkedPlayersCount: linkedPlayers.length,
      createdAt: parentProfile.createdAt,
    };
  }

  async updateAcademyParent(parentId: string, user: any, payload: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    let parentProfile = null;
    if (Types.ObjectId.isValid(parentId)) {
      parentProfile = await ParentProfile.findOne({
        $or: [{ _id: parentId }, { userId: parentId }],
      });
    }
    if (!parentProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent profile not found');
    }

    const parentUser = await User.findById(parentProfile.userId);

    // Update parent profile fields
    if (payload.firstName !== undefined) parentProfile.firstName = payload.firstName;
    if (payload.lastName !== undefined) parentProfile.lastName = payload.lastName;
    if (payload.primaryPhone !== undefined || payload.phone !== undefined) {
      parentProfile.contactPhone = payload.primaryPhone || payload.phone;
      if (parentUser) {
        parentUser.phone = parentProfile.contactPhone;
        parentUser.contactPhone = parentProfile.contactPhone;
      }
    }
    if (payload.alternatePhone !== undefined) parentProfile.alternatePhone = payload.alternatePhone;
    if (payload.relationship !== undefined) parentProfile.relationship = payload.relationship;
    if (payload.occupation !== undefined) parentProfile.occupation = payload.occupation;
    if (payload.streetAddress !== undefined) parentProfile.streetAddress = payload.streetAddress;
    if (payload.city !== undefined) parentProfile.city = payload.city;
    if (payload.zipCode !== undefined) parentProfile.zipCode = payload.zipCode;
    if (payload.notes !== undefined) parentProfile.notes = payload.notes;

    if (payload.firstName || payload.lastName) {
      const updatedName = [
        payload.firstName || parentProfile.firstName,
        payload.lastName || parentProfile.lastName,
      ]
        .filter(Boolean)
        .join(' ');
      if (parentUser && updatedName) parentUser.name = updatedName;
    }

    await parentProfile.save();
    if (parentUser) await parentUser.save();

    // If linkedPlayerIds is provided, sync links
    const rawLinkedPlayerIds =
      payload.linkedPlayerIds || payload.linkedPlayers || payload.playerIds;
    if (Array.isArray(rawLinkedPlayerIds)) {
      // Find current academy's players
      const academyTeams = await Team.find({ academyId: academy._id }).select('playerIds');
      const teamPlayerIds = academyTeams.flatMap((t) => t.playerIds || []);
      const academyPlayers = await PlayerProfile.find({
        $or: [
          { academyId: academy._id },
          { academy: academy.name },
          { currentClub: academy.name },
          { _id: { $in: teamPlayerIds } },
        ],
      }).select('_id userId');
      const academyPlayerIds = academyPlayers.map((p) => p._id);

      // Remove existing links for this academy's players
      await ParentChild.deleteMany({
        parentId: parentProfile._id,
        childPlayerId: { $in: academyPlayerIds },
      });

      // Normalize relationship
      const relUpper = (
        payload.relationship ||
        parentProfile.relationship ||
        'Guardian'
      ).toUpperCase();
      let relEnum: 'FATHER' | 'MOTHER' | 'GUARDIAN' = 'GUARDIAN';
      if (relUpper.includes('FATHER')) relEnum = 'FATHER';
      else if (relUpper.includes('MOTHER')) relEnum = 'MOTHER';

      // Insert new links
      for (const rawPid of rawLinkedPlayerIds) {
        const pid = typeof rawPid === 'object' && rawPid?._id ? rawPid._id : String(rawPid).trim();
        if (!pid) continue;
        const player = await PlayerProfile.findById(pid);
        if (!player) continue;

        await ParentChild.create({
          parentId: parentProfile._id,
          childPlayerId: player._id,
          relationshipType: relEnum,
        });

        if (player.userId) {
          await User.findByIdAndUpdate(player.userId, {
            accountManagedBy: 'PARENT',
          });
          await playerCacheService.invalidatePlayerCache(player._id, player.userId);
        }
      }
    }

    return this.getAcademyParentById(parentProfile._id.toString(), user, academyIdentifier);
  }

  async unlinkParentFromAcademy(parentId: string, user: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    let parentProfile = null;
    if (Types.ObjectId.isValid(parentId)) {
      parentProfile = await ParentProfile.findOne({
        $or: [{ _id: parentId }, { userId: parentId }],
      });
    }
    if (!parentProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent profile not found');
    }

    // Get this academy's player IDs
    const academyTeams = await Team.find({ academyId: academy._id }).select('playerIds');
    const teamPlayerIds = academyTeams.flatMap((t) => t.playerIds || []);
    const academyPlayers = await PlayerProfile.find({
      $or: [
        { academyId: academy._id },
        { academy: academy.name },
        { currentClub: academy.name },
        { _id: { $in: teamPlayerIds } },
      ],
    }).select('_id userId');

    const academyPlayerIds = academyPlayers.map((p) => p._id);
    const targetParentIds = [parentProfile._id, parentProfile.userId].filter(Boolean);

    // Delete ParentChild links between this parent and this academy's players
    await ParentChild.deleteMany({
      parentId: { $in: targetParentIds },
      childPlayerId: { $in: academyPlayerIds },
    });

    // Check each player: if no other parent is linked, reset accountManagedBy to 'ATHLETE'
    for (const player of academyPlayers) {
      const remainingLinks = await ParentChild.countDocuments({
        childPlayerId: player._id,
      });
      if (remainingLinks === 0 && player.userId) {
        await User.findByIdAndUpdate(player.userId, {
          accountManagedBy: 'ATHLETE',
        });
        await playerCacheService.invalidatePlayerCache(player._id, player.userId);
      }
    }

    return {
      message: 'Parent unlinked from academy players successfully',
    };
  }

  async linkPlayerToParent(
    parentId: string,
    playerId: string,
    relationship: string = 'Guardian',
    user?: any,
    academyIdentifier?: string,
  ) {
    await this.resolveUserAcademy(user, academyIdentifier);

    const parentProfile = await ParentProfile.findOne({
      $or: [{ _id: parentId }, { userId: parentId }],
    });
    if (!parentProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent profile not found');
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    const relUpper = (relationship || 'Guardian').toUpperCase();
    let relEnum: 'FATHER' | 'MOTHER' | 'GUARDIAN' = 'GUARDIAN';
    if (relUpper.includes('FATHER')) relEnum = 'FATHER';
    else if (relUpper.includes('MOTHER')) relEnum = 'MOTHER';

    const existingLink = await ParentChild.findOne({
      parentId: parentProfile._id,
      childPlayerId: player._id,
    });

    if (!existingLink) {
      await ParentChild.create({
        parentId: parentProfile._id,
        childPlayerId: player._id,
        relationshipType: relEnum,
      });
    }

    if (player.userId) {
      await User.findByIdAndUpdate(player.userId, {
        accountManagedBy: 'PARENT',
      });
      await playerCacheService.invalidatePlayerCache(player._id, player.userId);
    }

    return {
      message: 'Player linked to parent successfully',
      parentId: parentProfile._id,
      playerId: player._id,
    };
  }

  async unlinkPlayerFromParent(
    parentId: string,
    playerId: string,
    user?: any,
    academyIdentifier?: string,
  ) {
    await this.resolveUserAcademy(user, academyIdentifier);

    const parentProfile = await ParentProfile.findOne({
      $or: [{ _id: parentId }, { userId: parentId }],
    });
    if (!parentProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent profile not found');
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    await ParentChild.deleteMany({
      parentId: { $in: [parentProfile._id, parentProfile.userId].filter(Boolean) },
      childPlayerId: player._id,
    });

    const remainingLinks = await ParentChild.countDocuments({
      childPlayerId: player._id,
    });
    if (remainingLinks === 0 && player.userId) {
      await User.findByIdAndUpdate(player.userId, {
        accountManagedBy: 'ATHLETE',
      });
      await playerCacheService.invalidatePlayerCache(player._id, player.userId);
    }

    return {
      message: 'Player unlinked from parent successfully',
    };
  }
}

export const academyService = new AcademyService();
