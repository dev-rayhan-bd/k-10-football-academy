import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import { IUserDocument, UserRole, UserStatus } from '@/modules/user/user.interface';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
  MatchRecord,
  PlayerCvValidation,
} from '@/modules/player/player.model';
import { CoachProfile, TacticalFormation } from '@/modules/coach/coach.model';
import {
  AcademyProfile,
  Team,
  GameReport,
  AcademyCoach,
  PlayerEvaluation,
} from '@/modules/academy/academy.model';
import { AgentProfile, VerificationDocument } from '@/modules/agent/agent.model';
import { ClubProfile, ClubFavourite } from '@/modules/club/club.model';
import { ParentProfile } from '@/modules/parent/parent.model';
import { MembershipPlan, UserSubscription } from '@/modules/subscription/subscription.model';
import { Notification } from '@/modules/notification/notification.model';
import { userProfileService } from '@/modules/user/services/user-profile.service';

export interface IAdminListQuery {
  search?: string;
  status?: string;
  position?: string;
  country?: string;
  ageRange?: string;
  minAge?: string | number;
  maxAge?: string | number;
  gender?: string;
  cvType?: string;
  cvTier?: string;
  license?: string;
  verificationStatus?: string;
  verification?: string;
  role?: string;
  category?: string;
  targetRole?: string;
  onlyCategoryGrants?: string;
  page?: string | number;
  limit?: string | number;
}

const isIgnoredFilter = (val?: string | number): boolean => {
  if (val === undefined || val === null) return true;
  const s = String(val).trim().toUpperCase();
  return (
    s === '' ||
    s === 'ALL' ||
    s === 'ALL STATUS' ||
    s === 'ALL POSITIONS' ||
    s === 'COUNTRY' ||
    s === 'AGE RANGE' ||
    s === 'ALL VERIFICATION'
  );
};

const matchesStatusFilter = (userStatus: string, filterStatus?: string): boolean => {
  if (isIgnoredFilter(filterStatus)) return true;
  const target = String(filterStatus).trim().toUpperCase();
  const current = (userStatus || 'ACTIVE').toUpperCase();
  if (target === 'ACTIVE') return current === 'ACTIVE';
  if (target === 'INACTIVE' || target === 'BLOCKED') {
    return current === 'INACTIVE' || current === 'BLOCKED';
  }
  return current === target;
};

const calculateAge = (age?: number, dateOfBirth?: Date | string): number | null => {
  if (typeof age === 'number' && !isNaN(age) && age > 0) return age;
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const today = new Date();
      let calc = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        calc--;
      }
      return Math.max(0, calc);
    }
  }
  return null;
};

const parseAgeRange = (
  ageRange?: string,
  minAgeParam?: string | number,
  maxAgeParam?: string | number,
): { min?: number; max?: number } => {
  const result: { min?: number; max?: number } = {};
  if (minAgeParam !== undefined && minAgeParam !== '') {
    const n = Number(minAgeParam);
    if (!isNaN(n)) result.min = n;
  }
  if (maxAgeParam !== undefined && maxAgeParam !== '') {
    const n = Number(maxAgeParam);
    if (!isNaN(n)) result.max = n;
  }
  if (!isIgnoredFilter(ageRange)) {
    const raw = String(ageRange).trim();
    const rangeMatch = raw.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      result.min = Number(rangeMatch[1]);
      result.max = Number(rangeMatch[2]);
    } else if (raw.endsWith('+')) {
      const n = parseInt(raw, 10);
      if (!isNaN(n)) result.min = n;
    } else if (/^u-?(\d+)$/i.test(raw)) {
      const m = raw.match(/^u-?(\d+)$/i);
      if (m) result.max = Number(m[1]);
    } else {
      const exact = Number(raw);
      if (!isNaN(exact)) {
        result.min = exact;
        result.max = exact;
      }
    }
  }
  return result;
};

const parseFlexibleDate = (input?: string | Date | null): Date | undefined => {
  if (!input) return undefined;
  if (input instanceof Date) return !isNaN(input.getTime()) ? input : undefined;
  const raw = String(input).trim();
  if (!raw) return undefined;

  // Check DD/MM/YYYY or MM/DD/YYYY
  const slashParts = raw.split('/');
  if (slashParts.length === 3) {
    const p0 = Number(slashParts[0]);
    const p1 = Number(slashParts[1]);
    const year = Number(slashParts[2]);
    if (!isNaN(p0) && !isNaN(p1) && !isNaN(year)) {
      // If p0 > 12, it's definitely DD/MM/YYYY
      const day = p0 > 12 ? p0 : p0;
      const month = p0 > 12 ? p1 - 1 : p1 - 1;
      const d = new Date(Date.UTC(year, month, day));
      if (!isNaN(d.getTime())) return d;
    }
  }

  const parsed = new Date(raw);
  return !isNaN(parsed.getTime()) ? parsed : undefined;
};

const formatDateYMD = (date?: Date | string | null): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

const inferTargetRole = (input?: string): string => {
  if (!input) return 'PLAYER';
  const s = input.trim().toUpperCase();
  if (['PLAYER', 'COACH', 'AGENT', 'CLUB', 'ACADEMY'].includes(s)) return s;
  if (s.includes('PLAYER') || s.includes('ATHLETE')) return 'PLAYER';
  if (s.includes('COACH')) return 'COACH';
  if (s.includes('AGENT')) return 'AGENT';
  if (s.includes('GRASSROOT') || s.includes('ACADEMY')) return 'ACADEMY';
  if (s.includes('CLUB')) return 'CLUB';
  return s;
};

const parseDurationInput = (rawDuration?: string | number): { months: number; label: string } => {
  if (rawDuration === undefined || rawDuration === null || rawDuration === '') {
    return { months: 12, label: '1 Year' };
  }
  const s = String(rawDuration).trim().toUpperCase();
  if (s === '3' || s.includes('3 MONTH') || s === '3_MONTHS' || s === '3M') {
    return { months: 3, label: '3 Months' };
  }
  if (s === '6' || s.includes('6 MONTH') || s === '6_MONTHS' || s === '6M') {
    return { months: 6, label: '6 Months' };
  }
  if (
    s === '12' ||
    s === '1' ||
    s.includes('1 YEAR') ||
    s === '1_YEAR' ||
    s.includes('12 MONTH') ||
    s === '12_MONTHS' ||
    s === '1Y'
  ) {
    return { months: 12, label: '1 Year' };
  }
  const num = parseInt(s, 10);
  if (!isNaN(num) && num > 0) {
    return {
      months: num,
      label: num === 12 ? '1 Year' : `${num} Months`,
    };
  }
  return { months: 12, label: '1 Year' };
};

