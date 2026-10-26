import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import { CoachProfile } from '../coach.model';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { Team } from '@/modules/academy/academy.model';
import { TrainingSession, TrainingAttendance } from '@/modules/training/training.model';
import { AttendanceStatus } from '@/modules/training/training.interface';

export class CoachSquadService {
  async getMyTeamsSquad(userId: string, query: Record<string, unknown> = {}) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);

    // Determine target academy / club
    const targetAcademyId = (query.academyId as string) || coach.academyId;
    const targetClub = (query.clubName as string) || coach.currentClub;

    // Resolve coach's teams
    const coachTeams = await Team.find({
      $or: [{ coachIds: coach._id }, ...(coach.academyId ? [{ academyId: coach.academyId }] : [])],
    }).lean();
    const coachTeamIds = coachTeams.map((t) => t._id);
    const teamPlayerIds = coachTeams.flatMap((t) => t.playerIds || []);

    // Filter condition for players
    const playerFilter: any = {};
    const hasExplicitEmail = Boolean(query.email && typeof query.email === 'string');
    const isGlobalScope = query.scope === 'all' || query.all === 'true';

    // If not searching for a specific email globally, scope to coach's academy/club/teams
    if (!hasExplicitEmail && !isGlobalScope) {
      const orScopes: any[] = [];
      if (teamPlayerIds.length > 0) {
        orScopes.push({ _id: { $in: teamPlayerIds } });
      }
      if (targetAcademyId) {
        orScopes.push({ academyId: targetAcademyId });
      }
      if (targetClub) {
        orScopes.push({ currentClub: targetClub });
      }
      if (orScopes.length > 0) {
        playerFilter.$or = orScopes;
      } else {
        // If coach is independent or unverified, look for players supervised by this coach
        playerFilter.$or = [
          { verifyingCoachId: coach.userId },
          { 'coachVerification.coachName': coach.fullName },
        ];
      }
    }

    // 1. Direct Email Filter (?email=...)
    if (hasExplicitEmail) {
      const emailRegex = new RegExp(String(query.email).trim(), 'i');
      const matchedUserIds = await UserModel.find({ email: emailRegex }).distinct('_id');
      playerFilter.userId = { $in: matchedUserIds };
    }

    // 2. Search term filter (?searchTerm=...) covering email, name, position, country
    if (query.searchTerm && typeof query.searchTerm === 'string') {
      const term = query.searchTerm.trim();
      const searchRegex = new RegExp(term, 'i');
      const matchedUserIds = await UserModel.find({
        $or: [{ email: searchRegex }, { name: searchRegex }],
      }).distinct('_id');

      const orClauses: any[] = [
        { fullName: searchRegex },
        { position: searchRegex },
        { country: searchRegex },
      ];

      if (matchedUserIds.length > 0) {
        orClauses.push({ userId: { $in: matchedUserIds } });
      }

      playerFilter.$and = playerFilter.$and || [];
      playerFilter.$and.push({ $or: orClauses });
    }

    // 3. Status filter (?status=ACTIVE or ?status=INJURED)
    if (query.status && typeof query.status === 'string' && query.status !== 'ALL') {
      playerFilter.fitnessStatus = query.status.toUpperCase();
    }

    // Resolve date & training sessions for attendance tracking
    const selectedDateStr =
      typeof query.date === 'string' && query.date.trim()
        ? query.date.trim()
        : new Date().toISOString().split('T')[0];

    const startOfDay = new Date(selectedDateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const sessionOr: any[] = [{ coachId: coach._id }];
    if (coach.academyId) sessionOr.push({ academyId: coach.academyId });
    if (coachTeamIds.length > 0) sessionOr.push({ teamId: { $in: coachTeamIds } });

    const availableSessions = await TrainingSession.find({
      sessionDate: { $gte: startOfDay, $lte: endOfDay },
      $or: sessionOr,
    })
      .populate('teamId', 'teamName ageGroup')
      .sort({ startTime: 1 })
      .lean();

    let activeSession: any = null;
    if (
      query.sessionId &&
      typeof query.sessionId === 'string' &&
      Types.ObjectId.isValid(query.sessionId)
    ) {
      activeSession =
        availableSessions.find((s) => s._id.toString() === query.sessionId) ||
        (await TrainingSession.findById(query.sessionId)
          .populate('teamId', 'teamName ageGroup')
          .lean());
    } else if (availableSessions.length > 0) {
      activeSession = availableSessions[0];
    }

    // Lookup existing attendance records for the active session
    const attendanceMap = new Map<string, any>();
    if (activeSession) {
      const attendances = await TrainingAttendance.find({ sessionId: activeSession._id }).lean();
      attendances.forEach((a) => {
        const pid = a.playerId?.toString() || a.childPlayerId?.toString();
        if (pid) attendanceMap.set(pid, a);
      });
    }

    const allMatchingPlayers = await PlayerProfile.find(playerFilter)
      .populate('userId', 'email name avatar')
      .select(
        'fullName position overallRating profileImage fitnessStatus transferStatus currentClub country age userId jerseyNumber',
      )
      .lean();

    const totalCount = allMatchingPlayers.length;
    const totalPage = Math.ceil(totalCount / limit) || 1;

    const sessionInfo = {
      selectedDate: selectedDateStr,
      activeSession: activeSession
        ? {
            _id: activeSession._id,
            id: activeSession._id,
            sessionName:
              activeSession.sessionName || activeSession.sessionTitle || 'Daily Training Session',
            sessionDate: activeSession.sessionDate,
            startTime: activeSession.startTime,
            endTime: activeSession.endTime,
            timeRange: `${activeSession.startTime} - ${activeSession.endTime}`,
            trainingLocation:
              activeSession.trainingLocation || activeSession.locationField || 'Main Field',
            sessionType: activeSession.sessionType || 'Technical',
            focusArea: activeSession.focusArea || 'Team Practice',
            presentCount: activeSession.presentCount || 0,
            lateCount: activeSession.lateCount || 0,
            absentCount: activeSession.absentCount || 0,
            unmarkedCount: activeSession.unmarkedCount || 0,
            totalPlayers: activeSession.totalPlayers || totalCount,
            attendancePercentage: activeSession.attendancePercentage || 0,
            isAttendanceCompleted: Boolean(activeSession.isAttendanceCompleted),
          }
        : null,
      availableSessions: availableSessions.map((s: any) => ({
        _id: s._id,
        id: s._id,
        sessionName: s.sessionName || s.sessionTitle || 'Training Session',
        sessionDate: s.sessionDate,
        startTime: s.startTime,
        endTime: s.endTime,
        timeRange: `${s.startTime} - ${s.endTime}`,
        trainingLocation: s.trainingLocation || s.locationField || 'Main Field',
        teamName: (s.teamId as any)?.teamName || '',
        presentCount: s.presentCount || 0,
        totalPlayers: s.totalPlayers || 0,
      })),
    };

    if (totalCount === 0) {
      return {
        meta: {
          page,
          limit,
          total: 0,
          totalPage: 1,
        },
        data: {
          summary: {
            totalPlayers: 0,
            avgRating: 0,
            active: 0,
            injured: 0,
          },
          academy: {
            id: coach.academyId || null,
            name: coach.currentClub || '',
            logo: coach.clubLogo || '',
          },
          sessionInfo,
          players: [],
        },
      };
    }

    const playerIds = allMatchingPlayers.map((p) => p._id);

    // Aggregate match stats for all matching players
    const matchStatsAgg = await MatchRecord.aggregate([
      { $match: { playerId: { $in: playerIds } } },
      {
        $group: {
          _id: '$playerId',
          matches: { $sum: 1 },
          goals: {
            $sum: {
              $ifNull: ['$goals', { $ifNull: ['$stats.goalScored', 0] }],
            },
          },
          assists: {
            $sum: {
              $ifNull: ['$assists', { $ifNull: ['$stats.assists', 0] }],
            },
          },
          avgMatchRating: { $avg: '$playerRating' },
        },
      },
    ]);

    const statsMap = new Map<string, any>();
    matchStatsAgg.forEach((s) => {
      statsMap.set(s._id.toString(), s);
    });

    let totalRatingSum = 0;
    let activeCount = 0;
    let injuredCount = 0;

    const formattedPlayers = allMatchingPlayers.map((p: any) => {
      const st = statsMap.get(p._id.toString()) || { matches: 0, goals: 0, assists: 0 };

      // Compute display rating (e.g. 9.2 or 8.8)
      let rating = 0;
      if (p.overallRating) {
        rating =
          p.overallRating > 10 ? Math.round((p.overallRating / 10) * 10) / 10 : p.overallRating;
      } else if (st.avgMatchRating) {
        rating = Math.round(st.avgMatchRating * 10) / 10;
      }
      totalRatingSum += rating;

      const fitnessStatus = (p.fitnessStatus ||
        (p.transferStatus?.status === 'Injured' ? 'INJURED' : 'ACTIVE')) as 'ACTIVE' | 'INJURED';
      if (fitnessStatus === 'INJURED') {
        injuredCount++;
      } else {
        activeCount++;
      }

      // Resolve player attendance for the active session
      const att = activeSession ? attendanceMap.get(p._id.toString()) : null;
      const attStatus = (att?.status || att?.attendanceStatus || 'UNMARKED').toUpperCase();
      const isIn = attStatus === 'PRESENT' || attStatus === 'LATE';

      return {
        _id: p._id,
        id: p._id,
        name: p.fullName,
        email: (p.userId as any)?.email || '',
        position: p.position || 'FORWARD',
        avatar: p.profileImage || (p.userId as any)?.avatar || '',
        jerseyNumber: p.jerseyNumber ? `#${p.jerseyNumber}` : '',
        rating,
        matches: st.matches || 0,
        goals: st.goals || 0,
        assists: st.assists || 0,
        status: fitnessStatus,
        country: p.country,
        age: p.age,
        attendance: {
          sessionId: activeSession?._id || null,
          attendanceId: att?._id || null,
          status: attStatus,
          isAttended: isIn,
          isIn,
          markedAt:
            att?.signInTime ||
            (att?.updatedAt
              ? new Date(att.updatedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })
              : null),
          rsvpStatus: att?.rsvpStatus || 'PENDING',
          notes: att?.notes || '',
        },
      };
    });

    const avgRating =
      formattedPlayers.length > 0
        ? Math.round((totalRatingSum / formattedPlayers.length) * 10) / 10
        : 0;

    // Apply pagination slice
    const skip = (page - 1) * limit;
    const paginatedPlayers = formattedPlayers.slice(skip, skip + limit);

    return {
      meta: {
        page,
        limit,
        total: totalCount,
        totalPage,
      },
      data: {
        summary: {
          totalPlayers: totalCount,
          avgRating,
          active: activeCount,
          injured: injuredCount,
        },
        academy: {
          id: coach.academyId || null,
          name: coach.currentClub || '',
          logo: coach.clubLogo || '',
        },
        sessionInfo,
        players: paginatedPlayers,
      },
    };
  }

  async tickPlayerAttendance(
    userId: string,
    payload: {
      playerId: string;
      sessionId?: string;
      teamId?: string;
      date?: string;
      isIn?: boolean;
      status?: 'PRESENT' | 'LATE' | 'ABSENT' | 'UNMARKED' | 'EXCUSED';
      time?: string;
      notes?: string;
    },
  ) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const player = await PlayerProfile.findById(payload.playerId);
    if (!player) {
      throw new AppError(404, 'Player not found');
    }

    let session: any;
    const dateStr = payload.date || new Date().toISOString().split('T')[0];
    const sessionDate = new Date(dateStr);

    if (payload.sessionId && Types.ObjectId.isValid(payload.sessionId)) {
      session = await TrainingSession.findById(payload.sessionId);
      if (!session) {
        throw new AppError(404, 'Specified training session not found');
      }
    } else {
      // Find session for this date & coach/team
      const startOfDay = new Date(sessionDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(sessionDate);
      endOfDay.setHours(23, 59, 59, 999);

      const coachTeams = await Team.find({
        $or: [
          { coachIds: coach._id },
          ...(coach.academyId ? [{ academyId: coach.academyId }] : []),
        ],
      }).lean();
      const coachTeamIds = coachTeams.map((t) => t._id);

      const sessionOr: any[] = [{ coachId: coach._id }];
      if (coach.academyId) sessionOr.push({ academyId: coach.academyId });
      if (coachTeamIds.length > 0) sessionOr.push({ teamId: { $in: coachTeamIds } });
      if (payload.teamId && Types.ObjectId.isValid(payload.teamId)) {
        sessionOr.unshift({ teamId: payload.teamId });
      }

      session = await TrainingSession.findOne({
        sessionDate: { $gte: startOfDay, $lte: endOfDay },
        $or: sessionOr,
      }).sort({ createdAt: -1 });

      // If no session exists yet for today, auto-create one so coach's tick is zero-friction!
      if (!session) {
        let targetTeamId: any = payload.teamId;
        if (!targetTeamId && coachTeamIds.length > 0) targetTeamId = coachTeamIds[0];
        if (!targetTeamId) {
          const teamWithPlayer = await Team.findOne({ playerIds: player._id });
          if (teamWithPlayer) targetTeamId = teamWithPlayer._id;
        }

        const academyId = coach.academyId || player.academyId;
        if (!targetTeamId) {
          let defaultTeam = await Team.findOne({ academyId: academyId || coach._id });
          if (!defaultTeam && academyId) {
            defaultTeam = await Team.create({
              academyId,
              teamName: coach.currentClub ? `${coach.currentClub} Squad` : 'Academy Squad',
              ageGroup: 'U-17',
              coachIds: [coach._id],
              playerIds: [player._id],
            });
          }
          targetTeamId = defaultTeam?._id;
        }

        session = await TrainingSession.create({
          academyId: academyId || coach._id,
          teamId: targetTeamId,
          coachId: coach._id,
          sessionName: `${coach.fullName ? coach.fullName + "'s " : ''}Daily Training Session`,
          sessionTitle: 'Daily Training Session',
          sessionDate,
          startTime: '09:00 AM',
          endTime: '11:00 AM',
          trainingLocation: coach.currentClub ? `${coach.currentClub} Ground` : 'Main Pitch',
          locationField: 'Main Pitch',
          sessionType: 'Technical',
          focusArea: 'Team Practice & Fitness',
          totalPlayers: 1,
          unmarkedCount: 1,
        });
      }
    }

    // Determine status & In/Out (handles PRESENT, LATE, ABSENT, UNMARKED)
    const nowTimeStr =
      payload.time ||
      new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

    let status: AttendanceStatus;
    let isIn: boolean;

    if (payload.status) {
      status = payload.status;
      isIn = status === 'PRESENT' || status === 'LATE';
    } else if (payload.isIn !== undefined) {
      isIn = payload.isIn;
      status = isIn ? 'PRESENT' : 'ABSENT';
    } else {
      status = 'PRESENT';
      isIn = true;
    }

    const updateData: any = {
      sessionId: session._id,
      playerId: player._id,
      childPlayerId: player._id,
      status,
      attendanceStatus: status,
      markedBy: coach.userId,
    };
    if (payload.notes) updateData.notes = payload.notes;

    if (status === 'PRESENT' || status === 'LATE') {
      updateData.signInTime = nowTimeStr;
    } else if (status === 'ABSENT') {
      updateData.signOutTime = nowTimeStr;
    }

    await TrainingAttendance.findOneAndUpdate(
      { sessionId: session._id, $or: [{ playerId: player._id }, { childPlayerId: player._id }] },
      { $set: updateData },
      { upsert: true, new: true },
    );

    // Recalculate session statistics
    const allSessionAttendances = await TrainingAttendance.find({ sessionId: session._id }).lean();
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;

    allSessionAttendances.forEach((a) => {
      const st = (a.status || a.attendanceStatus || 'UNMARKED').toUpperCase();
      if (st === 'PRESENT') presentCount++;
      else if (st === 'LATE') lateCount++;
      else if (st === 'ABSENT') absentCount++;
      else unmarkedCount++;
    });

    const total = allSessionAttendances.length;
    session.presentCount = presentCount;
    session.lateCount = lateCount;
    session.absentCount = absentCount;
    session.unmarkedCount = unmarkedCount;
    session.totalPlayers = Math.max(total, session.totalPlayers || 0);
    session.attendancePercentage =
      total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 0;
    session.isAttendanceCompleted = unmarkedCount === 0 && total > 0;
    await session.save();

    const statusMessages: Record<string, string> = {
      PRESENT: 'Player marked present successfully',
      LATE: 'Player marked late successfully',
      ABSENT: 'Player marked absent successfully',
      UNMARKED: 'Player attendance unmarked',
    };

    return {
      message: statusMessages[status] || 'Player attendance updated successfully',
      attendance: {
        sessionId: session._id,
        sessionName: session.sessionName || session.sessionTitle,
        sessionDate: session.sessionDate,
        playerId: player._id,
        playerName: player.fullName,
        position: player.position,
        jerseyNumber: (player as any).jerseyNumber || (player as any).kitNumber || '',
        avatar: player.profileImage,
        status,
        isAttended: isIn,
        isIn,
        markedAt: nowTimeStr,
        markedBy: coach.fullName || 'Coach',
        notes: payload.notes || '',
      },
      sessionStats: {
        presentCount,
        lateCount,
        absentCount,
        unmarkedCount,
        totalPlayers: session.totalPlayers,
        attendancePercentage: session.attendancePercentage,
        isAttendanceCompleted: session.isAttendanceCompleted,
      },
    };
  }

  async bulkUpdateCoachAttendance(
    userId: string,
    payload: {
      sessionId?: string;
      teamId?: string;
      date?: string;
      markAll?: 'PRESENT' | 'ABSENT' | 'CLEAR' | 'UNMARKED';
      attendances?: Array<{
        playerId: string;
        isIn?: boolean;
        status?: 'PRESENT' | 'LATE' | 'ABSENT' | 'UNMARKED' | 'EXCUSED';
        notes?: string;
        time?: string;
      }>;
    },
  ) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    let session: any = null;
    const dateStr = payload.date || new Date().toISOString().split('T')[0];
    const sessionDate = new Date(dateStr);

    if (payload.sessionId && Types.ObjectId.isValid(payload.sessionId)) {
      session = await TrainingSession.findById(payload.sessionId);
    }
    if (!session) {
      const startOfDay = new Date(sessionDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(sessionDate);
      endOfDay.setHours(23, 59, 59, 999);

      session = await TrainingSession.findOne({
        sessionDate: { $gte: startOfDay, $lte: endOfDay },
        $or: [{ coachId: coach._id }, ...(coach.academyId ? [{ academyId: coach.academyId }] : [])],
      }).sort({ createdAt: -1 });
    }

    if (!session) {
      throw new AppError(404, 'Training session not found for attendance update');
    }

    const nowTimeStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    // 1. Mark All Present / Absent
    if (payload.markAll) {
      const targetStatus = payload.markAll === 'PRESENT' ? 'PRESENT' : 'ABSENT';
      await TrainingAttendance.updateMany(
        { sessionId: session._id },
        {
          $set: {
            status: targetStatus,
            attendanceStatus: targetStatus,
            markedBy: coach.userId,
            ...(targetStatus === 'PRESENT'
              ? { signInTime: nowTimeStr }
              : { signOutTime: nowTimeStr }),
          },
        },
      );
    }

    // 2. Process list
    if (Array.isArray(payload.attendances)) {
      for (const item of payload.attendances) {
        if (!item.playerId) continue;
        let st: AttendanceStatus = item.status || 'PRESENT';
        let isIn = item.isIn;
        if (isIn !== undefined) {
          st = isIn ? 'PRESENT' : 'ABSENT';
        } else {
          isIn = st === 'PRESENT' || st === 'LATE';
        }

        const updateData: any = {
          sessionId: session._id,
          playerId: item.playerId,
          childPlayerId: item.playerId,
          status: st,
          attendanceStatus: st,
          markedBy: coach.userId,
        };
        if (item.notes) updateData.notes = item.notes;
        if (isIn) updateData.signInTime = item.time || nowTimeStr;
        else updateData.signOutTime = item.time || nowTimeStr;

        await TrainingAttendance.findOneAndUpdate(
          {
            sessionId: session._id,
            $or: [{ playerId: item.playerId }, { childPlayerId: item.playerId }],
          },
          { $set: updateData },
          { upsert: true, new: true },
        );
      }
    }

    // Recalculate
    const allSessionAttendances = await TrainingAttendance.find({ sessionId: session._id }).lean();
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;

    allSessionAttendances.forEach((a) => {
      const st = (a.status || a.attendanceStatus || 'UNMARKED').toUpperCase();
      if (st === 'PRESENT') presentCount++;
      else if (st === 'LATE') lateCount++;
      else if (st === 'ABSENT') absentCount++;
      else unmarkedCount++;
    });

    const total = allSessionAttendances.length;
    session.presentCount = presentCount;
    session.lateCount = lateCount;
    session.absentCount = absentCount;
    session.unmarkedCount = unmarkedCount;
    session.totalPlayers = Math.max(total, session.totalPlayers || 0);
    session.attendancePercentage =
      total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 0;
    session.isAttendanceCompleted = unmarkedCount === 0 && total > 0;
    await session.save();

    return {
      message: 'Bulk attendance updated successfully',
      sessionId: session._id,
      sessionName: session.sessionName || session.sessionTitle,
      stats: {
        presentCount,
        lateCount,
        absentCount,
        unmarkedCount,
        totalPlayers: session.totalPlayers,
        attendancePercentage: session.attendancePercentage,
        isAttendanceCompleted: session.isAttendanceCompleted,
      },
    };
  }

  async getCoachTrainingSessions(userId: string, query: Record<string, unknown> = {}) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const filter: any = {};
    const coachTeams = await Team.find({
      $or: [{ coachIds: coach._id }, ...(coach.academyId ? [{ academyId: coach.academyId }] : [])],
    }).lean();
    const coachTeamIds = coachTeams.map((t) => t._id);

    const orClauses: any[] = [{ coachId: coach._id }];
    if (coach.academyId) orClauses.push({ academyId: coach.academyId });
    if (coachTeamIds.length > 0) orClauses.push({ teamId: { $in: coachTeamIds } });
    filter.$or = orClauses;

    // Filter by single date: ?date=YYYY-MM-DD
    if (query.date && typeof query.date === 'string') {
      const startOfDay = new Date(query.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(query.date);
      endOfDay.setHours(23, 59, 59, 999);
      filter.sessionDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (query.month && typeof query.month === 'string') {
      // Filter by month: ?month=YYYY-MM
      const [year, month] = query.month.split('-').map(Number);
      if (year && month) {
        const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
        filter.sessionDate = { $gte: startOfMonth, $lte: endOfMonth };
      }
    }

    if (query.teamId && Types.ObjectId.isValid(query.teamId as string)) {
      filter.teamId = query.teamId;
    }

    const sessions = await TrainingSession.find(filter)
      .populate('teamId', 'teamName ageGroup')
      .sort({ sessionDate: -1, startTime: 1 })
      .lean();

    return {
      total: sessions.length,
      sessions: sessions.map((s: any) => ({
        _id: s._id,
        id: s._id,
        sessionName: s.sessionName || s.sessionTitle || 'Training Session',
        sessionDate: s.sessionDate,
        startTime: s.startTime,
        endTime: s.endTime,
        timeRange: `${s.startTime} - ${s.endTime}`,
        trainingLocation: s.trainingLocation || s.locationField || 'Field 1',
        sessionType: s.sessionType,
        focusArea: s.focusArea,
        teamName: (s.teamId as any)?.teamName || '',
        teamAgeGroup: (s.teamId as any)?.ageGroup || '',
        presentCount: s.presentCount || 0,
        lateCount: s.lateCount || 0,
        absentCount: s.absentCount || 0,
        totalPlayers: s.totalPlayers || 0,
        attendancePercentage: s.attendancePercentage || 0,
        isAttendanceCompleted: Boolean(s.isAttendanceCompleted),
      })),
    };
  }

  async updatePlayerFitnessStatus(userId: string, playerId: string, status: 'ACTIVE' | 'INJURED') {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(404, 'Player not found');
    }

    player.fitnessStatus = status;
    if (player.transferStatus) {
      player.transferStatus.status = status === 'INJURED' ? 'Injured' : 'Active';
    }
    await player.save();

    return {
      playerId: player._id,
      status: player.fitnessStatus,
    };
  }
}

export const coachSquadService = new CoachSquadService();
