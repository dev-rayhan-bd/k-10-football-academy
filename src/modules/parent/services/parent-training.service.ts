import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';
import { Team } from '@/modules/academy/academy.model';
import { TrainingSession, TrainingAttendance } from '@/modules/training/training.model';
import { ParentProfile, ParentChild } from '../parent.model';

export class ParentTrainingService {
  async getChildTrainingSessions(
    userId: string,
    query: {
      childPlayerId?: string;
      date?: string;
      upcomingOnly?: string;
      pastOnly?: string;
      type?: string;
      page?: string | number;
      limit?: string | number;
    } = {},
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Number(query.limit) > 0 ? Number(query.limit) : query.page ? 10 : 20;
    const emptyMeta = {
      page,
      limit,
      total: 0,
      totalPage: 1,
    };

    const targetParentIds: any[] = [userId];
    if (Types.ObjectId.isValid(userId)) {
      const parentProfile = await ParentProfile.findOne({
        $or: [{ _id: userId }, { userId }],
      });
      if (parentProfile) {
        targetParentIds.push(parentProfile._id);
        targetParentIds.push(parentProfile.userId);
      }
    }

    const linkFilter: any = { parentId: { $in: targetParentIds } };
    if (query.childPlayerId && Types.ObjectId.isValid(query.childPlayerId)) {
      linkFilter.childPlayerId = query.childPlayerId;
    }

    const links = await ParentChild.find(linkFilter)
      .populate('childPlayerId', 'fullName position profileImage jerseyNumber')
      .lean();

    if (links.length === 0) {
      return {
        data: {
          stats: {
            attendanceRate: 0,
            attendanceRateFormatted: '0%',
            totalSessions: 0,
            present: 0,
            absent: 0,
          },
          upcomingSessions: [],
          pastSessions: [],
          total: 0,
          sessions: [],
        },
        meta: emptyMeta,
      };
    }

    const childPlayerIds = links.map((l: any) => l.childPlayerId?._id || l.childPlayerId);
    const childMap = new Map<string, any>();
    links.forEach((l: any) => {
      const p = l.childPlayerId;
      if (p?._id) childMap.set(p._id.toString(), p);
    });

    // Find teams containing these children
    const teams = await Team.find({
      playerIds: { $in: childPlayerIds },
    })
      .select('_id teamName ageGroup playerIds')
      .lean();

    const teamIds = teams.map((t) => t._id);

    // Find training sessions for these teams
    const sessionFilter: any = { teamId: { $in: teamIds } };

    if (query.date) {
      const startOfDay = new Date(query.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(query.date);
      endOfDay.setHours(23, 59, 59, 999);
      sessionFilter.sessionDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (query.upcomingOnly === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      sessionFilter.sessionDate = { $gte: today };
    } else if (query.pastOnly === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      sessionFilter.sessionDate = { $lt: today };
    }

    const sessions = await TrainingSession.find(sessionFilter)
      .populate('teamId', 'teamName ageGroup playerIds')
      .populate('coachId', 'fullName title profileImage')
      .sort({ sessionDate: 1, startTime: 1 })
      .lean();

    if (sessions.length === 0) {
      return {
        data: {
          stats: {
            attendanceRate: 0,
            attendanceRateFormatted: '0%',
            totalSessions: 0,
            present: 0,
            absent: 0,
          },
          upcomingSessions: [],
          pastSessions: [],
          total: 0,
          sessions: [],
        },
        meta: emptyMeta,
      };
    }

    const sessionIds = sessions.map((s) => s._id);

    // Fetch existing attendance records for these children across these sessions
    const attendances = await TrainingAttendance.find({
      sessionId: { $in: sessionIds },
      playerId: { $in: childPlayerIds },
    }).lean();

    const attMap = new Map<string, any>();
    attendances.forEach((a) => {
      const key = `${a.sessionId.toString()}_${a.playerId.toString()}`;
      attMap.set(key, a);
    });

    const results: any[] = [];
    const upcomingSessions: any[] = [];
    const pastSessions: any[] = [];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let presentCount = 0;
    let absentCount = 0;

    sessions.forEach((s: any) => {
      const team = (s.teamId && typeof s.teamId === 'object' ? s.teamId : {}) as any;
      const coach = (s.coachId && typeof s.coachId === 'object' ? s.coachId : {}) as any;
      const teamPlayerIdStrs = (team.playerIds || []).map((id: any) => id.toString());
      const sDate = new Date(s.sessionDate);
      const isPast = sDate < todayStart;
      const sessionCode = s.sessionCode || undefined;

      // For each child in this team
      childPlayerIds.forEach((cId: any) => {
        const cIdStr = cId.toString();
        if (teamPlayerIdStrs.includes(cIdStr)) {
          const childObj = childMap.get(cIdStr) || {};
          const att = attMap.get(`${s._id.toString()}_${cIdStr}`);

          const rsvpStatus = (att?.rsvpStatus || 'PENDING').toUpperCase();
          const coachStatus = (att?.status || att?.attendanceStatus || 'UNMARKED').toUpperCase();
          const isAttended = coachStatus === 'PRESENT' || coachStatus === 'LATE';

          if (isPast) {
            if (isAttended) presentCount++;
            else if (coachStatus === 'ABSENT') absentCount++;
          }

          const baseSession = {
            sessionId: s._id,
            ...(sessionCode ? { sessionCode } : {}),
            sessionName: s.sessionName || s.sessionTitle || 'Training Session',
            sessionTitle: s.sessionName || s.sessionTitle || 'Training Session',
            sessionDate: s.sessionDate,
            startTime: s.startTime,
            endTime: s.endTime,
            timeRange: `${s.startTime} - ${s.endTime}`,
            trainingLocation: s.trainingLocation || s.locationField || 'Academy Field A',
            location: s.trainingLocation || s.locationField || 'Academy Field A',
            sessionType: s.sessionType,
            focusArea: s.focusArea,
            team: {
              _id: team._id,
              teamName: team.teamName || '',
              ageGroup: team.ageGroup || '',
            },
            coach: {
              _id: coach._id,
              name: coach.fullName || 'Head Coach',
              avatar: coach.profileImage || '',
            },
            coachName: coach.fullName || 'Head Coach',
            child: {
              playerId: cId,
              fullName: childObj.fullName || 'Athlete',
              position: childObj.position || '',
              avatar: childObj.profileImage || '',
              jerseyNumber: childObj.jerseyNumber ? `#${childObj.jerseyNumber}` : '',
            },
            rsvpStatus,
            rsvp: {
              status: rsvpStatus,
              isConfirmed: rsvpStatus === 'CONFIRMED',
              notes: att?.notes || '',
              confirmedAt: att?.updatedAt || null,
            },
            attendanceStatus: coachStatus,
            actualAttendance: {
              status: coachStatus,
              isAttended,
              markedAt: att?.signInTime || null,
            },
          };

          results.push(baseSession);

          if (isPast) {
            pastSessions.push(baseSession);
          } else {
            upcomingSessions.push(baseSession);
          }
        }
      });
    });

    const totalPastMarked = presentCount + absentCount;
    const attendanceRate =
      totalPastMarked > 0
        ? Math.round((presentCount / totalPastMarked) * 100)
        : pastSessions.length > 0
          ? Math.round((presentCount / pastSessions.length) * 100)
          : results.length > 0
            ? 100
            : 0;

    const total =
      query.upcomingOnly === 'true'
        ? upcomingSessions.length
        : query.pastOnly === 'true'
          ? pastSessions.length
          : results.length;

    const totalPage = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;

    const paginatedUpcoming =
      query.upcomingOnly === 'true' || query.page || query.limit
        ? upcomingSessions.slice(startIndex, startIndex + limit)
        : upcomingSessions;

    const paginatedPast =
      query.pastOnly === 'true' || query.page || query.limit
        ? pastSessions.slice(startIndex, startIndex + limit)
        : pastSessions;

    const paginatedSessions = results.slice(startIndex, startIndex + limit);

    const meta = {
      page,
      limit,
      total,
      totalPage,
    };

    return {
      data: {
        stats: {
          attendanceRate,
          attendanceRateFormatted: `${attendanceRate}%`,
          totalSessions: pastSessions.length || results.length,
          present: presentCount,
          absent: absentCount,
        },
        upcomingSessions: query.pastOnly === 'true' ? [] : paginatedUpcoming,
        pastSessions: query.upcomingOnly === 'true' ? [] : paginatedPast,
        total,
        sessions: paginatedSessions,
      },
      meta,
    };
  }

  async submitParentRsvp(
    userId: string,
    sessionId: string,
    payload: {
      childPlayerId?: string;
      rsvpStatus: string;
      notes?: string;
    },
  ) {
    const targetParentIds: any[] = [userId];
    if (Types.ObjectId.isValid(userId)) {
      const parentProfile = await ParentProfile.findOne({
        $or: [{ _id: userId }, { userId }],
      });
      if (parentProfile) {
        targetParentIds.push(parentProfile._id);
        targetParentIds.push(parentProfile.userId);
      }
    }

    let targetChildPlayerId = payload.childPlayerId;
    if (!targetChildPlayerId) {
      const link = await ParentChild.findOne({ parentId: { $in: targetParentIds } });
      if (link) {
        targetChildPlayerId = link.childPlayerId.toString();
      }
    }
    if (!targetChildPlayerId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Child player ID is required');
    }

    // Authorization check: Verify parent is linked to this child
    const linkExists = await ParentChild.findOne({
      parentId: { $in: targetParentIds },
      childPlayerId: targetChildPlayerId,
    });
    if (!linkExists) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'You are not authorized to manage this child athlete',
      );
    }

    const session = await TrainingSession.findById(sessionId);
    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Training session not found');
    }

