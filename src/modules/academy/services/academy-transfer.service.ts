import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { AcademyProfile, Team, TransferRequest } from '../academy.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { User } from '@/modules/user/user.model';
import { NotificationService } from '@/modules/notification/notification.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { academyResolverService } from './academy-resolver.service';

const notificationService = new NotificationService();

export class AcademyTransferService {
  async getTransferRequestsDashboard(user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

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
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

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
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

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
    const academy = await academyResolverService.resolveUserAcademy(user);

    const currentPlan = academy.currentPlan || 'FREE';
    const isElite = currentPlan === 'ELITE' || currentPlan === 'PREMIUM';
    if (!isElite && user.role !== 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Upgrade to the K10 Elite Plan to unlock this feature. The Elite Plan gives your Academy access to advanced team management, tournament and event creation, online store management, game report commissions, player profile transfers, and additional exclusive benefits.',
      );
    }

    // 1. Resolve athlete/player: resolve directly by playerId (or fallback if userId)
    let player = null;
    if (payload.playerId && Types.ObjectId.isValid(payload.playerId)) {
      player = await PlayerProfile.findById(payload.playerId);
      if (!player) {
        player = await PlayerProfile.findOne({ userId: payload.playerId });
      }
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
      throw new AppError(StatusCodes.NOT_FOUND, 'Athlete not found by the specified ID');
    }

    // Resolve athlete name directly from PlayerProfile (or linked User if needed)
    let athleteFullName = player.fullName;
    if (!athleteFullName && player.userId) {
      const playerUser = await User.findById(player.userId);
      athleteFullName = playerUser?.name || 'Athlete';
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
        message: `${requesterName} from ${academy.name} has submitted a transfer request for athlete ${athleteFullName}.`,
        type: 'TRANSFER_REQUEST_RECEIVED',
        data: { transferRequestId: transfer._id, playerId: player._id },
      });
    }

    const populatedTransfer = await TransferRequest.findById(transfer._id)
      .populate('playerId', 'fullName position profileImage overallRating age country')
      .populate('fromAcademyId', 'name logo city country')
      .populate('toAcademyId', 'name logo city country')
      .populate('fromTeamId', 'teamName ageGroup')
      .populate('toTeamId', 'teamName ageGroup');

    return {
      message: 'Transfer request submitted successfully',
      transfer: populatedTransfer || transfer,
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

    const currentAcademy = await academyResolverService.resolveUserAcademy(user);

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
}

export const academyTransferService = new AcademyTransferService();