export class AdminService {
  /**
   * Resolves any ID (either User._id or a role-specific Profile._id)
   * into { user, profileId, detectedRole }
   */
  async resolveTargetById(id: string): Promise<{
    user: IUserDocument | null;
    profileId?: string;
    detectedRole?: UserRole;
  }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid ID format');
    }

    // 1. Check UserModel directly
    const directUser = await UserModel.findById(id);
    if (directUser) {
      return { user: directUser, detectedRole: directUser.role };
    }

    // 2. Check role-specific profiles if a profile _id was passed from a table row
    const [playerProf, coachProf, academyProf, agentProf, clubProf, parentProf] = await Promise.all(
      [
        PlayerProfile.findById(id).select('_id userId').lean(),
        CoachProfile.findById(id).select('_id userId').lean(),
        AcademyProfile.findById(id).select('_id userId').lean(),
        AgentProfile.findById(id).select('_id userId').lean(),
        ClubProfile.findById(id).select('_id userId').lean(),
        ParentProfile.findById(id).select('_id userId').lean(),
      ],
    );

    const matchedProfile: { _id: any; userId: any; role: UserRole } | null = playerProf
      ? { _id: playerProf._id, userId: playerProf.userId, role: 'PLAYER' }
      : coachProf
        ? { _id: coachProf._id, userId: coachProf.userId, role: 'COACH' }
        : academyProf
          ? { _id: academyProf._id, userId: academyProf.userId, role: 'ACADEMY' }
          : agentProf
            ? { _id: agentProf._id, userId: agentProf.userId, role: 'AGENT' }
            : clubProf
              ? { _id: clubProf._id, userId: clubProf.userId, role: 'CLUB' }
              : parentProf
                ? { _id: parentProf._id, userId: parentProf.userId, role: 'PARENT' }
                : null;

    if (!matchedProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Target user or profile not found');
    }

    const user = matchedProfile.userId ? await UserModel.findById(matchedProfile.userId) : null;
    return {
      user,
      profileId: matchedProfile._id.toString(),
      detectedRole: user?.role || matchedProfile.role,
    };
  }

  /**
   * 1. SUPER ADMIN — PLAYERS TABLE (Screenshot 1)
   */
  async getPlayers(query: IAdminListQuery) {
    const [users, profiles, academies, matchCounts, gameReportCounts] = await Promise.all([
      UserModel.find({ role: 'PLAYER' }).sort({ createdAt: -1 }).lean(),
      PlayerProfile.find().sort({ createdAt: -1 }).lean(),
      AcademyProfile.find().select('_id name').lean(),
      MatchRecord.aggregate([{ $group: { _id: '$playerId', count: { $sum: 1 } } }]),
      GameReport.aggregate([{ $group: { _id: '$playerId', count: { $sum: 1 } } }]),
    ]);

    const academyMap = new Map<string, string>();
    for (const ac of academies) {
      academyMap.set(ac._id.toString(), ac.name);
    }

    const matchCountMap = new Map<string, number>();
    for (const m of matchCounts) {
      if (m._id) matchCountMap.set(m._id.toString(), m.count);
    }

    const gameReportMap = new Map<string, number>();
    for (const g of gameReportCounts) {
      if (g._id) gameReportMap.set(g._id.toString(), g.count);
    }

    const profileByUserId = new Map<string, any>();
    for (const p of profiles) {
      if (p.userId) profileByUserId.set(p.userId.toString(), p);
    }

    const userMap = new Map<string, any>();
    for (const u of users) {
      userMap.set(u._id.toString(), u);
    }

    const combinedUserIds = new Set<string>([
      ...users.map((u) => u._id.toString()),
      ...profiles.map((p) => (p.userId ? p.userId.toString() : '')).filter(Boolean),
    ]);

    const missingUserIds = [...combinedUserIds].filter((uid) => !userMap.has(uid));
    if (missingUserIds.length > 0) {
      const extraUsers = await UserModel.find({ _id: { $in: missingUserIds } }).lean();
      for (const eu of extraUsers) {
        userMap.set(eu._id.toString(), eu);
      }
    }

    const rows: any[] = [];
    for (const uid of combinedUserIds) {
      const u = userMap.get(uid);
      const p = profileByUserId.get(uid);
      if (!u && !p) continue;

      const playerIdStr = p?._id ? p._id.toString() : null;
      const acIdStr = p?.academyId
        ? p.academyId.toString()
        : u?.academyId
          ? u.academyId.toString()
          : null;
      const resolvedAcademy =
        (acIdStr && academyMap.get(acIdStr)) ||
        p?.academy ||
        p?.currentClub ||
        u?.academyName ||
        u?.currentClub ||
        '';

      const dbReports = playerIdStr
        ? (matchCountMap.get(playerIdStr) || 0) + (gameReportMap.get(playerIdStr) || 0)
        : 0;
      const reports =
        typeof (p as any)?.reports === 'number' && (p as any).reports > dbReports
          ? (p as any).reports
          : dbReports;

      const age = calculateAge(p?.age ?? u?.age, p?.dateOfBirth ?? u?.dateOfBirth);
      const position = (p?.position || u?.position || 'FORWARD').toUpperCase();
      const cvType = (p?.cvTier || u?.cvTier || 'BRONZE').toUpperCase();
      const status: UserStatus = (u?.status || 'ACTIVE') as UserStatus;
      const country = p?.country || u?.country || '';
      const gender = ((u as any)?.gender || (p as any)?.gender || '').toUpperCase();

      rows.push({
        _id: playerIdStr || uid,
        userId: uid,
        playerId: playerIdStr,
        name: p?.fullName || u?.name || 'Unknown Player',
        fullName: p?.fullName || u?.name || 'Unknown Player',
        email: u?.email || '',
        avatar: p?.profileImage || u?.avatar || '',
        profileImage: p?.profileImage || u?.avatar || '',
        position,
        secondaryPositions: p?.secondaryPositions || u?.secondaryPositions || [],
        age,
        country,
        gender,
        academy: resolvedAcademy,
        academyId: acIdStr,
        cvType,
        cvTier: cvType,
        reports,
        status,
        displayStatus: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        isBlocked: status === 'BLOCKED' || status === 'INACTIVE',
        createdAt: u?.createdAt || p?.createdAt,
      });
    }

    const distinctPositions = Array.from(
      new Set(rows.map((r) => r.position).filter(Boolean)),
    ).sort();
    const distinctCountries = Array.from(
      new Set(rows.map((r) => r.country).filter(Boolean)),
    ).sort();

    const search = query.search ? String(query.search).trim().toLowerCase() : '';
    const positionFilter = !isIgnoredFilter(query.position)
      ? String(query.position).trim().toUpperCase()
      : '';
    const countryFilter = !isIgnoredFilter(query.country)
      ? String(query.country).trim().toLowerCase()
      : '';
    const genderFilter = !isIgnoredFilter(query.gender)
      ? String(query.gender).trim().toUpperCase()
      : '';
    const cvFilter = !isIgnoredFilter(query.cvType || query.cvTier)
      ? String(query.cvType || query.cvTier)
          .trim()
          .toUpperCase()
      : '';
    const { min: minAge, max: maxAge } = parseAgeRange(query.ageRange, query.minAge, query.maxAge);

    const filtered = rows.filter((r) => {
      if (!matchesStatusFilter(r.status, query.status)) return false;

      if (positionFilter) {
        const matchPrimary = r.position.includes(positionFilter);
        const matchSecondary = Array.isArray(r.secondaryPositions)
          ? r.secondaryPositions.some((sp: string) => sp.toUpperCase().includes(positionFilter))
          : false;
        if (!matchPrimary && !matchSecondary) return false;
      }

      if (countryFilter && r.country.toLowerCase() !== countryFilter) {
        if (!r.country.toLowerCase().includes(countryFilter)) return false;
      }

      if (genderFilter && r.gender && r.gender !== genderFilter) return false;
      if (cvFilter && r.cvType !== cvFilter) return false;
      if (minAge !== undefined && (r.age === null || r.age < minAge)) return false;
      if (maxAge !== undefined && (r.age === null || r.age > maxAge)) return false;

      if (search) {
        const haystack = [
          r.name,
          r.email,
          r.position,
          r.country,
          r.academy,
          r.cvType,
          r.gender,
          r.age !== null ? String(r.age) : '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        filters: {
          positions: distinctPositions,
          countries: distinctCountries,
          ageRanges: ['10-15', '16-19', '20-23', '24-30', '30+'],
          statuses: ['ACTIVE', 'INACTIVE', 'BLOCKED'],
        },
      },
      data: paginated,
    };
  }

  /**
   * 2. SUPER ADMIN — COACHES TABLE (Screenshot 2)
   */
  async getCoaches(query: IAdminListQuery) {
    const [
      users,
      profiles,
      academies,
      affiliations,
      teams,
      academyPlayersCounts,
      cvValidationCounts,
      evaluationCounts,
    ] = await Promise.all([
      UserModel.find({ role: 'COACH' }).sort({ createdAt: -1 }).lean(),
      CoachProfile.find().sort({ createdAt: -1 }).lean(),
      AcademyProfile.find().select('_id name').lean(),
      AcademyCoach.find({ status: 'APPROVED' }).select('coachId academyId role').lean(),
      Team.find().select('_id academyId coachIds playerIds playersCount').lean(),
      PlayerProfile.aggregate([
        { $match: { academyId: { $ne: null } } },
        { $group: { _id: '$academyId', count: { $sum: 1 } } },
      ]),
      PlayerCvValidation.aggregate([
        { $group: { _id: '$coachId', players: { $addToSet: '$playerId' } } },
      ]),
      PlayerEvaluation.aggregate([
        { $group: { _id: '$coachId', players: { $addToSet: '$playerId' } } },
      ]),
    ]);

    const academyMap = new Map<string, string>();
    for (const ac of academies) {
      academyMap.set(ac._id.toString(), ac.name);
    }

    const affiliationByCoachId = new Map<string, { academyId: string; role?: string }>();
    for (const aff of affiliations) {
      if (aff.coachId && aff.academyId) {
        affiliationByCoachId.set(aff.coachId.toString(), {
          academyId: aff.academyId.toString(),
          role: aff.role,
        });
      }
    }

    const academyPlayerCountMap = new Map<string, number>();
    for (const ap of academyPlayersCounts) {
      if (ap._id) academyPlayerCountMap.set(ap._id.toString(), ap.count);
    }

    const cvValidationsByUserMap = new Map<string, number>();
    for (const cv of cvValidationCounts) {
      if (cv._id) cvValidationsByUserMap.set(cv._id.toString(), (cv.players || []).length);
    }

    const evaluationsByCoachMap = new Map<string, number>();
    for (const ev of evaluationCounts) {
      if (ev._id) evaluationsByCoachMap.set(ev._id.toString(), (ev.players || []).length);
    }

    const teamPlayersByCoachId = new Map<string, Set<string>>();
    for (const t of teams) {
      const cIds = Array.isArray(t.coachIds) ? t.coachIds : [];
      const pIds = Array.isArray(t.playerIds) ? t.playerIds : [];
      for (const cid of cIds) {
        const key = cid.toString();
        if (!teamPlayersByCoachId.has(key)) teamPlayersByCoachId.set(key, new Set());
        const set = teamPlayersByCoachId.get(key)!;
        for (const pid of pIds) {
          set.add(pid.toString());
        }
      }
    }

    const profileByUserId = new Map<string, any>();
    for (const p of profiles) {
      if (p.userId) profileByUserId.set(p.userId.toString(), p);
    }

    const userMap = new Map<string, any>();
    for (const u of users) {
      userMap.set(u._id.toString(), u);
    }

    const combinedUserIds = new Set<string>([
      ...users.map((u) => u._id.toString()),
      ...profiles.map((p) => (p.userId ? p.userId.toString() : '')).filter(Boolean),
    ]);

    const missingUserIds = [...combinedUserIds].filter((uid) => !userMap.has(uid));
    if (missingUserIds.length > 0) {
      const extraUsers = await UserModel.find({ _id: { $in: missingUserIds } }).lean();
      for (const eu of extraUsers) {
        userMap.set(eu._id.toString(), eu);
      }
    }

    const rows: any[] = [];
    for (const uid of combinedUserIds) {
      const u = userMap.get(uid);
      const p = profileByUserId.get(uid);
      if (!u && !p) continue;

      const coachIdStr = p?._id ? p._id.toString() : null;
      const aff = coachIdStr ? affiliationByCoachId.get(coachIdStr) : undefined;
      const acIdStr = p?.academyId
        ? p.academyId.toString()
        : aff?.academyId || (u?.academyId ? u.academyId.toString() : null);

      const resolvedAcademy =
        (acIdStr && academyMap.get(acIdStr)) ||
        p?.currentClub ||
        u?.academyName ||
        u?.currentClub ||
        '';

      const roleTitle = (
        p?.academyRole ||
        aff?.role ||
        p?.title ||
        u?.title ||
        'HEAD COACH'
      ).toUpperCase();

      const license =
        p?.licenseStatus || u?.coachingLicenseLevel || u?.licenseStatus || 'No Official License';

      const teamPlayersCount = coachIdStr ? teamPlayersByCoachId.get(coachIdStr)?.size || 0 : 0;
      const academyPlayersCount = acIdStr ? academyPlayerCountMap.get(acIdStr) || 0 : 0;
      const evaluatedCount =
        (coachIdStr ? evaluationsByCoachMap.get(coachIdStr) || 0 : 0) +
        (cvValidationsByUserMap.get(uid) || 0);

      const playersCount =
        teamPlayersCount > 0
          ? teamPlayersCount
          : academyPlayersCount > 0
            ? academyPlayersCount
            : evaluatedCount;

      const cvType = (p?.cvTier || u?.cvTier || 'BRONZE').toUpperCase();
      const status: UserStatus = (u?.status || 'ACTIVE') as UserStatus;

      rows.push({
        _id: coachIdStr || uid,
        userId: uid,
        coachId: coachIdStr,
        name: p?.fullName || u?.name || 'Unknown Coach',
        fullName: p?.fullName || u?.name || 'Unknown Coach',
        email: u?.email || '',
        avatar: p?.profileImage || u?.avatar || '',
        profileImage: p?.profileImage || u?.avatar || '',
        roleTitle,
        title: roleTitle,
        license,
        licenseStatus: license,
        academy: resolvedAcademy,
        academyId: acIdStr,
        player: playersCount,
        playersCount,
        cvType,
        cvTier: cvType,
        status,
        displayStatus: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        isBlocked: status === 'BLOCKED' || status === 'INACTIVE',
        createdAt: u?.createdAt || p?.createdAt,
      });
    }

    const search = query.search ? String(query.search).trim().toLowerCase() : '';
    const licenseFilter = !isIgnoredFilter(query.license)
      ? String(query.license).trim().toLowerCase()
      : '';
    const cvFilter = !isIgnoredFilter(query.cvType || query.cvTier)
      ? String(query.cvType || query.cvTier)
          .trim()
          .toUpperCase()
      : '';

    const filtered = rows.filter((r) => {
      if (!matchesStatusFilter(r.status, query.status)) return false;
      if (licenseFilter && !r.license.toLowerCase().includes(licenseFilter)) return false;
      if (cvFilter && r.cvType !== cvFilter) return false;

      if (search) {
        const haystack = [r.name, r.email, r.roleTitle, r.license, r.academy, r.cvType]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        filters: {
          statuses: ['ACTIVE', 'INACTIVE', 'BLOCKED'],
        },
      },
      data: paginated,
    };
  }

  /**
   * 3. SUPER ADMIN — ACADEMIES TABLE & TOP SUMMARY CARDS (Screenshot 3)
   */
  async getAcademies(query: IAdminListQuery) {
    const [users, profiles, teams, coachProfiles, affiliations, playerProfiles] = await Promise.all(
      [
        UserModel.find({ role: 'ACADEMY' }).sort({ createdAt: -1 }).lean(),
        AcademyProfile.find().sort({ createdAt: -1 }).lean(),
        Team.find().select('_id academyId coachIds playerIds coachesCount playersCount').lean(),
        CoachProfile.find({ academyId: { $ne: null } })
          .select('_id academyId')
          .lean(),
        AcademyCoach.find({ status: 'APPROVED' }).select('academyId coachId').lean(),
        PlayerProfile.find({ academyId: { $ne: null } })
          .select('_id academyId')
          .lean(),
      ],
    );

    const teamsByAcademy = new Map<string, number>();
    const coachesSetByAcademy = new Map<string, Set<string>>();
    const playersSetByAcademy = new Map<string, Set<string>>();

    for (const t of teams) {
      if (!t.academyId) continue;
      const acId = t.academyId.toString();
      teamsByAcademy.set(acId, (teamsByAcademy.get(acId) || 0) + 1);

      if (!coachesSetByAcademy.has(acId)) coachesSetByAcademy.set(acId, new Set());
      if (Array.isArray(t.coachIds)) {
        for (const cid of t.coachIds) {
          coachesSetByAcademy.get(acId)!.add(cid.toString());
        }
      }

      if (!playersSetByAcademy.has(acId)) playersSetByAcademy.set(acId, new Set());
      if (Array.isArray(t.playerIds)) {
        for (const pid of t.playerIds) {
          playersSetByAcademy.get(acId)!.add(pid.toString());
        }
      }
    }

    for (const cp of coachProfiles) {
      if (!cp.academyId) continue;
      const acId = cp.academyId.toString();
      if (!coachesSetByAcademy.has(acId)) coachesSetByAcademy.set(acId, new Set());
      coachesSetByAcademy.get(acId)!.add(cp._id.toString());
    }

    for (const aff of affiliations) {
      if (!aff.academyId || !aff.coachId) continue;
      const acId = aff.academyId.toString();
      if (!coachesSetByAcademy.has(acId)) coachesSetByAcademy.set(acId, new Set());
      coachesSetByAcademy.get(acId)!.add(aff.coachId.toString());
    }

    for (const pp of playerProfiles) {
      if (!pp.academyId) continue;
      const acId = pp.academyId.toString();
      if (!playersSetByAcademy.has(acId)) playersSetByAcademy.set(acId, new Set());
      playersSetByAcademy.get(acId)!.add(pp._id.toString());
    }

    const profileByUserId = new Map<string, any>();
    for (const p of profiles) {
      if (p.userId) profileByUserId.set(p.userId.toString(), p);
    }

    const userMap = new Map<string, any>();
    for (const u of users) {
      userMap.set(u._id.toString(), u);
    }

    const combinedUserIds = new Set<string>([
      ...users.map((u) => u._id.toString()),
      ...profiles.map((p) => (p.userId ? p.userId.toString() : '')).filter(Boolean),
    ]);

    const missingUserIds = [...combinedUserIds].filter((uid) => !userMap.has(uid));
    if (missingUserIds.length > 0) {
      const extraUsers = await UserModel.find({ _id: { $in: missingUserIds } }).lean();
      for (const eu of extraUsers) {
        userMap.set(eu._id.toString(), eu);
      }
    }

    const rows: any[] = [];
    let sumTeams = 0;
    let sumCoaches = 0;
    let sumPlayers = 0;

    for (const uid of combinedUserIds) {
      const u = userMap.get(uid);
      const p = profileByUserId.get(uid);
      if (!u && !p) continue;

      const academyIdStr = p?._id ? p._id.toString() : null;
      const teamsCount = academyIdStr ? teamsByAcademy.get(academyIdStr) || 0 : 0;
      const coachesCount = academyIdStr ? coachesSetByAcademy.get(academyIdStr)?.size || 0 : 0;
      const playersCount = academyIdStr ? playersSetByAcademy.get(academyIdStr)?.size || 0 : 0;

      sumTeams += teamsCount;
      sumCoaches += coachesCount;
      sumPlayers += playersCount;

      const status: UserStatus = (u?.status || 'ACTIVE') as UserStatus;
      const name = p?.name || u?.academyName || u?.name || 'Unknown Academy';
      const subtitle = (
        p?.league ? `${p.league} ACADEMY` : p?.category || u?.category || 'PREMIER LEAGUE ACADEMY'
      ).toUpperCase();

      rows.push({
        _id: academyIdStr || uid,
        userId: uid,
        academyId: academyIdStr,
        name,
        academyName: name,
        subtitle,
        category: p?.category || u?.category || 'General Academy',
        league: p?.league || '',
        email: u?.email || p?.contactEmail || '',
        logo: p?.logo || u?.avatar || '',
        avatar: p?.logo || u?.avatar || '',
        country: p?.country || u?.country || '',
        city: p?.city || u?.city || '',
        location: p?.location || u?.location || '',
        teams: teamsCount,
        teamsCount,
        coaches: coachesCount,
        coachesCount,
        player: playersCount,
        playersCount,
        status,
        displayStatus: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        isBlocked: status === 'BLOCKED' || status === 'INACTIVE',
        createdAt: u?.createdAt || p?.createdAt,
      });
    }

    const summary = {
      academies: rows.length,
      totalAcademies: rows.length,
      totalTeams: sumTeams,
      totalCoaches: sumCoaches,
      totalPlayers: sumPlayers,
    };

    const search = query.search ? String(query.search).trim().toLowerCase() : '';
    const countryFilter = !isIgnoredFilter(query.country)
      ? String(query.country).trim().toLowerCase()
      : '';

    const filtered = rows.filter((r) => {
      if (!matchesStatusFilter(r.status, query.status)) return false;
      if (countryFilter && !r.country.toLowerCase().includes(countryFilter)) return false;

      if (search) {
        const haystack = [
          r.name,
          r.subtitle,
          r.category,
          r.league,
          r.email,
          r.country,
          r.city,
          r.location,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      summary,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        filters: {
          statuses: ['ACTIVE', 'INACTIVE', 'BLOCKED'],
        },
      },
      data: paginated,
    };
  }

  /**
   * 4. SUPER ADMIN — AGENTS TABLE (Screenshot 4)
   */
  async getAgents(query: IAdminListQuery) {
    const [users, profiles] = await Promise.all([
      UserModel.find({ role: 'AGENT' }).sort({ createdAt: -1 }).lean(),
      AgentProfile.find().sort({ createdAt: -1 }).lean(),
    ]);

    const profileByUserId = new Map<string, any>();
    for (const p of profiles) {
      if (p.userId) profileByUserId.set(p.userId.toString(), p);
    }

    const userMap = new Map<string, any>();
    for (const u of users) {
      userMap.set(u._id.toString(), u);
    }

    const combinedUserIds = new Set<string>([
      ...users.map((u) => u._id.toString()),
      ...profiles.map((p) => (p.userId ? p.userId.toString() : '')).filter(Boolean),
    ]);

    const missingUserIds = [...combinedUserIds].filter((uid) => !userMap.has(uid));
    if (missingUserIds.length > 0) {
      const extraUsers = await UserModel.find({ _id: { $in: missingUserIds } }).lean();
      for (const eu of extraUsers) {
        userMap.set(eu._id.toString(), eu);
      }
    }

    const rows: any[] = [];
    for (const uid of combinedUserIds) {
      const u = userMap.get(uid);
      const p = profileByUserId.get(uid);
      if (!u && !p) continue;

      const agentIdStr = p?._id ? p._id.toString() : null;
      const verificationStatus = (
        p?.verificationStatus ||
        u?.verificationStatus ||
        (u?.isVerified ? 'APPROVED' : 'PENDING')
      ).toUpperCase();

      const cvsShared = Number(p?.cvsSharedCount) || 0;
      const status: UserStatus = (u?.status || 'ACTIVE') as UserStatus;
      const name = p?.fullName || p?.name || u?.name || 'Unknown Agent';

      rows.push({
        _id: agentIdStr || uid,
        userId: uid,
        agentId: agentIdStr,
        name,
        fullName: name,
        email: u?.email || p?.email || '',
        avatar: p?.avatar || u?.avatar || '',
        agencyName: p?.agencyName || p?.certifications || u?.agencyName || '',
        fifaLicenseNumber: p?.fifaLicenseNumber || p?.licenseId || u?.fifaLicenseNumber || '',
        country: p?.country || p?.countryOfOperation || u?.country || u?.countryOfOperation || '',
        verification: verificationStatus,
        verificationStatus,
        cvsShared,
        cvsSharedCount: cvsShared,
        status,
        displayStatus: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        isBlocked: status === 'BLOCKED' || status === 'INACTIVE',
        createdAt: u?.createdAt || p?.createdAt,
      });
    }

    const search = query.search ? String(query.search).trim().toLowerCase() : '';
    const verFilter = !isIgnoredFilter(query.verificationStatus || query.verification)
      ? String(query.verificationStatus || query.verification)
          .trim()
          .toUpperCase()
      : '';

    const filtered = rows.filter((r) => {
      if (!matchesStatusFilter(r.status, query.status)) return false;
      if (verFilter && r.verificationStatus !== verFilter) return false;

      if (search) {
        const haystack = [
          r.name,
          r.email,
          r.agencyName,
          r.fifaLicenseNumber,
          r.country,
          r.verificationStatus,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        filters: {
          statuses: ['ACTIVE', 'INACTIVE', 'BLOCKED'],
          verificationStatuses: ['APPROVED', 'PENDING', 'REJECTED'],
        },
      },
      data: paginated,
    };
  }

  /**
   * 5. SUPER ADMIN — CLUBS TABLE (Screenshot 5)
   */
  async getClubs(query: IAdminListQuery) {
    const [users, profiles, clubFavourites] = await Promise.all([
      UserModel.find({ role: 'CLUB' }).sort({ createdAt: -1 }).lean(),
      ClubProfile.find().sort({ createdAt: -1 }).lean(),
      ClubFavourite.find({ targetType: 'PLAYER' }).select('clubId targetPlayerId').lean(),
    ]);

    const favPlayersByClub = new Map<string, Set<string>>();
    for (const fav of clubFavourites) {
      if (!fav.clubId || !fav.targetPlayerId) continue;
      const cid = fav.clubId.toString();
      if (!favPlayersByClub.has(cid)) favPlayersByClub.set(cid, new Set());
      favPlayersByClub.get(cid)!.add(fav.targetPlayerId.toString());
    }

    const profileByUserId = new Map<string, any>();
    for (const p of profiles) {
      if (p.userId) profileByUserId.set(p.userId.toString(), p);
    }

    const userMap = new Map<string, any>();
    for (const u of users) {
      userMap.set(u._id.toString(), u);
    }

    const combinedUserIds = new Set<string>([
      ...users.map((u) => u._id.toString()),
      ...profiles.map((p) => (p.userId ? p.userId.toString() : '')).filter(Boolean),
    ]);

    const missingUserIds = [...combinedUserIds].filter((uid) => !userMap.has(uid));
    if (missingUserIds.length > 0) {
      const extraUsers = await UserModel.find({ _id: { $in: missingUserIds } }).lean();
      for (const eu of extraUsers) {
        userMap.set(eu._id.toString(), eu);
      }
    }

    const rows: any[] = [];
    for (const uid of combinedUserIds) {
      const u = userMap.get(uid);
      const p = profileByUserId.get(uid);
      if (!u && !p) continue;

      const clubIdStr = p?._id ? p._id.toString() : null;
      const likedSet = new Set<string>();
      if (Array.isArray(p?.likedPlayerIds)) {
        for (const pid of p.likedPlayerIds) {
          if (pid) likedSet.add(pid.toString());
        }
      }
      if (clubIdStr && favPlayersByClub.has(clubIdStr)) {
        for (const pid of favPlayersByClub.get(clubIdStr)!) {
          likedSet.add(pid);
        }
      }

      const likedPlayers = likedSet.size;
      const status: UserStatus = (u?.status || 'ACTIVE') as UserStatus;
      const name = p?.name || u?.clubName || u?.name || 'Unknown Club';
      const subtitle = (p?.clubType || u?.title || 'PREMIUM CLUB').toUpperCase();
      const country = p?.country || u?.country || '';
      const verificationStatus = (
        p?.verificationStatus ||
        u?.verificationStatus ||
        (u?.isVerified ? 'APPROVED' : 'PENDING')
      ).toUpperCase();

      rows.push({
        _id: clubIdStr || uid,
        userId: uid,
        clubId: clubIdStr,
        name,
        clubName: name,
        subtitle,
        clubType: subtitle,
        email: u?.email || p?.contactEmail || '',
        logo: p?.logo || u?.avatar || '',
        avatar: p?.logo || u?.avatar || '',
        country,
        league: p?.league || u?.league || '',
        verificationStatus,
        likedPlayers,
        likedPlayersCount: likedPlayers,
        status,
        displayStatus: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        isBlocked: status === 'BLOCKED' || status === 'INACTIVE',
        createdAt: u?.createdAt || p?.createdAt,
      });
    }

    const search = query.search ? String(query.search).trim().toLowerCase() : '';
    const countryFilter = !isIgnoredFilter(query.country)
      ? String(query.country).trim().toLowerCase()
      : '';
    const verFilter = !isIgnoredFilter(query.verificationStatus || query.verification)
      ? String(query.verificationStatus || query.verification)
          .trim()
          .toUpperCase()
      : '';

    const filtered = rows.filter((r) => {
      if (!matchesStatusFilter(r.status, query.status)) return false;
      if (countryFilter && !r.country.toLowerCase().includes(countryFilter)) return false;
      if (verFilter && r.verificationStatus !== verFilter) return false;

      if (search) {
        const haystack = [r.name, r.subtitle, r.country, r.league, r.email].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        filters: {
          statuses: ['ACTIVE', 'INACTIVE', 'BLOCKED'],
        },
      },
      data: paginated,
    };
  }

  /**
   * ACTION 1: VIEW SINGLE USER / ENTITY FULL DETAILS (Eye icon in Actions column)
   */
  async getUserDetailsById(id: string) {
    const { user, profileId, detectedRole } = await this.resolveTargetById(id);

    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User account not found');
    }

    const enrichedUser = await userProfileService.getUserById(user._id.toString());
    const role = user.role || detectedRole;
    let roleProfile: any = null;

    if (role === 'PLAYER') {
      roleProfile = await PlayerProfile.findOne({ userId: user._id }).lean();
    } else if (role === 'COACH') {
      roleProfile = await CoachProfile.findOne({ userId: user._id }).lean();
    } else if (role === 'ACADEMY') {
      roleProfile = await AcademyProfile.findOne({ userId: user._id }).lean();
      if (roleProfile) {
        const [teamsCount, coachesCount, playersCount] = await Promise.all([
          Team.countDocuments({ academyId: roleProfile._id }),
          CoachProfile.countDocuments({ academyId: roleProfile._id }),
          PlayerProfile.countDocuments({ academyId: roleProfile._id }),
        ]);
        roleProfile = { ...roleProfile, teamsCount, coachesCount, playersCount };
      }
    } else if (role === 'AGENT') {
      const [prof, docs] = await Promise.all([
        AgentProfile.findOne({ userId: user._id }).lean(),
        VerificationDocument.find({ agentId: user._id }).lean(),
      ]);
      roleProfile = prof
        ? { ...prof, verificationDocuments: docs }
        : { verificationDocuments: docs };
    } else if (role === 'CLUB') {
      roleProfile = await ClubProfile.findOne({ userId: user._id }).lean();
    } else if (role === 'PARENT' || role === 'GUARDIAN') {
      roleProfile = await ParentProfile.findOne({ userId: user._id }).lean();
    }

    return {
      ...enrichedUser,
      profileId: roleProfile?._id || profileId || null,
      displayStatus: user.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      isBlocked: user.status === 'BLOCKED' || user.status === 'INACTIVE',
      profileDetails: roleProfile,
    };
  }

  /**
   * ACTION 2: BLOCK / UNBLOCK / TOGGLE USER STATUS (Lock icon in Actions column)
   */
  async updateUserStatus(
    id: string,
    payload: {
      status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
      action?: 'BLOCK' | 'UNBLOCK' | 'ACTIVATE' | 'DEACTIVATE';
      isBlocked?: boolean;
      reason?: string;
    } = {},
    requester?: { userId: string; role: UserRole },
  ) {
    const { user, profileId } = await this.resolveTargetById(id);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User account not found');
    }

    if (user.role === 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Access Denied: Super Admin account cannot be blocked or deactivated',
      );
    }

    if (requester && requester.userId === user._id.toString()) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'You cannot block or deactivate your own account',
      );
    }

    if (user.role === 'ADMIN' && requester && requester.role !== 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Access Denied: Only a Super Admin can modify another Admin account',
      );
    }

    const previousStatus = user.status;
    let nextStatus: UserStatus;

    if (payload.status && ['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(payload.status)) {
      nextStatus = payload.status;
    } else if (payload.action) {
      const act = payload.action.toUpperCase();
      if (act === 'BLOCK') nextStatus = 'BLOCKED';
      else if (act === 'DEACTIVATE') nextStatus = 'INACTIVE';
      else nextStatus = 'ACTIVE';
    } else if (typeof payload.isBlocked === 'boolean') {
      nextStatus = payload.isBlocked ? 'BLOCKED' : 'ACTIVE';
    } else {
      nextStatus = previousStatus === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    }

    user.status = nextStatus;
    await user.save();

    if (user.role === 'COACH') {
      await CoachProfile.findOneAndUpdate(
        { userId: user._id },
        { $set: { status: nextStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE' } },
      );
    }

    const isBlocked = nextStatus === 'BLOCKED' || nextStatus === 'INACTIVE';

    await Notification.create({
      recipientId: user._id,
      recipientRole: user.role,
      title: isBlocked ? 'Account Restricted by Administrator' : 'Account Reactivated',
      message: isBlocked
        ? `Your account has been ${nextStatus.toLowerCase()} by the platform administrator.${payload.reason ? ` Reason: ${payload.reason}` : ''}`
        : 'Your account has been unblocked and reactivated by the platform administrator.',
      type: 'SYSTEM',
      data: {
        previousStatus,
        status: nextStatus,
        reason: payload.reason || '',
      },
    }).catch(() => null);

    return {
      userId: user._id,
      profileId: profileId || null,
      name: user.name,
      email: user.email,
      role: user.role,
      previousStatus,
      status: nextStatus,
      displayStatus: nextStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      isBlocked,
      updatedAt: user.updatedAt,
      message: isBlocked
        ? `User (${user.name}) has been ${nextStatus.toLowerCase()} successfully`
        : `User (${user.name}) has been unblocked and activated successfully`,
    };
  }

  /**
   * ACTION 3: DELETE USER & PROFILE (Trash icon in Actions column)
   */
  async deleteUserAndProfile(id: string, requester?: { userId: string; role: UserRole }) {
    const { user, profileId, detectedRole } = await this.resolveTargetById(id);

    if (user) {
      if (user.role === 'SUPER_ADMIN') {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Access Denied: Super Admin account cannot be deleted',
        );
      }

      if (requester && requester.userId === user._id.toString()) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'You cannot delete your own account');
      }

      if (user.role === 'ADMIN' && requester && requester.role !== 'SUPER_ADMIN') {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Access Denied: Only a Super Admin can delete an Admin account',
        );
      }
    }

    const targetUserId = user?._id;
    const role = user?.role || detectedRole;

    if (role === 'PLAYER' || profileId) {
      const playerProf = targetUserId
        ? await PlayerProfile.findOneAndDelete({ userId: targetUserId })
        : profileId
          ? await PlayerProfile.findByIdAndDelete(profileId)
          : null;
      if (playerProf) {
        await Promise.all([
          PlayerAttributes.deleteMany({ playerId: playerProf._id }),
          PlayerMentalAnalysis.deleteMany({ playerId: playerProf._id }),
          PlayerFullPotential.deleteMany({ playerId: playerProf._id }),
          FifaCardStats.deleteMany({ playerId: playerProf._id }),
        ]);
      }
    }

    if (role === 'COACH' || profileId) {
      const coachProf = targetUserId
        ? await CoachProfile.findOneAndDelete({ userId: targetUserId })
        : profileId
          ? await CoachProfile.findByIdAndDelete(profileId)
          : null;
      if (coachProf) {
        await Promise.all([
          TacticalFormation.deleteMany({ coachId: coachProf._id }),
          AcademyCoach.deleteMany({ coachId: coachProf._id }),
        ]);
      }
    }

    if (role === 'ACADEMY' || profileId) {
      const academyProf = targetUserId
        ? await AcademyProfile.findOneAndDelete({ userId: targetUserId })
        : profileId
          ? await AcademyProfile.findByIdAndDelete(profileId)
          : null;
      if (academyProf) {
        await Promise.all([
          Team.deleteMany({ academyId: academyProf._id }),
          AcademyCoach.deleteMany({ academyId: academyProf._id }),
        ]);
      }
    }

    if (role === 'AGENT' || profileId) {
      if (targetUserId) {
        await Promise.all([
          AgentProfile.findOneAndDelete({ userId: targetUserId }),
          VerificationDocument.deleteMany({ agentId: targetUserId }),
        ]);
      } else if (profileId) {
        await AgentProfile.findByIdAndDelete(profileId);
      }
    }

    if (role === 'CLUB' || profileId) {
      const clubProf = targetUserId
        ? await ClubProfile.findOneAndDelete({ userId: targetUserId })
        : profileId
          ? await ClubProfile.findByIdAndDelete(profileId)
          : null;
      if (clubProf) {
        await ClubFavourite.deleteMany({ clubId: clubProf._id });
      }
    }

    if (role === 'PARENT' || role === 'GUARDIAN' || profileId) {
      if (targetUserId) {
        await ParentProfile.findOneAndDelete({ userId: targetUserId });
      } else if (profileId) {
        await ParentProfile.findByIdAndDelete(profileId);
      }
    }

    if (targetUserId) {
      await UserSubscription.deleteMany({ userId: targetUserId });
      await UserModel.findByIdAndDelete(targetUserId);
    }

    return {
      deletedId: id,
      userId: targetUserId || null,
      profileId: profileId || null,
      role: role || null,
    };
  }

  // =========================================================================
  // 6. MEMBERSHIP PLANS MANAGEMENT (Screenshots 1 & 2: Plans List, Add Plan, Edit Plan, Deactivate)
  // =========================================================================

  private formatPlanDocument(plan: any) {
    const obj = typeof plan?.toObject === 'function' ? plan.toObject() : { ...plan };
    const planName = obj.planName || obj.title || '';
    const price = Number(obj.price) || 0;
    const currency = obj.currency || '$';
    const billingCycle = obj.billingCycle || 'MONTHLY';
    const isActive = obj.isActive !== undefined ? Boolean(obj.isActive) : true;

    return {
      _id: obj._id,
      planName,
      title: obj.title || planName,
      planCategory: obj.planCategory || obj.targetRole || 'PLAYER',
      targetRole: obj.targetRole || 'PLAYER',
      price,
      planPrice: price,
      currency,
      formattedPrice: `${currency}${price.toFixed(2)}`,
      billingCycle,
      billingLabel: billingCycle === 'YEARLY' ? '/year' : '/month',
      features: Array.isArray(obj.features) ? obj.features : [],
      startDate: obj.startDate || null,
      endDate: obj.endDate || null,
      formattedStartDate: formatDateYMD(obj.startDate),
      formattedEndDate: formatDateYMD(obj.endDate),
      isActive,
      status: isActive ? 'ACTIVE' : 'INACTIVE',
      isDefaultPricing: Boolean(obj.isDefaultPricing),
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  async getMembershipPlans(query: IAdminListQuery) {
    const filter: Record<string, any> = {};
    if (!isIgnoredFilter(query.status)) {
      const st = String(query.status).trim().toUpperCase();
      if (st === 'ACTIVE') filter.isActive = true;
      else if (st === 'INACTIVE') filter.isActive = false;
    }
    if (!isIgnoredFilter(query.targetRole || query.category)) {
      filter.targetRole = inferTargetRole(String(query.targetRole || query.category));
    }

    const plans = await MembershipPlan.find(filter).sort({ createdAt: 1 }).lean();
    let formatted = plans.map((p) => this.formatPlanDocument(p));

    if (query.search) {
      const s = String(query.search).trim().toLowerCase();
      formatted = formatted.filter((p) =>
        [p.planName, p.planCategory, p.targetRole, ...(p.features || [])]
          .join(' ')
          .toLowerCase()
          .includes(s),
      );
    }

    return {
      meta: {
        total: formatted.length,
        activeCount: formatted.filter((p) => p.isActive).length,
        inactiveCount: formatted.filter((p) => !p.isActive).length,
      },
      data: formatted,
    };
  }

  async createMembershipPlan(payload: any) {
    const planName = String(payload.planName || payload.title || payload.name || '').trim();
    const rawPrice = Number(payload.price ?? payload.planPrice ?? 0);

    // Features can come from payload.features or array payload.planCategory
    let features: string[] = [];
    if (Array.isArray(payload.features)) {
      features = payload.features.map((f: any) => String(f).trim()).filter(Boolean);
    } else if (typeof payload.features === 'string' && payload.features.trim()) {
      features = payload.features
        .split('\n')
        .map((f: string) => f.trim())
        .filter(Boolean);
    } else if (Array.isArray(payload.planCategory)) {
      features = payload.planCategory.map((f: any) => String(f).trim()).filter(Boolean);
    }

    const rawCategory =
      typeof payload.planCategory === 'string'
        ? payload.planCategory.trim()
        : payload.category || payload.targetRole || planName;

    const targetRole = inferTargetRole(payload.targetRole || rawCategory || planName);

    const isActive =
      payload.isActive !== undefined
        ? Boolean(payload.isActive)
        : payload.active !== undefined
          ? Boolean(payload.active)
          : payload.status
            ? String(payload.status).toUpperCase() === 'ACTIVE'
            : true;

    const isDefaultPricing = Boolean(payload.isDefaultPricing ?? payload.defaultPricing ?? false);
    const startDate = parseFlexibleDate(payload.startDate);
    const endDate = parseFlexibleDate(payload.endDate);

    const created = await MembershipPlan.create({
      title: planName,
      planName,
      planCategory: rawCategory || targetRole,
      targetRole,
      price: rawPrice,
      currency: payload.currency || '$',
      billingCycle: payload.billingCycle || 'MONTHLY',
      features,
      startDate,
      endDate,
      isActive,
      status: isActive ? 'ACTIVE' : 'INACTIVE',
      isDefaultPricing,
    });

    return this.formatPlanDocument(created);
  }

  async updateMembershipPlan(id: string, payload: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid membership plan ID');
    }

    const plan = await MembershipPlan.findById(id);
    if (!plan) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Membership plan not found');
    }

    const nextName = payload.planName || payload.title || payload.name;
    if (nextName !== undefined) {
      plan.title = String(nextName).trim();
      plan.planName = String(nextName).trim();
    }

    if (payload.price !== undefined || payload.planPrice !== undefined) {
      const p = Number(payload.price ?? payload.planPrice);
      if (!isNaN(p) && p >= 0) {
        plan.price = p;
      }
    }

    if (payload.currency !== undefined) {
      plan.currency = String(payload.currency).trim() || '$';
    }

    if (payload.billingCycle !== undefined) {
      plan.billingCycle = payload.billingCycle;
    }

    if (payload.features !== undefined) {
      if (Array.isArray(payload.features)) {
        plan.features = payload.features.map((f: any) => String(f).trim()).filter(Boolean);
      } else if (typeof payload.features === 'string') {
        plan.features = payload.features
          .split('\n')
          .map((f: string) => f.trim())
          .filter(Boolean);
      }
    } else if (Array.isArray(payload.planCategory)) {
      plan.features = payload.planCategory.map((f: any) => String(f).trim()).filter(Boolean);
    }

    if (typeof payload.planCategory === 'string' && payload.planCategory.trim()) {
      plan.planCategory = payload.planCategory.trim();
      if (!payload.targetRole) {
        plan.targetRole = inferTargetRole(payload.planCategory);
      }
    }

    if (payload.targetRole || payload.category) {
      plan.targetRole = inferTargetRole(payload.targetRole || payload.category);
    }

    if (payload.startDate !== undefined) {
      plan.startDate = payload.startDate ? parseFlexibleDate(payload.startDate) : undefined;
    }
    if (payload.endDate !== undefined) {
      plan.endDate = payload.endDate ? parseFlexibleDate(payload.endDate) : undefined;
    }

    if (payload.isDefaultPricing !== undefined || payload.defaultPricing !== undefined) {
      plan.isDefaultPricing = Boolean(payload.isDefaultPricing ?? payload.defaultPricing);
    }

    // Handle Deactivate / Activate button or explicit status/isActive
    if (payload.action) {
      const act = String(payload.action).toUpperCase();
      if (act === 'DEACTIVATE') plan.isActive = false;
      else if (act === 'ACTIVATE') plan.isActive = true;
      else if (act === 'TOGGLE') plan.isActive = !plan.isActive;
    } else if (payload.isActive !== undefined || payload.active !== undefined) {
      plan.isActive = Boolean(payload.isActive ?? payload.active);
    } else if (payload.status !== undefined) {
      plan.isActive = String(payload.status).toUpperCase() === 'ACTIVE';
    }

    plan.status = plan.isActive ? 'ACTIVE' : 'INACTIVE';
    await plan.save();

    return this.formatPlanDocument(plan);
  }

  async deleteMembershipPlan(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid membership plan ID');
    }

    const deleted = await MembershipPlan.findByIdAndDelete(id);
    if (!deleted) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Membership plan not found');
    }

    return {
      deletedId: deleted._id,
      planName: deleted.planName || deleted.title,
    };
  }

  // =========================================================================
  // 7. GRANT MEMBERSHIP (Screenshots 3 & 4: Grant Premium Access, Dropdown Users, Active Grants)
  // =========================================================================

  async getMembershipGrants(query: IAdminListQuery) {
    const categoryFilter = !isIgnoredFilter(query.category || query.role)
      ? inferTargetRole(String(query.category || query.role))
      : '';

    // 1. Fetch active grants (and admin-granted subscriptions)
    const grantQuery: Record<string, any> = {
      $or: [{ isAdminGrant: true }, { status: 'ACTIVE' }],
    };
    const subscriptions = await UserSubscription.find(grantQuery)
      .populate('userId', 'name email role avatar cvTier status')
      .populate('planId', 'title planName targetRole price')
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    const grantRows: any[] = [];

    for (const sub of subscriptions) {
      const u = sub.userId as any;
      if (!u || !u._id) continue;

      const start = sub.startDate || sub.createdAt || now;
      const end = sub.endDate || sub.nextBillingDate || null;
      const isExpired = end ? new Date(end) < now : false;
      const effectiveStatus = isExpired ? 'EXPIRED' : sub.status || 'ACTIVE';

      const cat = (sub.category || u.role || 'PLAYER').toUpperCase();
      if (categoryFilter && query.onlyCategoryGrants === 'true' && cat !== categoryFilter) {
        continue;
      }

      const startStr = formatDateYMD(start);
      const endStr = formatDateYMD(end);
      const durationLabel =
        sub.duration ||
        (sub.durationMonths === 3 ? '3 Months' : sub.durationMonths === 6 ? '6 Months' : '1 Year');

      grantRows.push({
        _id: sub._id,
        grantId: sub._id,
        userId: u._id,
        userDetails: {
          _id: u._id,
          name: u.name,
          email: u.email,
          avatar: u.avatar || '',
          role: u.role,
        },
        name: u.name,
        email: u.email,
        category: cat,
        duration: durationLabel,
        durationMonths: sub.durationMonths || 12,
        startDate: startStr,
        endDate: endStr,
        validityPeriod: startStr && endStr ? `${startStr} to ${endStr}` : startStr,
        status: effectiveStatus,
        isAdminGrant: Boolean(sub.isAdminGrant),
        createdAt: sub.createdAt,
      });
    }

    // Apply search / status filters on grantRows
    const search = query.search ? String(query.search).trim().toLowerCase() : '';
    const statusFilter = !isIgnoredFilter(query.status)
      ? String(query.status).trim().toUpperCase()
      : '';

    const filteredGrants = grantRows.filter((g) => {
      if (statusFilter && g.status.toUpperCase() !== statusFilter) return false;
      if (search) {
        const hay = [g.name, g.email, g.category, g.duration, g.validityPeriod]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    // 2. Build Dropdown Users for "Select registered user" (Screenshot 4)
    const userRoleFilter: Record<string, any> = {
      role: categoryFilter
        ? categoryFilter
        : { $in: ['PLAYER', 'COACH', 'ACADEMY', 'CLUB', 'AGENT'] },
      status: { $ne: 'BLOCKED' },
    };

    const candidateUsers = await UserModel.find(userRoleFilter)
      .select('_id name email role cvTier avatar')
      .sort({ name: 1 })
      .lean();

    const activeGrantByUser = new Map<string, string>();
    for (const g of grantRows) {
      if (g.status === 'ACTIVE' && g.userId) {
        activeGrantByUser.set(g.userId.toString(), 'Premium plan');
      }
    }

    const dropdownUsers = candidateUsers.map((cu: any) => {
      const uid = cu._id.toString();
      const activePlan = activeGrantByUser.get(uid);
      const tier = cu.cvTier ? String(cu.cvTier).toUpperCase() : '';
      const currentPlan =
        activePlan ||
        (tier === 'GOLD'
          ? 'Gold plan'
          : tier === 'SILVER'
            ? 'Silver plan'
            : tier === 'BRONZE'
              ? 'Bronze plan'
              : 'Standard plan');

      return {
        _id: cu._id,
        userId: cu._id,
        name: cu.name,
        email: cu.email,
        role: cu.role,
        category: cu.role,
        currentPlan,
        displayLabel: `${cu.name} (${currentPlan} - ${cu.email})`,
      };
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const total = filteredGrants.length;
    const paginatedGrants = filteredGrants.slice((page - 1) * limit, page * limit);

    return {
      meta: {
        total,
        totalGrants: grantRows.filter((g) => g.status === 'ACTIVE').length,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        categories: ['PLAYER', 'COACH', 'ACADEMY', 'CLUB', 'AGENT'],
        durations: ['3 MONTHS', '6 MONTHS', '1 YEAR'],
        dropdownUsers,
      },
      data: paginatedGrants,
    };
  }

  async grantMembership(
    payload: {
      userId: string;
      category?: string;
      userCategory?: string;
      duration?: string | number;
      membershipDuration?: string | number;
      startDate?: string;
      endDate?: string;
    },
    adminUserId?: string,
  ) {
    const { user, detectedRole } = await this.resolveTargetById(payload.userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Selected user not found');
    }

    const category = inferTargetRole(
      payload.category || payload.userCategory || user.role || detectedRole || 'PLAYER',
    );
    const { months, label: durationLabel } = parseDurationInput(
      payload.duration ?? payload.membershipDuration,
    );

    const startDate = parseFlexibleDate(payload.startDate) || new Date();
    let endDate = parseFlexibleDate(payload.endDate);
    if (!endDate) {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);
    }

    // Find matching active plan for reference if available
    const matchingPlan = await MembershipPlan.findOne({
      targetRole: category,
      isActive: true,
    })
      .select('_id')
      .lean();

    const subscription = await UserSubscription.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          userId: user._id,
          ...(matchingPlan ? { planId: matchingPlan._id } : {}),
          status: 'ACTIVE',
          amountPaid: 0,
          startDate,
          endDate,
          nextBillingDate: endDate,
          isAdminGrant: true,
          ...(adminUserId && Types.ObjectId.isValid(adminUserId)
            ? { grantedBy: new Types.ObjectId(adminUserId) }
            : {}),
          category,
          duration: durationLabel,
          durationMonths: months,
        },
      },
      { upsert: true, new: true },
    );

    // Sync role-specific premium benefits immediately
    if (user.role === 'PLAYER') {
      user.cvTier = 'GOLD';
      await user.save();
      await PlayerProfile.findOneAndUpdate({ userId: user._id }, { $set: { cvTier: 'GOLD' } });
    } else if (user.role === 'COACH') {
      user.cvTier = 'GOLD';
      await user.save();
      await CoachProfile.findOneAndUpdate({ userId: user._id }, { $set: { cvTier: 'GOLD' } });
    } else if (user.role === 'ACADEMY') {
      await AcademyProfile.findOneAndUpdate(
        { userId: user._id },
        { $set: { currentPlan: 'PREMIUM', maxTeams: 20 } },
      );
    } else if (user.role === 'CLUB') {
      user.isVerified = true;
      user.verificationStatus = 'APPROVED';
      user.verifiedAt = user.verifiedAt || new Date();
      await user.save();
      await ClubProfile.findOneAndUpdate(
        { userId: user._id },
        { $set: { verificationStatus: 'APPROVED', verifiedAt: new Date() } },
      );
    } else if (user.role === 'AGENT') {
      user.isVerified = true;
      user.verificationStatus = 'APPROVED';
      user.verifiedAt = user.verifiedAt || new Date();
      await user.save();
      await AgentProfile.findOneAndUpdate(
        { userId: user._id },
        { $set: { verificationStatus: 'APPROVED', verifiedAt: new Date() } },
      );
    }

    const startStr = formatDateYMD(startDate);
    const endStr = formatDateYMD(endDate);

    await Notification.create({
      recipientId: user._id,
      recipientRole: user.role,
      title: 'Premium Membership Granted!',
      message: `Congratulations! The K10 Super Admin has granted you ${durationLabel} of direct Premium Membership access (${startStr} to ${endStr}).`,
      type: 'SUBSCRIPTION',
      data: {
        grantId: subscription._id,
        category,
        duration: durationLabel,
        startDate: startStr,
        endDate: endStr,
        status: 'ACTIVE',
      },
    }).catch(() => null);

    return {
      _id: subscription._id,
      grantId: subscription._id,
      userId: user._id,
      userDetails: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        role: user.role,
      },
      name: user.name,
      email: user.email,
      category,
      duration: durationLabel,
      durationMonths: months,
      startDate: startStr,
      endDate: endStr,
      validityPeriod: `${startStr} to ${endStr}`,
      status: 'ACTIVE',
      isAdminGrant: true,
      createdAt: subscription.createdAt,
    };
  }

  async revokeMembershipGrant(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid grant ID');
    }

    // Try finding by UserSubscription._id first, or fallback to userId
    let deleted = await UserSubscription.findByIdAndDelete(id);
    if (!deleted) {
      deleted = await UserSubscription.findOneAndDelete({ userId: id });
    }

    if (!deleted) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Active membership grant not found');
    }

    return {
      deletedGrantId: deleted._id,
      userId: deleted.userId,
      category: deleted.category || null,
      status: 'REVOKED',
    };
  }
}

export const adminService = new AdminService();
