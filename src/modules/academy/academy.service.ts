import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { IAcademyProfile, ITeam, IGameReport, IPlayerEvaluation } from './academy.interface';
import { AcademyProfile, Team, GameReport, PlayerEvaluation, AcademyCoach } from './academy.model';
import QueryBuilder from '@/builder/QueryBuilder';

import { NotificationService } from '@/modules/notification/notification.service';
import { PlayerProfile, PlayerAttributes } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { User } from '@/modules/user/user.model';

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
    const planLimits: Record<string, number> = {
      FREE: 1,
      BASIC: 3,
      PRO: 5,
      PREMIUM: 15,
    };
    const maxTeams =
      academy.maxTeams && academy.maxTeams > 0 ? academy.maxTeams : planLimits[currentPlan] || 1;

    const usedTeams = totalTeams;
    const capacityDisplay = `${usedTeams}/${maxTeams}`;
    const usagePercentage = Math.min(100, Math.round((usedTeams / maxTeams) * 100));
    const isLimitReached = usedTeams >= maxTeams;

    const message = isLimitReached
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
        maxTeams,
        capacityDisplay,
        usagePercentage,
        isLimitReached,
        upgradeRequired: isLimitReached,
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
    const planLimits: Record<string, number> = {
      FREE: 1,
      BASIC: 3,
      PRO: 5,
      PREMIUM: 15,
    };
    const maxTeams =
      academy.maxTeams && academy.maxTeams > 0 ? academy.maxTeams : planLimits[currentPlan] || 1;

    if (existingTeamsCount >= maxTeams) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        `Team capacity limit reached for your ${currentPlan} plan (${existingTeamsCount}/${maxTeams}). Upgrade your plan to add more teams.`,
      );
    }

    const coachIds = (payload.coachIds || []).map((id) => new Types.ObjectId(id));
    const playerIds = (payload.playerIds || []).map((id) => new Types.ObjectId(id));
    const coachesCount = coachIds.length;
    const playersCount = playerIds.length;
    const totalMembers = coachesCount + playersCount;

    const newTeam = await Team.create({
      academyId: academy._id,
      teamName: payload.teamName,
      ageGroup: payload.ageGroup,
      status: payload.status || 'ACTIVE',
      coachIds,
      playerIds,
      coachesCount,
      playersCount,
      totalMembers,
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
    const planLimits: Record<string, number> = {
      FREE: 1,
      BASIC: 3,
      PRO: 5,
      PREMIUM: 15,
    };
    const newMaxTeams =
      customMaxTeams && customMaxTeams > 0 ? customMaxTeams : planLimits[plan] || 1;

    academy.currentPlan = plan;
    academy.maxTeams = newMaxTeams;
    await academy.save();

    const usedTeams = await Team.countDocuments({ academyId: academy._id });

    return {
      message: `Plan updated successfully to ${plan}`,
      currentPlan: academy.currentPlan,
      usedTeams,
      maxTeams: academy.maxTeams,
      capacityDisplay: `${usedTeams}/${academy.maxTeams}`,
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
