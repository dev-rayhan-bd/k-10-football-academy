import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { IAcademyProfile, ITeam, IGameReport, IPlayerEvaluation } from './academy.interface';
import { AcademyProfile, Team, GameReport, PlayerEvaluation, AcademyCoach } from './academy.model';
import QueryBuilder from '@/builder/QueryBuilder';

import { NotificationService } from '@/modules/notification/notification.service';
import { PlayerProfile, PlayerAttributes, MatchRecord } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { User } from '@/modules/user/user.model';
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
}

export const academyService = new AcademyService();
