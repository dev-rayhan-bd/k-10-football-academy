/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserModel } from '@/modules/user/user.model';
import { UserStatus } from '@/modules/user/user.interface';
import { PlayerProfile, MatchRecord, PlayerCvValidation } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import {
  AcademyProfile,
  Team,
  GameReport,
  AcademyCoach,
  PlayerEvaluation,
} from '@/modules/academy/academy.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import { ClubProfile, ClubFavourite } from '@/modules/club/club.model';
import {
  IAdminListQuery,
  isIgnoredFilter,
  matchesStatusFilter,
  calculateAge,
  parseAgeRange,
} from './admin.utils';

export class AdminMonitoringService {
  /**
   * 1. SUPER ADMIN — PLAYERS TABLE
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
      const position = (p?.position || u?.position || '').toUpperCase();
      const cvType = (p?.cvTier || u?.cvTier || '').toUpperCase();
      const status: UserStatus = (u?.status || 'ACTIVE') as UserStatus;
      const country = p?.country || u?.country || '';
      const gender = ((u as any)?.gender || (p as any)?.gender || '').toUpperCase();

      rows.push({
        _id: playerIdStr || uid,
        userId: uid,
        playerId: playerIdStr,
        name: p?.fullName || u?.name || '',
        fullName: p?.fullName || u?.name || '',
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

    const search = (query.search || query.searchTerm || '').trim().toLowerCase();
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
      },
      data: paginated,
    };
  }

  /**
   * 2. SUPER ADMIN — COACHES TABLE
   */
  async getCoaches(query: IAdminListQuery) {
    const [
      users,
      profiles,
      academies,
      affiliations,
      teams,
      verifiedPlayers,
      cvValidations,
      evaluations,
    ] = await Promise.all([
      UserModel.find({ role: 'COACH' }).sort({ createdAt: -1 }).lean(),
      CoachProfile.find().sort({ createdAt: -1 }).lean(),
      AcademyProfile.find().select('_id name').lean(),
      AcademyCoach.find({ status: 'APPROVED' }).select('coachId academyId role').lean(),
      Team.find().select('_id academyId coachIds playerIds playersCount').lean(),
      PlayerProfile.find({ verifyingCoachId: { $ne: null } })
        .select('_id verifyingCoachId')
        .lean(),
      PlayerCvValidation.find().select('coachId playerId').lean(),
      PlayerEvaluation.find().select('coachId playerId').lean(),
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

    const playersByKey = new Map<string, Set<string>>();
    const addPlayerToKey = (key?: string | null, playerId?: string | null) => {
      if (!key || !playerId) return;
      if (!playersByKey.has(key)) playersByKey.set(key, new Set());
      playersByKey.get(key)!.add(playerId);
    };

    const teamMap = new Map<string, string[]>();
    for (const t of teams) {
      const tid = t._id.toString();
      const cIds = Array.isArray(t.coachIds) ? t.coachIds : [];
      const pIds = Array.isArray(t.playerIds) ? t.playerIds.map((id) => id.toString()) : [];
      teamMap.set(tid, pIds);
      for (const cid of cIds) {
        const key = cid.toString();
        for (const pid of pIds) {
          addPlayerToKey(key, pid);
        }
      }
    }

    for (const vp of verifiedPlayers) {
      if (vp.verifyingCoachId && vp._id) {
        addPlayerToKey(vp.verifyingCoachId.toString(), vp._id.toString());
      }
    }

    for (const cv of cvValidations) {
      if (cv.coachId && cv.playerId) {
        addPlayerToKey(cv.coachId.toString(), cv.playerId.toString());
      }
    }

    for (const ev of evaluations) {
      if (ev.coachId && ev.playerId) {
        addPlayerToKey(ev.coachId.toString(), ev.playerId.toString());
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

      const roleTitle = (p?.academyRole || aff?.role || p?.title || u?.title || '').toUpperCase();

      const license = p?.licenseStatus || u?.coachingLicenseLevel || u?.licenseStatus || '';

      const uniqueCoachPlayers = new Set<string>();
      if (coachIdStr && playersByKey.has(coachIdStr)) {
        for (const pid of playersByKey.get(coachIdStr)!) uniqueCoachPlayers.add(pid);
      }
      if (playersByKey.has(uid)) {
        for (const pid of playersByKey.get(uid)!) uniqueCoachPlayers.add(pid);
      }
      if (Array.isArray(p?.teamIds)) {
        for (const tid of p.teamIds) {
          const teamPids = teamMap.get(tid.toString()) || [];
          for (const pid of teamPids) uniqueCoachPlayers.add(pid);
        }
      }

      const playersCount = uniqueCoachPlayers.size;

      const cvType = (p?.cvTier || u?.cvTier || '').toUpperCase();
      const status: UserStatus = (u?.status || 'ACTIVE') as UserStatus;

      rows.push({
        _id: coachIdStr || uid,
        userId: uid,
        coachId: coachIdStr,
        name: p?.fullName || u?.name || '',
        fullName: p?.fullName || u?.name || '',
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

    const search = (query.search || query.searchTerm || '').trim().toLowerCase();
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
      },
      data: paginated,
    };
  }

  /**
   * 3. SUPER ADMIN — ACADEMIES TABLE & TOP SUMMARY CARDS
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
      const name = p?.name || u?.academyName || u?.name || '';
      const subtitle = (p?.league || p?.category || u?.category || '').toUpperCase();

      rows.push({
        _id: academyIdStr || uid,
        userId: uid,
        academyId: academyIdStr,
        name,
        academyName: name,
        subtitle,
        category: p?.category || u?.category || '',
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

    const search = (query.search || query.searchTerm || '').trim().toLowerCase();
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
      },
      data: paginated,
    };
  }

  /**
   * 4. SUPER ADMIN — AGENTS TABLE
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
      const name = p?.fullName || p?.name || u?.name || '';

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

    const search = (query.search || query.searchTerm || '').trim().toLowerCase();
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
      },
      data: paginated,
    };
  }

  /**
   * 5. SUPER ADMIN — CLUBS TABLE
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
      const name = p?.name || u?.clubName || u?.name || '';
      const subtitle = (p?.clubType || u?.title || '').toUpperCase();
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

    const search = (query.search || query.searchTerm || '').trim().toLowerCase();
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
      },
      data: paginated,
    };
  }
}

export const adminMonitoringService = new AdminMonitoringService();