    const norm = String(payload.rsvpStatus || 'CONFIRMED').toUpperCase();
    const rsvpStatus = ['CONFIRMED', 'YES', 'CONFIRM'].includes(norm)
      ? 'CONFIRMED'
      : ['DECLINED', 'NO', 'DECLINE'].includes(norm)
        ? 'DECLINED'
        : 'PENDING';

    const attendance = await TrainingAttendance.findOneAndUpdate(
      {
        sessionId: session._id,
        $or: [{ playerId: targetChildPlayerId }, { childPlayerId: targetChildPlayerId }],
      },
      {
        $set: {
          sessionId: session._id,
          playerId: targetChildPlayerId,
          childPlayerId: targetChildPlayerId,
          rsvpStatus,
          notes: payload.notes || '',
        },
      },
      { upsert: true, new: true },
    );

    return {
      message:
        rsvpStatus === 'CONFIRMED'
          ? 'Attendance confirmed: child will attend this session'
          : rsvpStatus === 'DECLINED'
            ? 'Attendance declined: child will not attend this session'
            : 'Attendance status updated',
      sessionId: session._id,
      sessionName: session.sessionName || session.sessionTitle,
      sessionDate: session.sessionDate,
      childPlayerId: targetChildPlayerId,
      rsvpStatus: attendance.rsvpStatus,
      notes: attendance.notes || '',
    };
  }
}

export const parentTrainingService = new ParentTrainingService();
