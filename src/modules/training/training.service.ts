import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { TrainingSession, TrainingAttendance } from './training.model';
import { AcademyProfile, Team, AcademyCoach } from '@/modules/academy/academy.model';
import { CoachProfile } from '@/modules/coach/coach.model';

export class TrainingService {
  async resolveUserAcademy(user: any, academyIdentifier?: string) {
    if (academyIdentifier && Types.ObjectId.isValid(academyIdentifier)) {
      const acad = await AcademyProfile.findById(academyIdentifier);
      if (acad) return acad;
    }
    const userId = user?.userId || user?.id || user?._id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Authentication required');
    }
    let academy = await AcademyProfile.findOne({ userId });
    if (!academy) {
      const coach = await CoachProfile.findOne({ userId });
      if (coach?.academyId) {
        academy = await AcademyProfile.findById(coach.academyId);
      }
    }
    if (!academy && Types.ObjectId.isValid(userId)) {
      academy = await AcademyProfile.findById(userId);
    }
    if (!academy) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Academy profile not found for this user account');
    }
    return academy;
  }

  // ==========================================
  // HELPER: RESOLVE ACADEMY COACHES (ALL SOURCES)
  // ==========================================
  async getAcademyCoachesList(academyId: Types.ObjectId, currentUserId?: string) {
    // 1. Direct CoachProfiles with academyId
    const directCoaches = await CoachProfile.find({ academyId })
      .populate('userId', 'name email avatar phone')
      .lean();

    // 2. Affiliated coaches via AcademyCoach
    const affiliations = await AcademyCoach.find({
      academyId,
      status: { $ne: 'REJECTED' },
    })
      .populate({
        path: 'coachId',
        select: 'fullName title profileImage licenseStatus yearsExperience phone email coachType',
        populate: { path: 'userId', select: 'name email avatar phone' },
      })
      .populate('coachUserId', 'name email avatar phone')
      .lean();

    // 3. Coaches assigned to teams in this academy
    const teamCoachIds = await Team.find({ academyId }).distinct('coachIds');
    let teamCoaches: any[] = [];
    if (teamCoachIds.length > 0) {
      teamCoaches = await CoachProfile.find({ _id: { $in: teamCoachIds } })
        .populate('userId', 'name email avatar phone')
        .lean();
    }

    // 4. If current logged-in user is a coach for this academy
    let currentUserCoach: any = null;
    if (currentUserId && Types.ObjectId.isValid(currentUserId)) {
      currentUserCoach = await CoachProfile.findOne({
        $or: [{ userId: currentUserId }, { _id: currentUserId }],
      })
        .populate('userId', 'name email avatar phone')
        .lean();
    }

    // Merge and deduplicate by coach profile _id
    const coachMap = new Map<string, any>();

    const addCoach = (c: any, defaultTitle = 'Head Coach', fallbackUser?: any) => {
      if (!c) return;
      const cIdStr = (c._id || c.id)?.toString();
      if (!cIdStr || coachMap.has(cIdStr)) return;

      const u = (c.userId && typeof c.userId === 'object' ? c.userId : fallbackUser || {}) as any;
      const fullName = c.fullName || u.name || 'Coach';
      const title = c.title || c.coachType || defaultTitle;
      const profileImage = c.profileImage || u.avatar || '';
      const email = u.email || c.email || '';
      const phone = c.phone || u.phone || '';

      coachMap.set(cIdStr, {
        _id: c._id,
        id: c._id,
        coachId: c._id,
        fullName,
        title,
        label: `${fullName} - ${title}`,
        displayName: `${fullName} (${title})`,
        profileImage,
        email,
        phone,
      });
    };

    directCoaches.forEach((c) => addCoach(c, 'Head Coach'));
    affiliations.forEach((aff: any) => {
      if (aff.coachId && typeof aff.coachId === 'object') {
        addCoach(aff.coachId, aff.role || 'Coach', aff.coachUserId);
      }
    });
    teamCoaches.forEach((c) => addCoach(c, 'Team Coach'));
    if (currentUserCoach) addCoach(currentUserCoach, 'Coach');

    return Array.from(coachMap.values());
  }

  // ==========================================
  // HELPER: RESOLVE ACADEMY TEAMS
  // ==========================================
  async getAcademyTeamsList(academyId: Types.ObjectId) {
    const teams = await Team.find({ academyId, status: 'ACTIVE' })
      .select('teamName ageGroup playerIds coachIds')
      .sort({ teamName: 1 })
      .lean();

    return teams.map((t) => ({
      _id: t._id,
      id: t._id,
      teamId: t._id,
      teamName: t.teamName,
      ageGroup: t.ageGroup,
      label: `${t.teamName} (${t.ageGroup})`,
      displayName: `${t.teamName} (${t.ageGroup})`,
      playersCount: (t.playerIds || []).length,
      coachesCount: (t.coachIds || []).length,
    }));
  }

  // ==========================================
  // DEDICATED TEAMS DROPDOWN ENDPOINT
  // ==========================================
  async getTeamsDropdown(user: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);
    return this.getAcademyTeamsList(academy._id);
  }

  // ==========================================
  // DEDICATED COACHES DROPDOWN ENDPOINT
  // ==========================================
  async getCoachesDropdown(user: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);
    const userId = user?.userId || user?.id || user?._id;
    return this.getAcademyCoachesList(academy._id, userId);
  }

  // ==========================================
  // FORM METADATA & DROPDOWNS (ALL-IN-ONE)
  // ==========================================
  async getFormMeta(user: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);
    const userId = user?.userId || user?.id || user?._id;

    const formattedTeams = await this.getAcademyTeamsList(academy._id);
    const formattedCoaches = await this.getAcademyCoachesList(academy._id, userId);

    // Preset Options for dropdowns matching UI
    const sessionTypes = [
      'Tactical',
      'Technical',
      'Physical',
      'Match Simulation',
      'Goalkeeper',
      'Set Pieces',
      'Recovery',
      'Speed & Agility',
    ];

    const focusAreas = [
      'Set Pieces & Dead Balls',
      'Goalkeeper Session',
      'Tactical Play & Formation',
      'Ball Control & Dribbling',
      'Passing & Movement',
      'Finishing & Shooting',
      'Defensive Shape',
      'Endurance & Stamina',
      'Pressing & Counter-Pressing',
      'Crossing & Heading',
    ];

    const locations = [
      'Main Field A',
      'Main Field B',
      'Indoor Pitch 1',
      'Indoor Pitch 2',
      'Gym & Fitness Center',
      'Practice Ground 1',
      'Practice Ground 2',
      'Turf Ground North',
    ];

    return {
      academy: {
        _id: academy._id,
        name: academy.name,
      },
      teams: formattedTeams,
      coaches: formattedCoaches,
      sessionTypes,
      focusAreas,
      locations,
    };
  }

  // ==========================================
  // CREATE TRAINING SESSION
  // ==========================================
  async createSession(user: any, payload: any, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    const team = await Team.findById(payload.teamId);
    if (!team) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Selected team not found');
    }

    const sessionName = (payload.sessionName || payload.sessionTitle || '').trim();
    if (!sessionName) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Session name is required');
    }

    // Resolve coach: if provided use it, otherwise default to team's first coach or current user coach
    let coachId = payload.coachId;
    if (!coachId && team.coachIds && team.coachIds.length > 0) {
      coachId = team.coachIds[0];
    }
    if (!coachId) {
      const coach = await CoachProfile.findOne({ userId: user.userId || user._id });
      if (coach) coachId = coach._id;
    }

    const trainingLocation = (
      payload.trainingLocation ||
      payload.locationField ||
      'Main Field A'
    ).trim();
    const sessionType = (payload.sessionType || 'Technical').trim();
    const focusArea = (payload.focusArea || 'General Practice').trim();
    const sessionDate = new Date(payload.sessionDate);

    // Create session
    const session = await TrainingSession.create({
      academyId: academy._id,
      teamId: team._id,
      coachId: coachId || undefined,
      sessionName,
      sessionTitle: sessionName,
      sessionDate,
      startTime: String(payload.startTime || '09:00 AM').trim(),
      endTime: String(payload.endTime || '11:00 AM').trim(),
      trainingLocation,
      locationField: trainingLocation,
      sessionType,
      focusArea,
      maxParticipants: payload.maxParticipants ? Number(payload.maxParticipants) : undefined,
      sessionDescription: payload.sessionDescription || '',
      requiredEquipment: payload.requiredEquipment || '',
      additionalNotes: payload.additionalNotes || '',
      totalPlayers: (team.playerIds || []).length,
      unmarkedCount: (team.playerIds || []).length,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      attendancePercentage: 0,
      isAttendanceCompleted: false,
    });

    // Automatically populate attendance records for all players in this team
    if (team.playerIds && team.playerIds.length > 0) {
      const attendanceDocs = team.playerIds.map((pid) => ({
        sessionId: session._id,
        playerId: pid,
        childPlayerId: pid,
        status: 'UNMARKED',
        attendanceStatus: 'UNMARKED',
      }));
      await TrainingAttendance.insertMany(attendanceDocs).catch(() => {});
    }

    return session;
  }

  // ==========================================
  // GET TRAINING SESSIONS (GRID & STATS)
  // ==========================================
  async getSessions(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await this.resolveUserAcademy(user, academyIdentifier);

    const filter: any = { academyId: academy._id };

    if (query.teamId && Types.ObjectId.isValid(query.teamId)) {
      filter.teamId = query.teamId;
    }
    if (query.coachId && Types.ObjectId.isValid(query.coachId)) {
      filter.coachId = query.coachId;
    }
    if (query.sessionType) {
      filter.sessionType = { $regex: new RegExp(String(query.sessionType).trim(), 'i') };
    }
    if (query.focusArea) {
      filter.focusArea = { $regex: new RegExp(String(query.focusArea).trim(), 'i') };
    }

    // Attendance completion filter: COMPLETED or PENDING
    if (query.status) {
      const st = String(query.status).toUpperCase();
      if (st === 'COMPLETED') {
        filter.isAttendanceCompleted = true;
      } else if (st === 'PENDING') {
        filter.isAttendanceCompleted = false;
      }
    }

    // Date range filter
    if (query.date) {
      const d = new Date(query.date);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      filter.sessionDate = { $gte: start, $lte: end };
    } else if (query.startDate || query.endDate) {
      filter.sessionDate = {};
      if (query.startDate) filter.sessionDate.$gte = new Date(query.startDate);
      if (query.endDate) filter.sessionDate.$lte = new Date(query.endDate);
    }

    const sessions = await TrainingSession.find(filter)
      .populate('teamId', 'teamName ageGroup')
      .populate('coachId', 'fullName title profileImage')
      .sort({ sessionDate: -1, createdAt: -1 })
      .lean();

    // Map each session matching UI Card specifications (Screenshot 1)
    const formattedSessions = sessions.map((s: any) => {
      const team = (s.teamId && typeof s.teamId === 'object' ? s.teamId : {}) as any;
      const coach = (s.coachId && typeof s.coachId === 'object' ? s.coachId : {}) as any;

      const dateObj = new Date(s.sessionDate);
      const formattedDate = !isNaN(dateObj.getTime())
        ? dateObj
            .toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
            .toUpperCase()
        : 'JAN 25, 2026';

      const timeRange = `${s.startTime || '9:00 AM'} - ${s.endTime || '11:00 AM'}`;
      const total = s.totalPlayers || 0;
      const present = s.presentCount || 0;
      const late = s.lateCount || 0;
      const absent = s.absentCount || 0;
      const unmarked = s.unmarkedCount ?? Math.max(0, total - (present + late + absent));
      const percentage =
        s.attendancePercentage ?? (total > 0 ? Math.round(((present + late) / total) * 100) : 0);

      const isCompleted = s.isAttendanceCompleted ?? (unmarked === 0 && total > 0);

      return {
        _id: s._id,
        id: s._id,
        sessionName: s.sessionName || s.sessionTitle || 'Training Session',
        teamBadge: team.ageGroup || team.teamName || 'U-17',
        team: {
          _id: team._id,
          name: team.teamName || 'Academy Team',
          ageGroup: team.ageGroup || '',
        },
        coachName: (coach.fullName || coach.title || 'Head Coach').toUpperCase(),
        coach: {
          _id: coach._id,
          name: coach.fullName || 'Head Coach',
          avatar: coach.profileImage || '',
        },
        date: formattedDate,
        rawDate: s.sessionDate,
        startTime: s.startTime,
        endTime: s.endTime,
        timeRange,
        location: s.trainingLocation || s.locationField || 'Main Field A',
        sessionType: s.sessionType,
        focusArea: s.focusArea,
        attendance: {
          percentage,
          isCompleted,
          statusLabel: isCompleted ? 'ATTENDANCE COMPLETED' : 'ATTENDANCE PENDING',
          present,
          late,
          absent,
          unmarked,
          total,
        },
        description: s.sessionDescription || '',
        requiredEquipment: s.requiredEquipment || '',
        additionalNotes: s.additionalNotes || '',
        createdAt: s.createdAt,
      };
    });

    // Search filter across sessionName, team name, coach name, location
    let result = formattedSessions;
    if (query.searchTerm || query.search || query.q) {
      const q = String(query.searchTerm || query.search || query.q)
        .trim()
        .toLowerCase();
      result = result.filter(
        (s) =>
          s.sessionName.toLowerCase().includes(q) ||
          s.team.name.toLowerCase().includes(q) ||
          s.teamBadge.toLowerCase().includes(q) ||
          s.coachName.toLowerCase().includes(q) ||
          s.location.toLowerCase().includes(q) ||
          s.focusArea.toLowerCase().includes(q),
      );
    }

    return {
      academy: {
        _id: academy._id,
        name: academy.name,
        logo: academy.logo || '',
      },
      stats: {
        totalSessions: result.length,
        completedSessions: result.filter((s) => s.attendance.isCompleted).length,
        pendingSessions: result.filter((s) => !s.attendance.isCompleted).length,
      },
      sessions: result,
    };
  }

  // ==========================================
  // GET SESSION BY ID
  // ==========================================
  async getSessionById(sessionId: string, user: any, academyIdentifier?: string) {
    await this.resolveUserAcademy(user, academyIdentifier);

    const session = await TrainingSession.findById(sessionId)
      .populate('teamId', 'teamName ageGroup playerIds')
      .populate('coachId', 'fullName title profileImage')
      .lean();

    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Training session not found');
    }

    return session;
  }

  // ==========================================
  // GET ATTENDANCE SHEET FOR MODAL (SCREENSHOT 5)
  // ==========================================
  async getSessionAttendance(
    sessionId: string,
    user: any,
    query: any = {},
    academyIdentifier?: string,
  ) {
    await this.resolveUserAcademy(user, academyIdentifier);

    const session = await TrainingSession.findById(sessionId)
      .populate('teamId', 'teamName ageGroup playerIds')
      .populate('coachId', 'fullName title profileImage')
      .lean();

    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Training session not found');
    }

    const team = (
      session.teamId && typeof session.teamId === 'object' ? session.teamId : {}
    ) as any;
    const coach = (
      session.coachId && typeof session.coachId === 'object' ? session.coachId : {}
    ) as any;

    const teamPlayerIds = team.playerIds || [];

    // Ensure all team players have attendance rows
    const existingAttendances = await TrainingAttendance.find({ sessionId }).lean();
    const existingPlayerMap = new Map<string, any>();
    existingAttendances.forEach((a) => {
      const pidStr = a.playerId?.toString() || a.childPlayerId?.toString();
      if (pidStr) existingPlayerMap.set(pidStr, a);
    });

    // Check if any team players are missing in attendance and insert them
    const missingPlayerIds = teamPlayerIds.filter(
      (pid: any) => !existingPlayerMap.has(pid.toString()),
    );
    if (missingPlayerIds.length > 0) {
      const newDocs = missingPlayerIds.map((pid: any) => ({
        sessionId: session._id,
        playerId: pid,
        childPlayerId: pid,
        status: 'UNMARKED',
      }));
      await TrainingAttendance.insertMany(newDocs).catch(() => {});
    }

    // Re-fetch with populated player profiles
    const attendances = await TrainingAttendance.find({ sessionId })
      .populate({
        path: 'playerId',
        select: 'fullName position profileImage jerseyNumber userId age currentClub',
      })
      .lean();

    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;

    const playersList = attendances.map((att: any, index: number) => {
      const p = (att.playerId && typeof att.playerId === 'object' ? att.playerId : {}) as any;
      const status = (att.status || att.attendanceStatus || 'UNMARKED').toUpperCase();

      if (status === 'PRESENT') presentCount++;
      else if (status === 'LATE') lateCount++;
      else if (status === 'ABSENT') absentCount++;
      else unmarkedCount++;

      return {
        serialNumber: index + 1,
        attendanceId: att._id,
        playerId: p._id || att.playerId,
        name: p.fullName || 'Athlete',
        avatar: p.profileImage || '',
        jerseyNumber: p.jerseyNumber ? `#${p.jerseyNumber}` : `#${index + 1}`,
        position: (p.position || 'FORWARD').toUpperCase(),
        status, // 'PRESENT' | 'LATE' | 'ABSENT' | 'UNMARKED'
        notes: att.notes || '',
      };
    });

    const totalPlayers = playersList.length;

    // Filter players by search query if passed
    let filteredPlayers = playersList;
    if (query.search || query.searchTerm || query.q) {
      const q = String(query.search || query.searchTerm || query.q)
        .trim()
        .toLowerCase();
      filteredPlayers = filteredPlayers.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.position.toLowerCase().includes(q) ||
          p.jerseyNumber.toLowerCase().includes(q),
      );
    }

    const dateObj = new Date(session.sessionDate);
    const formattedDate = !isNaN(dateObj.getTime())
      ? dateObj
          .toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
          .toUpperCase()
      : 'JAN 25, 2026';

    return {
      session: {
        _id: session._id,
        sessionName: session.sessionName || session.sessionTitle,
        teamBadge: team.ageGroup || team.teamName || 'U-15',
        teamName: team.teamName || '',
        date: formattedDate,
        startTime: session.startTime,
        endTime: session.endTime,
        timeRange: `${session.startTime} - ${session.endTime}`,
        coachName: (coach.fullName || coach.title || 'John Smith').toUpperCase(),
        locationVenue: (
          session.trainingLocation ||
          session.locationField ||
          'Main Field A'
        ).toUpperCase(),
      },
      overviewChips: {
        presentCount,
        lateCount,
        absentCount,
        unmarkedCount,
        totalPlayers,
        hasUnmarked: unmarkedCount > 0,
        unmarkedAlert: unmarkedCount > 0 ? `${unmarkedCount} PLAYERS STILL UNMARKED` : null,
      },
      players: filteredPlayers,
    };
  }

  // ==========================================
  // SAVE ATTENDANCE (BULK, QUICK ACTION, SINGLE)
  // ==========================================
  async saveAttendance(sessionId: string, user: any, payload: any, academyIdentifier?: string) {
    await this.resolveUserAcademy(user, academyIdentifier);

    const session = await TrainingSession.findById(sessionId);
    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Training session not found');
    }

    const userId = user.userId || user.id || user._id;

    // 1. Quick Action: Mark All Present / Mark All Absent / Clear All
    if (payload.markAll) {
      const markStatus = String(payload.markAll).toUpperCase();
      let targetStatus: 'PRESENT' | 'ABSENT' | 'UNMARKED' = 'UNMARKED';
      if (markStatus === 'PRESENT') targetStatus = 'PRESENT';
      else if (markStatus === 'ABSENT') targetStatus = 'ABSENT';

      await TrainingAttendance.updateMany(
        { sessionId },
        {
          status: targetStatus,
          attendanceStatus: targetStatus,
          markedBy: userId,
        },
      );
    }

    // 2. Bulk attendance array from modal: [{ playerId, status, notes }]
    if (Array.isArray(payload.attendances)) {
      for (const item of payload.attendances) {
        if (!item.playerId) continue;
        const status = String(item.status || 'UNMARKED').toUpperCase();
        await TrainingAttendance.findOneAndUpdate(
          { sessionId, $or: [{ playerId: item.playerId }, { childPlayerId: item.playerId }] },
          {
            sessionId,
            playerId: item.playerId,
            childPlayerId: item.playerId,
            status,
            attendanceStatus: status,
            notes: item.notes,
            markedBy: userId,
          },
          { upsert: true, new: true },
        );
      }
    }

    // 3. Single player attendance update (backward compatibility)
    const singlePid = payload.playerId || payload.childPlayerId;
    if (singlePid && (payload.status || payload.attendanceStatus)) {
      const status = String(payload.status || payload.attendanceStatus).toUpperCase();
      await TrainingAttendance.findOneAndUpdate(
        { sessionId, $or: [{ playerId: singlePid }, { childPlayerId: singlePid }] },
        {
          sessionId,
          playerId: singlePid,
          childPlayerId: singlePid,
          status,
          attendanceStatus: status,
          notes: payload.notes,
          markedBy: userId,
        },
        { upsert: true, new: true },
      );
    }

    // 4. Recalculate and synchronize session stats
    const allAttendances = await TrainingAttendance.find({ sessionId }).lean();
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;

    allAttendances.forEach((a) => {
      const st = (a.status || a.attendanceStatus || 'UNMARKED').toUpperCase();
      if (st === 'PRESENT') presentCount++;
      else if (st === 'LATE') lateCount++;
      else if (st === 'ABSENT') absentCount++;
      else unmarkedCount++;
    });

    const totalPlayers = allAttendances.length;
    const attendancePercentage =
      totalPlayers > 0 ? Math.round(((presentCount + lateCount) / totalPlayers) * 100) : 0;
    const isAttendanceCompleted = unmarkedCount === 0 && totalPlayers > 0;

    session.presentCount = presentCount;
    session.lateCount = lateCount;
    session.absentCount = absentCount;
    session.unmarkedCount = unmarkedCount;
    session.totalPlayers = totalPlayers;
    session.attendancePercentage = attendancePercentage;
    session.isAttendanceCompleted = isAttendanceCompleted;
    await session.save();

    return {
      message: 'Attendance saved successfully',
      stats: {
        presentCount,
        lateCount,
        absentCount,
        unmarkedCount,
        totalPlayers,
        attendancePercentage,
        isAttendanceCompleted,
      },
    };
  }

  // ==========================================
  // UPDATE TRAINING SESSION
  // ==========================================
  async updateSession(sessionId: string, user: any, payload: any, academyIdentifier?: string) {
    await this.resolveUserAcademy(user, academyIdentifier);

    const session = await TrainingSession.findById(sessionId);
    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Training session not found');
    }

    if (payload.sessionName) session.sessionName = payload.sessionName;
    if (payload.sessionTitle) session.sessionTitle = payload.sessionTitle;
    if (payload.sessionDate) session.sessionDate = new Date(payload.sessionDate);
    if (payload.startTime) session.startTime = payload.startTime;
    if (payload.endTime) session.endTime = payload.endTime;
    if (payload.trainingLocation) session.trainingLocation = payload.trainingLocation;
    if (payload.locationField) session.locationField = payload.locationField;
    if (payload.sessionType) session.sessionType = payload.sessionType;
    if (payload.focusArea) session.focusArea = payload.focusArea;
    if (payload.maxParticipants !== undefined) session.maxParticipants = payload.maxParticipants;
    if (payload.sessionDescription !== undefined)
      session.sessionDescription = payload.sessionDescription;
    if (payload.requiredEquipment !== undefined)
      session.requiredEquipment = payload.requiredEquipment;
    if (payload.additionalNotes !== undefined) session.additionalNotes = payload.additionalNotes;
    if (payload.coachId) session.coachId = payload.coachId;

    await session.save();
    return session;
  }

  // ==========================================
  // DELETE TRAINING SESSION
  // ==========================================
  async deleteSession(sessionId: string, user: any, academyIdentifier?: string) {
    await this.resolveUserAcademy(user, academyIdentifier);

    const session = await TrainingSession.findById(sessionId);
    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Training session not found');
    }

    await TrainingAttendance.deleteMany({ sessionId: session._id });
    await TrainingSession.findByIdAndDelete(session._id);

    return { message: 'Training session deleted successfully' };
  }
}

export const trainingService = new TrainingService();
