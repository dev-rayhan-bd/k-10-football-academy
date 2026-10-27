import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { ITeam } from '../academy.interface';
import { AcademyProfile, Team, AcademyCoach } from '../academy.model';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { User } from '@/modules/user/user.model';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { academyResolverService } from './academy-resolver.service';
import { academyProfileService } from './academy-profile.service';

export class AcademyTeamsService {
  async getCoachAndPlayersDashboard(academyIdentifier: string) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);

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

    const featureAccess = await academyProfileService.getAcademyFeatureAccess(
      academy._id,
      academy.currentPlan,
    );

    const members = await this.getAvailableMembers(academyIdentifier);

    return {
      summary: {
        totalTeams,
        totalCoaches,
        totalPlayers,
        totalRosterMembers,
        maxCoaches: featureAccess.limits.coaches.allowed,
        maxPlayers: featureAccess.limits.players.allowed,
      },
      teamCapacity: {
        currentPlan: featureAccess.currentPlan,
        usedTeams,
        maxTeams: isUnlimited ? null : maxTeams,
        isUnlimited,
        capacityDisplay,
        usagePercentage,
        isLimitReached,
        upgradeRequired: !isUnlimited && isLimitReached,
        message,
      },
      plan: featureAccess,
      teams: formattedTeams,
      coaches: members.coaches,
      players: members.players,
    };
  }

  async getAvailableMembers(academyIdentifier: string) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);

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

  async getAcademyPlayers(academyIdentifier: string, query: any = {}) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 10));
    const search = query?.search ? String(query.search).trim().toLowerCase() : '';
    const teamIdFilter = query?.teamId ? String(query.teamId) : '';
    const positionFilter = query?.position ? String(query.position).trim().toLowerCase() : '';
    const cvTierFilter = query?.cvTier ? String(query.cvTier).trim().toUpperCase() : '';

    const allTeams = await Team.find({ academyId: academy._id }).select(
      'teamName ageGroup playerIds',
    );

    const baseFilter: any = {
      $or: [{ academyId: academy._id }, { academy: academy.name }],
    };
    if (cvTierFilter && cvTierFilter !== 'ALL') {
      baseFilter.cvTier = cvTierFilter;
    }

    const rawPlayers = await PlayerProfile.find(baseFilter)
      .populate('userId', 'name email avatar phone')
      .populate('teamId', 'teamName ageGroup')
      .sort({ createdAt: -1 })
      .lean();

    let players = rawPlayers.map((player: any) => {
      const assignedTeam = allTeams.find(
        (t) =>
          (player.teamId && player.teamId._id
            ? player.teamId._id.toString() === t._id.toString()
            : player.teamId?.toString() === t._id.toString()) ||
          (t.playerIds && t.playerIds.some((id: any) => id.toString() === player._id.toString())),
      );

      const userObj = player.userId && typeof player.userId === 'object' ? player.userId : {};
      return {
        _id: player._id,
        id: player._id,
        fullName: player.fullName || userObj?.name || 'Player',
        position: player.position || 'Forward',
        age: player.age || 18,
        dateOfBirth: player.dateOfBirth,
        overallRating: player.overallRating || 75,
        profileImage: player.profileImage || player.avatar || userObj?.avatar || '',
        cvTier: player.cvTier || 'GOLD',
        email: userObj?.email || player.email || '',
        phone: userObj?.phone || player.phone || '',
        jerseyNumber: player.jerseyNumber,
        assignedTeamId: assignedTeam
          ? assignedTeam._id
          : player.teamId?._id || player.teamId || null,
        assignedTeamName: assignedTeam ? assignedTeam.teamName : player.teamId?.teamName || null,
        assignedTeamAgeGroup: assignedTeam
          ? assignedTeam.ageGroup
          : player.teamId?.ageGroup || null,
        status: player.status || 'ACTIVE',
        createdAt: player.createdAt,
      };
    });

    if (search) {
      players = players.filter(
        (p: any) =>
          p.fullName.toLowerCase().includes(search) ||
          p.position.toLowerCase().includes(search) ||
          (p.assignedTeamName && p.assignedTeamName.toLowerCase().includes(search)) ||
          p.email.toLowerCase().includes(search),
      );
    }

    if (teamIdFilter) {
      players = players.filter(
        (p: any) => p.assignedTeamId && p.assignedTeamId.toString() === teamIdFilter,
      );
    }

    if (positionFilter && positionFilter !== 'all') {
      players = players.filter((p: any) => p.position.toLowerCase() === positionFilter);
    }

    const total = players.length;
    const totalPage = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedPlayers = players.slice(startIndex, startIndex + limit);

    return {
      meta: {
        page,
        limit,
        total,
        totalPage,
      },
      academy: {
        id: academy._id,
        name: academy.name,
        logo: academy.logo,
      },
      players: paginatedPlayers,
    };
  }

  async getAcademyPlayerById(academyIdentifier: string, playerId: string) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);

    if (!Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid player ID');
    }

    const player = await PlayerProfile.findOne({
      _id: playerId,
      $or: [{ academyId: academy._id }, { academy: academy.name }],
    })
      .populate('userId', 'name email avatar phone country')
      .populate('teamId', 'teamName ageGroup coachIds playerIds')
      .lean();

    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found in this academy');
    }

    const assignedTeam = await Team.findOne({
      academyId: academy._id,
      playerIds: player._id,
    }).select('teamName ageGroup coachIds');

    return {
      ...player,
      assignedTeamId: assignedTeam ? assignedTeam._id : (player.teamId as any)?._id || null,
      assignedTeamName: assignedTeam
        ? assignedTeam.teamName
        : (player.teamId as any)?.teamName || null,
      assignedTeamAgeGroup: assignedTeam
        ? assignedTeam.ageGroup
        : (player.teamId as any)?.ageGroup || null,
    };
  }

  async updateAcademyPlayer(academyIdentifier: string, playerId: string, payload: any) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);

    if (!Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid player ID');
    }

    const player = await PlayerProfile.findOne({
      _id: playerId,
      $or: [{ academyId: academy._id }, { academy: academy.name }],
    });

    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found in this academy');
    }

    if (payload.position) player.position = payload.position;
    if (payload.jerseyNumber !== undefined) player.jerseyNumber = payload.jerseyNumber;
    if (payload.cvTier) player.cvTier = payload.cvTier;
    if (payload.overallRating !== undefined) player.overallRating = payload.overallRating;

    // Team Assignment
    if (payload.teamId !== undefined) {
      await Team.updateMany(
        { academyId: academy._id, playerIds: player._id },
        { $pull: { playerIds: player._id } },
      );

      if (payload.teamId && Types.ObjectId.isValid(payload.teamId)) {
        const targetTeam = await Team.findOne({ _id: payload.teamId, academyId: academy._id });
        if (!targetTeam) {
          throw new AppError(StatusCodes.NOT_FOUND, 'Target team not found in this academy');
        }
        await Team.findByIdAndUpdate(payload.teamId, {
          $addToSet: { playerIds: player._id },
        });
        player.teamId = targetTeam._id as any;
      } else {
        player.teamId = undefined;
      }
    }

    await player.save();

    // Recalculate members count for affected teams
    const allTeams = await Team.find({ academyId: academy._id });
    for (const t of allTeams) {
      t.playersCount = (t.playerIds || []).length;
      t.coachesCount = (t.coachIds || []).length;
      t.totalMembers = t.playersCount + t.coachesCount;
      await t.save();
    }

    return await this.getAcademyPlayerById(academyIdentifier, playerId);
  }

  async removePlayerFromAcademy(academyIdentifier: string, playerId: string) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);

    if (!Types.ObjectId.isValid(playerId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid player ID');
    }

    const player = await PlayerProfile.findOne({
      _id: playerId,
      $or: [{ academyId: academy._id }, { academy: academy.name }],
    });

    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found in this academy');
    }

    player.academyId = undefined;
    player.academy = undefined;
    player.teamId = undefined;
    await player.save();

    await Team.updateMany(
      { academyId: academy._id, playerIds: player._id },
      { $pull: { playerIds: player._id } },
    );

    const allTeams = await Team.find({ academyId: academy._id });
    for (const t of allTeams) {
      t.playersCount = (t.playerIds || []).length;
      t.coachesCount = (t.coachIds || []).length;
      t.totalMembers = t.playersCount + t.coachesCount;
      await t.save();
    }

    return { message: 'Player removed from academy successfully' };
  }

  async createTeam(
    academyIdentifier: string,
    payload: Partial<ITeam> & { coachIds?: string[]; playerIds?: string[] },
  ) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);

    // Plan capacity check
    const existingTeamsCount = await Team.countDocuments({ academyId: academy._id });
    const currentPlan = academy.currentPlan || 'FREE';
    const isElite = currentPlan === 'ELITE' || currentPlan === 'PREMIUM';

    if (!isElite) {
      if (existingTeamsCount >= 1) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Upgrade to the K10 Elite Plan to unlock this feature. The Elite Plan gives your Academy access to advanced team management, tournament and event creation, online store management, game report commissions, player profile transfers, and additional exclusive benefits.',
        );
      }
    }

    const coachIds = (payload.coachIds || []).map((id) => new Types.ObjectId(id));
    const playerIds = (payload.playerIds || []).map((id) => new Types.ObjectId(id));

    const maxCoaches = isElite ? 2 : 1;
    const maxPlayers = isElite ? 18 : 16;

    if (coachIds.length > maxCoaches) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        isElite
          ? `Maximum ${maxCoaches} coaches allowed per team`
          : 'Free Plan allows a maximum of 1 coach. Upgrade to the K10 Elite Plan to assign additional coaches.',
      );
    }
    if (playerIds.length > maxPlayers) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        isElite
          ? `Maximum ${maxPlayers} players allowed per team`
          : 'Free Plan allows a maximum of 16 players. Upgrade to the K10 Elite Plan to register additional players.',
      );
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
        {
          $set: {
            teamId: newTeam._id,
            academyId: academy._id,
            academy: academy.name,
            currentClub: academy.name,
          },
        },
      );
      const assignedPlayers = await PlayerProfile.find({ _id: { $in: playerIds } }).select(
        'userId',
      );
      const userIds = assignedPlayers.map((p) => p.userId).filter(Boolean);
      if (userIds.length > 0) {
        await User.updateMany(
          { _id: { $in: userIds } },
          { $set: { academyId: academy._id, currentClub: academy.name } },
        );
      }
    }

    // Update assigned coaches
    if (coachIds.length > 0) {
      await CoachProfile.updateMany(
        { _id: { $in: coachIds } },
        { $addToSet: { teamIds: newTeam._id }, $set: { academyId: academy._id } },
      );
      if (playerIds.length > 0) {
        const coachDocs = await CoachProfile.find({ _id: { $in: coachIds } }).select(
          'fullName title',
        );
        const coachNames = coachDocs
          .map((c) => c.fullName || c.title)
          .filter(Boolean)
          .join(', ');
        if (coachNames) {
          await PlayerProfile.updateMany(
            { _id: { $in: playerIds } },
            { $set: { coachesAssigned: coachNames, 'coachVerification.coachName': coachNames } },
          );
        }
      }
    }

    return Team.findById(newTeam._id)
      .populate(
        'coachIds',
        'fullName title profileImage licenseStatus cvTier yearsExperience phone email',
      )
      .populate('playerIds', 'fullName position profileImage overallRating age cvTier dateOfBirth');
  }

  async getTeams(academyIdentifier: string) {
    const academy = await academyResolverService.resolveAcademyProfile(academyIdentifier);
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
        const academy = await AcademyProfile.findById(team.academyId);
        const academyName = academy?.name || '';
        await PlayerProfile.updateMany(
          { _id: { $in: newPlayerIds } },
          {
            $set: {
              teamId: team._id,
              academyId: team.academyId,
              ...(academyName ? { academy: academyName, currentClub: academyName } : {}),
            },
          },
        );
        const assignedPlayers = await PlayerProfile.find({ _id: { $in: newPlayerIds } }).select(
          'userId',
        );
        const userIds = assignedPlayers.map((p) => p.userId).filter(Boolean);
        if (userIds.length > 0 && academyName) {
          await User.updateMany(
            { _id: { $in: userIds } },
            { $set: { academyId: team.academyId, currentClub: academyName } },
          );
        }
      }

      team.playerIds = newPlayerIds;
      team.playersCount = newPlayerIds.length;
    }

    team.totalMembers = (team.coachesCount || 0) + (team.playersCount || 0);
    await team.save();

    const finalPlayerIds = team.playerIds || [];
    const finalCoachIds = team.coachIds || [];
    if (finalPlayerIds.length > 0) {
      if (finalCoachIds.length > 0) {
        const coachDocs = await CoachProfile.find({ _id: { $in: finalCoachIds } }).select(
          'fullName title',
        );
        const coachNames = coachDocs
          .map((c) => c.fullName || c.title)
          .filter(Boolean)
          .join(', ');
        await PlayerProfile.updateMany(
          { _id: { $in: finalPlayerIds } },
          { $set: { coachesAssigned: coachNames, 'coachVerification.coachName': coachNames } },
        );
      } else {
        await PlayerProfile.updateMany(
          { _id: { $in: finalPlayerIds } },
          { $unset: { coachesAssigned: 1, 'coachVerification.coachName': 1 } },
        );
      }
    }

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

    const academy = await AcademyProfile.findById(team.academyId);
    const currentPlan = academy?.currentPlan || 'FREE';
    const isElite = currentPlan === 'ELITE' || currentPlan === 'PREMIUM';
    const maxCoaches = isElite ? 2 : 1;

    if (currentCoachIds.length >= maxCoaches) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        isElite
          ? 'Maximum 2 coaches allowed per team. Please remove an existing coach first.'
          : 'Free Plan allows a maximum of 1 coach. Upgrade to the K10 Elite Plan to assign additional coaches.',
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

    const teamPlayerIds = team.playerIds || [];
    if (teamPlayerIds.length > 0) {
      const allCoaches = await CoachProfile.find({ _id: { $in: team.coachIds } }).select(
        'fullName title',
      );
      const coachNamesStr = allCoaches
        .map((c) => c.fullName || c.title)
        .filter(Boolean)
        .join(', ');
      if (coachNamesStr) {
        await PlayerProfile.updateMany(
          { _id: { $in: teamPlayerIds } },
          {
            $set: { coachesAssigned: coachNamesStr, 'coachVerification.coachName': coachNamesStr },
          },
        );
      }
    }

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

    const teamPlayerIds = team.playerIds || [];
    if (teamPlayerIds.length > 0) {
      const remainingCoaches = await CoachProfile.find({ _id: { $in: team.coachIds } }).select(
        'fullName title',
      );
      const coachNamesStr = remainingCoaches
        .map((c) => c.fullName || c.title)
        .filter(Boolean)
        .join(', ');
      await PlayerProfile.updateMany(
        { _id: { $in: teamPlayerIds } },
        { $set: { coachesAssigned: coachNamesStr, 'coachVerification.coachName': coachNamesStr } },
      );
    }

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
      const academy = await academyResolverService.resolveAcademyProfile(teamId);
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

    const academy = await AcademyProfile.findById(team.academyId);
    const currentPlan = academy?.currentPlan || 'FREE';
    const isElite = currentPlan === 'ELITE' || currentPlan === 'PREMIUM';
    const maxPlayers = isElite ? 18 : 16;

    if (currentPlayerIds.length >= maxPlayers) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        isElite
          ? 'Maximum 18 players allowed per team. Team roster is full.'
          : 'Free Plan allows a maximum of 16 players. Upgrade to the K10 Elite Plan to register additional players.',
      );
    }

    team.playerIds = [...(team.playerIds || []), new Types.ObjectId(playerId)];
    team.playersCount = team.playerIds.length;
    team.totalMembers = (team.coachesCount || 0) + (team.playersCount || 0);
    await team.save();

    const academyName = academy?.name || '';
    let coachNamesStr = '';
    if (team.coachIds && team.coachIds.length > 0) {
      const coachDocs = await CoachProfile.find({ _id: { $in: team.coachIds } }).select(
        'fullName title',
      );
      coachNamesStr = coachDocs
        .map((c) => c.fullName || c.title)
        .filter(Boolean)
        .join(', ');
    }

    const hasCurrentClub = (player.clubHistory || []).some(
      (c: any) =>
        c.isCurrent === true ||
        String(c.isCurrent).toLowerCase() === 'true' ||
        String(c.to || '')
          .trim()
          .toLowerCase() === 'present',
    );

    const updateSet: any = {
      teamId: team._id,
      academyId: team.academyId,
      ...(academyName ? { academy: academyName } : {}),
      ...(coachNamesStr
        ? { coachesAssigned: coachNamesStr, 'coachVerification.coachName': coachNamesStr }
        : {}),
    };
    if (!hasCurrentClub && academyName) {
      updateSet.currentClub = academyName;
    }

    await PlayerProfile.findByIdAndUpdate(playerId, { $set: updateSet });
    if (player.userId && academyName) {
      await User.findByIdAndUpdate(player.userId, {
        academyId: team.academyId,
        ...(!hasCurrentClub ? { currentClub: academyName } : {}),
      });
    }
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
}

export const academyTeamsService = new AcademyTeamsService();
