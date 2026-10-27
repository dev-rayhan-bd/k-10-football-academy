import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { ExtraEvent } from '../academy.model';
import { academyResolverService } from './academy-resolver.service';
import { formatTournamentClub } from './academy-tournament-registration.service';

const buildClubMap = (clubs: any[]) => {
  const map = new Map<string, any>();
  for (const c of clubs) {
    if (c.clubName) map.set(c.clubName.trim().toLowerCase(), c);
    if (c.name) map.set(c.name.trim().toLowerCase(), c);
  }
  return map;
};

const formatFixtureOutput = (f: any, clubMap?: Map<string, any>) => {
  const homeName = f.homeTeam?.name || f.homeTeam?.clubName || '';
  const awayName = f.awayTeam?.name || f.awayTeam?.clubName || '';
  const homeClub = clubMap ? clubMap.get(homeName.toLowerCase()) : null;
  const awayClub = clubMap ? clubMap.get(awayName.toLowerCase()) : null;

  const homeId =
    f.homeTeam?.clubId || f.homeTeam?._id || (homeClub?._id ? homeClub._id.toString() : undefined);
  const awayId =
    f.awayTeam?.clubId || f.awayTeam?._id || (awayClub?._id ? awayClub._id.toString() : undefined);

  return {
    _id: f._id ? f._id.toString() : undefined,
    matchId: f.matchId,
    matchNo: f.matchNo,
    stage: f.stage,
    group: f.group,
    homeTeam: {
      clubId: homeId,
      _id: homeId,
      name: homeName,
      clubName: homeName,
      logoUrl: f.homeTeam?.logoUrl || homeClub?.logoUrl || '',
      score: f.homeTeam?.score,
    },
    awayTeam: {
      clubId: awayId,
      _id: awayId,
      name: awayName,
      clubName: awayName,
      logoUrl: f.awayTeam?.logoUrl || awayClub?.logoUrl || '',
      score: f.awayTeam?.score,
    },
    pitch: f.pitch || '',
    kickoffTime: f.kickoffTime || '',
    matchDate: f.matchDate || '',
    status: f.status,
    isLiveMatch: !!f.isLiveMatch,
    winner: f.winner || undefined,
  };
};

const formatStandingOutput = (s: any, clubMap?: Map<string, any>) => {
  const name = s.teamName || s.clubName || s.name || '';
  const club = clubMap ? clubMap.get(name.toLowerCase()) : null;
  const cId = s.clubId || s.teamId || (club?._id ? club._id.toString() : undefined);

  return {
    _id: s._id ? s._id.toString() : undefined,
    clubId: cId,
    teamId: cId,
    group: s.group,
    teamName: name,
    clubName: name,
    name,
    logoUrl: s.logoUrl || club?.logoUrl || '',
    p: s.p || 0,
    w: s.w || 0,
    d: s.d || 0,
    l: s.l || 0,
    gf: s.gf || 0,
    ga: s.ga || 0,
    gd: s.gd || 0,
    pts: s.pts || 0,
    rank: s.rank || 1,
    isQualified: !!s.isQualified,
  };
};

export class AcademyTournamentEngineService {
  /**
   * Allocate Clubs to Group A or Group B
   */
  async allocateGroups(
    eventId: string,
    allocations: Array<{
      _id?: string;
      clubId?: string;
      clubName?: string;
      group: 'GROUP A' | 'GROUP B';
    }>,
    user: any,
    academyIdentifier?: string,
  ) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const event = await ExtraEvent.findOne({ _id: eventId, academyId: academy._id });
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    if (!event.registeredClubs || event.registeredClubs.length === 0) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'No clubs registered yet');
    }

    const idMap = new Map<string, 'GROUP A' | 'GROUP B'>();
    const nameMap = new Map<string, 'GROUP A' | 'GROUP B'>();

    for (const alloc of allocations) {
      const targetId = alloc._id || alloc.clubId;
      if (targetId) {
        idMap.set(String(targetId).trim(), alloc.group);
      }
      if (alloc.clubName) {
        nameMap.set(String(alloc.clubName).trim().toLowerCase(), alloc.group);
      }
    }

    let groupACount = 0;
    let groupBCount = 0;
    const fee = event.registrationFee || 0;

    for (const club of event.registeredClubs) {
      const clubIdStr = club._id?.toString();
      const clubNameStr = club.clubName ? club.clubName.trim().toLowerCase() : '';

      const assignedGroup =
        (clubIdStr && idMap.get(clubIdStr)) || (clubNameStr && nameMap.get(clubNameStr));

      if (assignedGroup) {
        if (fee > 0 && club.paymentStatus !== 'PAID') {
          throw new AppError(
            StatusCodes.BAD_REQUEST,
            `Club "${club.clubName}" cannot be allocated to ${assignedGroup} because registration payment is PENDING. Only PAID clubs can enter the tournament.`,
          );
        }
        club.allocatedGroup = assignedGroup;
        if (assignedGroup === 'GROUP A') groupACount++;
        if (assignedGroup === 'GROUP B') groupBCount++;
      }
    }

    event.markModified('registeredClubs');
    await event.save();

    return {
      message: 'Group allocations updated successfully',
      groupACount,
      groupBCount,
      clubs: (event.registeredClubs || []).map(formatTournamentClub),
    };
  }

  /**
   * Start Tournament and Generate Round-Robin Group Stage Fixtures
   * Strictly enforces that only PAID clubs participate!
   */
  async startTournamentAndGenerateFixtures(eventId: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const event = await ExtraEvent.findOne({ _id: eventId, academyId: academy._id });
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    const allClubs = event.registeredClubs || [];
    const fee = event.registrationFee || 0;
    const paidClubs = allClubs.filter((c) => fee === 0 || c.paymentStatus === 'PAID');

    if (paidClubs.length < 4) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Tournament can only start with confirmed PAID clubs. Currently found ${paidClubs.length} paid club(s) out of ${allClubs.length} registered. At least 4 paid clubs are required.`,
      );
    }

    // Auto-allocate ONLY paid clubs if not yet allocated
    let groupA = paidClubs.filter((c) => c.allocatedGroup === 'GROUP A');
    let groupB = paidClubs.filter((c) => c.allocatedGroup === 'GROUP B');

    if (groupA.length === 0 && groupB.length === 0) {
      const half = Math.ceil(paidClubs.length / 2);
      paidClubs.forEach((c, idx) => {
        c.allocatedGroup = idx < half ? 'GROUP A' : 'GROUP B';
      });
      groupA = paidClubs.filter((c) => c.allocatedGroup === 'GROUP A');
      groupB = paidClubs.filter((c) => c.allocatedGroup === 'GROUP B');
    }

    const matchDateStr = event.eventDate
      ? new Date(event.eventDate).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '5 March 2026';

    const pitches = ['PITCH A', 'PITCH B', 'PITCH C', 'PITCH D', 'PITCH E', 'PITCH F'];
    const times = ['10:00', '10:30', '11:00', '11:30', '12:10', '12:40', '13:00', '13:30'];

    const fixtures: any[] = [];
    let matchNo = 1;

    // Helper to generate round-robin matches for a group
    const generateGroupFixtures = (groupClubs: any[], groupName: 'GROUP A' | 'GROUP B') => {
      const count = groupClubs.length;
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const homeClub = groupClubs[i];
          const awayClub = groupClubs[j];
          const homeId = homeClub._id
            ? homeClub._id.toString()
            : homeClub.clubId
              ? homeClub.clubId.toString()
              : undefined;
          const awayId = awayClub._id
            ? awayClub._id.toString()
            : awayClub.clubId
              ? awayClub.clubId.toString()
              : undefined;

          const pitch = pitches[(matchNo - 1) % pitches.length];
          const kickoff = times[(matchNo - 1) % times.length];
          fixtures.push({
            matchId: `M-${matchNo}`,
            matchNo,
            stage: 'GROUP_STAGE',
            group: groupName,
            homeTeam: {
              clubId: homeId,
              _id: homeId,
              name: homeClub.clubName,
              clubName: homeClub.clubName,
              logoUrl: homeClub.logoUrl || '',
              score: undefined,
            },
            awayTeam: {
              clubId: awayId,
              _id: awayId,
              name: awayClub.clubName,
              clubName: awayClub.clubName,
              logoUrl: awayClub.logoUrl || '',
              score: undefined,
            },
            pitch,
            kickoffTime: kickoff,
            matchDate: matchDateStr,
            status: 'LIVE',
            isLiveMatch: true,
          });
          matchNo++;
        }
      }
    };

    generateGroupFixtures(groupA, 'GROUP A');
    generateGroupFixtures(groupB, 'GROUP B');

    // Initialize Standings
    const standings: any[] = [];
    for (const c of groupA) {
      const cId = c._id ? c._id.toString() : c.clubId ? c.clubId.toString() : undefined;
      standings.push({
        _id: new Types.ObjectId(),
        clubId: cId,
        teamId: cId,
        group: 'GROUP A',
        teamName: c.clubName,
        clubName: c.clubName,
        name: c.clubName,
        logoUrl: c.logoUrl || '',
        p: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0,
        rank: 1,
        isQualified: false,
      });
    }
    for (const c of groupB) {
      const cId = c._id ? c._id.toString() : c.clubId ? c.clubId.toString() : undefined;
      standings.push({
        _id: new Types.ObjectId(),
        clubId: cId,
        teamId: cId,
        group: 'GROUP B',
        teamName: c.clubName,
        clubName: c.clubName,
        name: c.clubName,
        logoUrl: c.logoUrl || '',
        p: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0,
        rank: 1,
        isQualified: false,
      });
    }

    // Initialize Bracket Tree (Screenshot Structure)
    const bracket: any = {
      semifinals: [
        {
          matchId: 'SF-1',
          label: 'Semi-final 1',
          dayLabel: 'DAY 2',
          homeTeamPlaceholder: 'Winner Group A',
          awayTeamPlaceholder: 'Runner-up Group B',
          homeTeam: undefined,
          awayTeam: undefined,
          status: 'PENDING',
        },
        {
          matchId: 'SF-2',
          label: 'Semi-final 2',
          dayLabel: 'DAY 2',
          homeTeamPlaceholder: 'Winner Group B',
          awayTeamPlaceholder: 'Runner-up Group A',
          homeTeam: undefined,
          awayTeam: undefined,
          status: 'PENDING',
        },
      ],
      grandFinal: {
        matchId: 'GF-1',
        label: 'Championship Match Grand Final',
        dayLabel: 'DAY 3',
        homeTeamPlaceholder: 'Winner Semi-final 1',
        awayTeamPlaceholder: 'Winner Semi-final 2',
        homeTeam: undefined,
        awayTeam: undefined,
        status: 'PENDING',
      },
    };

    event.tournamentStatus = 'LIVE GAME';
    event.isLiveMode = true;
    event.simulationStep = 'GROUP_STAGE';
    event.fixtures = fixtures;
    event.standings = standings;
    event.bracket = bracket;

    await event.save();

    return {
      message: 'Tournament is now Live! Group stage fixtures generated.',
      tournamentStatus: event.tournamentStatus,
      isLiveMode: event.isLiveMode,
      simulationStep: event.simulationStep,
      fixturesCount: fixtures.length,
      fixtures,
      standings,
      bracket,
    };
  }

  /**
   * Recalculate Standings and Advance Teams to Knockout Bracket
   */
  recalculateStandingsAndBracket(event: any) {
    const fixtures = event.fixtures || [];
    const groupMatches = fixtures.filter((f: any) => f.stage === 'GROUP_STAGE');

    const standingsMap = new Map<string, any>();
    for (const s of event.standings || []) {
      standingsMap.set(s.teamName, {
        group: s.group,
        teamName: s.teamName,
        logoUrl: s.logoUrl || '',
        p: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0,
        rank: 1,
        isQualified: false,
      });
    }

    for (const match of groupMatches) {
      if (
        match.status !== 'COMPLETED' ||
        match.homeTeam.score === undefined ||
        match.awayTeam.score === undefined
      ) {
        continue;
      }

      const home = standingsMap.get(match.homeTeam.name);
      const away = standingsMap.get(match.awayTeam.name);

      if (home && away) {
        home.p += 1;
        away.p += 1;

        home.gf += match.homeTeam.score || 0;
        home.ga += match.awayTeam.score || 0;
        home.gd = home.gf - home.ga;

        away.gf += match.awayTeam.score || 0;
        away.ga += match.homeTeam.score || 0;
        away.gd = away.gf - away.ga;

        if (match.homeTeam.score > match.awayTeam.score) {
          home.w += 1;
          home.pts += 3;
          away.l += 1;
        } else if (match.awayTeam.score > match.homeTeam.score) {
          away.w += 1;
          away.pts += 3;
          home.l += 1;
        } else {
          home.d += 1;
          home.pts += 1;
          away.d += 1;
          away.pts += 1;
        }
      }
    }

    const sortFn = (a: any, b: any) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.teamName.localeCompare(b.teamName);
    };

    const groupAStandings = Array.from(standingsMap.values())
      .filter((s) => s.group === 'GROUP A')
      .sort(sortFn);
    const groupBStandings = Array.from(standingsMap.values())
      .filter((s) => s.group === 'GROUP B')
      .sort(sortFn);

    groupAStandings.forEach((s, idx) => {
      s.rank = idx + 1;
      s.isQualified = idx < 2;
    });
    groupBStandings.forEach((s, idx) => {
      s.rank = idx + 1;
      s.isQualified = idx < 2;
    });

    event.standings = [...groupAStandings, ...groupBStandings];

    // If all group matches completed, advance top 2 of each group to semifinals
    const completedGroupMatches = groupMatches.filter((m: any) => m.status === 'COMPLETED');
    if (completedGroupMatches.length === groupMatches.length && groupMatches.length > 0) {
      if (event.simulationStep === 'GROUP_STAGE' || !event.simulationStep) {
        event.simulationStep = 'SEMIFINALS';
      }

      const groupAWinner = groupAStandings[0]?.teamName || 'Winner Group A';
      const groupARunnerUp = groupAStandings[1]?.teamName || 'Runner-up Group A';
      const groupBWinner = groupBStandings[0]?.teamName || 'Winner Group B';
      const groupBRunnerUp = groupBStandings[1]?.teamName || 'Runner-up Group B';

      event.bracket = event.bracket || {};
      event.bracket.semifinals = [
        {
          matchId: 'SF-1',
          label: 'Semi-final 1',
          dayLabel: 'DAY 2',
          homeTeamPlaceholder: 'Winner Group A',
          awayTeamPlaceholder: 'Runner-up Group B',
          homeTeam: groupAWinner,
          awayTeam: groupBRunnerUp,
          status: event.bracket?.semifinals?.[0]?.status || 'LIVE',
          homeScore: event.bracket?.semifinals?.[0]?.homeScore,
          awayScore: event.bracket?.semifinals?.[0]?.awayScore,
          winner: event.bracket?.semifinals?.[0]?.winner,
        },
        {
          matchId: 'SF-2',
          label: 'Semi-final 2',
          dayLabel: 'DAY 2',
          homeTeamPlaceholder: 'Winner Group B',
          awayTeamPlaceholder: 'Runner-up Group A',
          homeTeam: groupBWinner,
          awayTeam: groupARunnerUp,
          status: event.bracket?.semifinals?.[1]?.status || 'LIVE',
          homeScore: event.bracket?.semifinals?.[1]?.homeScore,
          awayScore: event.bracket?.semifinals?.[1]?.awayScore,
          winner: event.bracket?.semifinals?.[1]?.winner,
        },
      ];
    }
  }

  /**
   * Update Specific Tournament Fixture (Admin manual match score entry & scheduling)
   */
  async updateTournamentFixture(
    eventId: string,
    matchId: string,
    payload: {
      kickoffTime?: string;
      pitch?: string;
      matchDate?: string;
      homeScore?: number;
      awayScore?: number;
      status?: 'SCHEDULED' | 'LIVE' | 'COMPLETED';
    },
    user: any,
    academyIdentifier?: string,
  ) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const event = await ExtraEvent.findOne({ _id: eventId, academyId: academy._id });
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    let updatedMatch: any = null;
    let matchType: 'FIXTURE' | 'SEMIFINAL' | 'GRAND_FINAL' | null = null;

    // Helper to extract scores flexibly from homeScore/awayScore, homeTeam/awayTeam, or team name mapping
    const resolveScores = (homeName?: string, awayName?: string) => {
      let home: number | undefined = undefined;
      let away: number | undefined = undefined;

      if (payload.homeScore !== undefined) home = Number(payload.homeScore);
      else if ((payload as any).homeTeamScore !== undefined)
        home = Number((payload as any).homeTeamScore);
      else if ((payload as any).homeTeam?.score !== undefined)
        home = Number((payload as any).homeTeam.score);

      if (payload.awayScore !== undefined) away = Number(payload.awayScore);
      else if ((payload as any).awayTeamScore !== undefined)
        away = Number((payload as any).awayTeamScore);
      else if ((payload as any).awayTeam?.score !== undefined)
        away = Number((payload as any).awayTeam.score);

      // Support direct team name mapping in payload: e.g. { "Santos FC Academy": 2, "Palmeiras Academy": 1 }
      if (home === undefined && homeName && (payload as any)[homeName] !== undefined) {
        home = Number((payload as any)[homeName]);
      }
      if (away === undefined && awayName && (payload as any)[awayName] !== undefined) {
        away = Number((payload as any)[awayName]);
      }

      return { home, away };
    };

    // 1. Check in regular group fixtures
    const fixture = event.fixtures?.find(
      (f: any) =>
        f.matchId === matchId ||
        f._id?.toString() === matchId ||
        (f.matchNo && String(f.matchNo) === matchId),
    );
    if (fixture) {
      const { home: hScore, away: aScore } = resolveScores(
        fixture.homeTeam.name,
        fixture.awayTeam.name,
      );

      if (payload.kickoffTime !== undefined) fixture.kickoffTime = payload.kickoffTime;
      if (payload.pitch !== undefined) fixture.pitch = payload.pitch;
      if (payload.matchDate !== undefined) fixture.matchDate = payload.matchDate;
      if (payload.status !== undefined) fixture.status = payload.status;

      if (hScore !== undefined && aScore !== undefined) {
        fixture.homeTeam.score = hScore;
        fixture.awayTeam.score = aScore;
        fixture.status = 'COMPLETED';
        fixture.isLiveMatch = false;

        if (hScore > aScore) {
          fixture.winner = fixture.homeTeam.name;
        } else if (aScore > hScore) {
          fixture.winner = fixture.awayTeam.name;
        } else {
          fixture.winner = 'DRAW';
        }

        // Recalculate standings table and advance teams
        this.recalculateStandingsAndBracket(event);
      }

      updatedMatch = fixture;
      matchType = 'FIXTURE';
      event.markModified('fixtures');
    }

    // 2. Check in Semifinals bracket
    const sfMatch = event.bracket?.semifinals?.find((s: any) => s.matchId === matchId);
    if (sfMatch) {
      const { home: hScore, away: aScore } = resolveScores(sfMatch.homeTeam, sfMatch.awayTeam);

      if (hScore !== undefined && aScore !== undefined) {
        sfMatch.homeScore = hScore;
        sfMatch.awayScore = aScore;
        sfMatch.status = 'COMPLETED';
        sfMatch.winner = hScore > aScore ? sfMatch.homeTeam : sfMatch.awayTeam;

        // If both semifinals completed, advance winners to Grand Final
        const sf1 = event.bracket?.semifinals?.[0];
        const sf2 = event.bracket?.semifinals?.[1];
        if (sf1?.winner && sf2?.winner && event.bracket) {
          event.simulationStep = 'GRAND_FINAL';
          event.bracket.grandFinal = {
            matchId: 'GF-1',
            label: 'Championship Match Grand Final',
            dayLabel: 'DAY 3',
            homeTeamPlaceholder: 'Winner Semi-final 1',
            awayTeamPlaceholder: 'Winner Semi-final 2',
            homeTeam: sf1.winner,
            awayTeam: sf2.winner,
            status: 'LIVE',
          };
        }
      }
      updatedMatch = sfMatch;
      matchType = 'SEMIFINAL';
      event.markModified('bracket');
    }

    // 3. Check in Grand Final bracket
    if (
      event.bracket?.grandFinal &&
      (matchId === 'GF-1' || event.bracket.grandFinal.matchId === matchId)
    ) {
      const gf = event.bracket.grandFinal;
      const { home: hScore, away: aScore } = resolveScores(gf.homeTeam, gf.awayTeam);

      if (hScore !== undefined && aScore !== undefined) {
        gf.homeScore = hScore;
        gf.awayScore = aScore;
        gf.status = 'COMPLETED';
        gf.winner = hScore > aScore ? gf.homeTeam : gf.awayTeam;

        if (event.bracket) {
          event.bracket.champion = gf.winner;
          event.bracket.runnerUp = gf.winner === gf.homeTeam ? gf.awayTeam : gf.homeTeam;
        }
        event.tournamentStatus = 'COMPLETED';
        event.simulationStep = 'COMPLETED';
      }
      updatedMatch = gf;
      matchType = 'GRAND_FINAL';
      event.markModified('bracket');
    }

    if (!updatedMatch) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        `Match with ID "${matchId}" not found in fixtures or bracket`,
      );
    }

    event.markModified('standings');
    await event.save();

    return {
      message: `Match ${matchId} score and status recorded successfully. Standings and bracket updated.`,
      matchId,
      matchType,
      updatedMatch,
      standings: event.standings,
      bracket: event.bracket,
      tournamentStatus: event.tournamentStatus,
      simulationStep: event.simulationStep,
    };
  }

  /**
   * Modal-friendly Match Result Entry (Team 1 vs Team 2 with scores)
   * Admin simply fills: Team 1, Goal 1, Team 2, Goal 2.
   * System finds the fixture, applies goals correctly, sets winner, and recalculates standings!
   */
  async recordMatchResult(
    eventId: string,
    payload: {
      team1Id?: string;
      club1Id?: string;
      _id1?: string;
      team1?: string;
      club1?: string;
      score1?: number;
      goal1?: number;
      team1Score?: number;
      team2Id?: string;
      club2Id?: string;
      _id2?: string;
      team2?: string;
      club2?: string;
      score2?: number;
      goal2?: number;
      team2Score?: number;
      matchId?: string;
      pitch?: string;
      kickoffTime?: string;
      matchDate?: string;
    },
    user: any,
    academyIdentifier?: string,
  ) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const event = await ExtraEvent.findOne({ _id: eventId, academyId: academy._id });
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    if (!event.fixtures || event.fixtures.length === 0) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Tournament has not started or fixtures have not been generated yet',
      );
    }

    // Helper to resolve club by _id or name (prioritizing _id)
    const resolveClub = (raw?: string) => {
      if (!raw) return null;
      const str = String(raw).trim();
      // 1. Primary check by _id
      const byId = event.registeredClubs?.find((c: any) => c._id?.toString() === str);
      if (byId) return byId;
      // 2. Fallback check by clubName
      const byName = event.registeredClubs?.find(
        (c: any) => c.clubName && c.clubName.trim().toLowerCase() === str.toLowerCase(),
      );
      if (byName) return byName;
      return null;
    };

    const club1Raw =
      payload.team1Id || payload.club1Id || payload._id1 || payload.team1 || payload.club1;
    const club2Raw =
      payload.team2Id || payload.club2Id || payload._id2 || payload.team2 || payload.club2;

    const club1 = resolveClub(club1Raw);
    const club2 = resolveClub(club2Raw);

    const team1Name = club1 ? club1.clubName : String(club1Raw || '').trim();
    const team2Name = club2 ? club2.clubName : String(club2Raw || '').trim();

    const goal1 =
      payload.goal1 !== undefined
        ? Number(payload.goal1)
        : payload.score1 !== undefined
          ? Number(payload.score1)
          : payload.team1Score !== undefined
            ? Number(payload.team1Score)
            : undefined;
    const goal2 =
      payload.goal2 !== undefined
        ? Number(payload.goal2)
        : payload.score2 !== undefined
          ? Number(payload.score2)
          : payload.team2Score !== undefined
            ? Number(payload.team2Score)
            : undefined;

    if (goal1 === undefined || goal2 === undefined) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Please provide valid goal scores for both teams (goal1 and goal2)',
      );
    }

    let targetMatch: any = null;
    let matchType: 'FIXTURE' | 'SEMIFINAL' | 'GRAND_FINAL' = 'FIXTURE';

    // If matchId provided directly
    if (payload.matchId) {
      targetMatch = event.fixtures.find((f: any) => f.matchId === payload.matchId?.trim());
      if (!targetMatch && event.bracket?.semifinals) {
        targetMatch = event.bracket.semifinals.find(
          (s: any) => s.matchId === payload.matchId?.trim(),
        );
        if (targetMatch) matchType = 'SEMIFINAL';
      }
      if (
        !targetMatch &&
        event.bracket?.grandFinal &&
        event.bracket.grandFinal.matchId === payload.matchId?.trim()
      ) {
        targetMatch = event.bracket.grandFinal;
        matchType = 'GRAND_FINAL';
      }
    }

    // If not matched by matchId, search by the two teams (_id or name)
    if (!targetMatch) {
      if (!team1Name || !team2Name) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'Please provide team1Id/team1 and team2Id/team2 along with goal1 and goal2',
        );
      }

      const t1Lower = team1Name.toLowerCase();
      const t2Lower = team2Name.toLowerCase();

      // Search in group fixtures
      targetMatch = event.fixtures.find((f: any) => {
        const homeLower = f.homeTeam?.name?.toLowerCase();
        const awayLower = f.awayTeam?.name?.toLowerCase();
        return (
          (homeLower === t1Lower && awayLower === t2Lower) ||
          (homeLower === t2Lower && awayLower === t1Lower)
        );
      });

      // Search in semifinals if not in group fixtures
      if (!targetMatch && event.bracket?.semifinals) {
        targetMatch = event.bracket.semifinals.find((s: any) => {
          const homeLower = s.homeTeam?.toLowerCase();
          const awayLower = s.awayTeam?.toLowerCase();
          return (
            (homeLower === t1Lower && awayLower === t2Lower) ||
            (homeLower === t2Lower && awayLower === t1Lower)
          );
        });
        if (targetMatch) matchType = 'SEMIFINAL';
      }

      // Search in grand final
      if (!targetMatch && event.bracket?.grandFinal) {
        const gf = event.bracket.grandFinal;
        const homeLower = gf.homeTeam?.toLowerCase();
        const awayLower = gf.awayTeam?.toLowerCase();
        if (
          (homeLower === t1Lower && awayLower === t2Lower) ||
          (homeLower === t2Lower && awayLower === t1Lower)
        ) {
          targetMatch = gf;
          matchType = 'GRAND_FINAL';
        }
      }
    }

    if (!targetMatch) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        `No scheduled match found between "${team1Name}" and "${team2Name}". Please verify the team names.`,
      );
    }

    // Assign goals to the proper teams regardless of which one was chosen first in the modal
    if (matchType === 'FIXTURE') {
      const isTeam1Home = targetMatch.homeTeam.name.toLowerCase() === team1Name.toLowerCase();
      targetMatch.homeTeam.score = isTeam1Home ? goal1 : goal2;
      targetMatch.awayTeam.score = isTeam1Home ? goal2 : goal1;
      targetMatch.status = 'COMPLETED';
      targetMatch.isLiveMatch = false;

      if (payload.pitch) targetMatch.pitch = payload.pitch;
      if (payload.kickoffTime) targetMatch.kickoffTime = payload.kickoffTime;
      if (payload.matchDate) targetMatch.matchDate = payload.matchDate;

      if (targetMatch.homeTeam.score > targetMatch.awayTeam.score) {
        targetMatch.winner = targetMatch.homeTeam.name;
      } else if (targetMatch.awayTeam.score > targetMatch.homeTeam.score) {
        targetMatch.winner = targetMatch.awayTeam.name;
      } else {
        targetMatch.winner = 'DRAW';
      }

      // Recalculate Standings & advance bracket
      this.recalculateStandingsAndBracket(event);
      event.markModified('fixtures');
    } else if (matchType === 'SEMIFINAL') {
      const isTeam1Home = targetMatch.homeTeam.toLowerCase() === team1Name.toLowerCase();
      targetMatch.homeScore = isTeam1Home ? goal1 : goal2;
      targetMatch.awayScore = isTeam1Home ? goal2 : goal1;
      targetMatch.status = 'COMPLETED';
      targetMatch.winner =
        targetMatch.homeScore > targetMatch.awayScore ? targetMatch.homeTeam : targetMatch.awayTeam;

      // If both semifinals completed, advance to Grand Final
      const sf1 = event.bracket?.semifinals?.[0];
      const sf2 = event.bracket?.semifinals?.[1];
      if (sf1?.winner && sf2?.winner && event.bracket) {
        event.simulationStep = 'GRAND_FINAL';
        event.bracket.grandFinal = {
          matchId: 'GF-1',
          label: 'Championship Match Grand Final',
          dayLabel: 'DAY 3',
          homeTeamPlaceholder: 'Winner Semi-final 1',
          awayTeamPlaceholder: 'Winner Semi-final 2',
          homeTeam: sf1.winner,
          awayTeam: sf2.winner,
          status: 'LIVE',
        };
      }
      event.markModified('bracket');
    } else if (matchType === 'GRAND_FINAL') {
      const isTeam1Home = targetMatch.homeTeam.toLowerCase() === team1Name.toLowerCase();
      targetMatch.homeScore = isTeam1Home ? goal1 : goal2;
      targetMatch.awayScore = isTeam1Home ? goal2 : goal1;
      targetMatch.status = 'COMPLETED';
      targetMatch.winner =
        targetMatch.homeScore > targetMatch.awayScore ? targetMatch.homeTeam : targetMatch.awayTeam;

      if (event.bracket) {
        event.bracket.champion = targetMatch.winner;
        event.bracket.runnerUp =
          targetMatch.winner === targetMatch.homeTeam ? targetMatch.awayTeam : targetMatch.homeTeam;
      }
      event.tournamentStatus = 'COMPLETED';
      event.simulationStep = 'COMPLETED';
      event.markModified('bracket');
    }

    event.markModified('standings');
    await event.save();

    const homeTeamName = matchType === 'FIXTURE' ? targetMatch.homeTeam.name : targetMatch.homeTeam;
    const awayTeamName = matchType === 'FIXTURE' ? targetMatch.awayTeam.name : targetMatch.awayTeam;
    const homeGoals = matchType === 'FIXTURE' ? targetMatch.homeTeam.score : targetMatch.homeScore;
    const awayGoals = matchType === 'FIXTURE' ? targetMatch.awayTeam.score : targetMatch.awayScore;

    const groupAStandings = (event.standings || []).filter((s) => s.group === 'GROUP A');
    const groupBStandings = (event.standings || []).filter((s) => s.group === 'GROUP B');

    return {
      message: `Match result recorded successfully! ${homeTeamName} ${homeGoals} - ${awayGoals} ${awayTeamName}`,
      matchId: targetMatch.matchId,
      matchType,
      result: `${homeTeamName} ${homeGoals} - ${awayGoals} ${awayTeamName}`,
      winner: targetMatch.winner,
      status: targetMatch.status,
      team1: {
        _id: club1?._id,
        name: team1Name,
        goals: goal1,
      },
      team2: {
        _id: club2?._id,
        name: team2Name,
        goals: goal2,
      },
      match: targetMatch,
      standings: {
        groupA: groupAStandings,
        groupB: groupBStandings,
      },
      bracket: event.bracket,
    };
  }

  /**
   * Get Tournament Fixtures List (Admin & Public View)
   */
  async getTournamentFixtures(
    eventId: string,
    query?: { group?: string; stage?: string; status?: string },
  ) {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid event ID');
    }

    const event = await ExtraEvent.findById(eventId).lean();
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    const clubMap = buildClubMap(event.registeredClubs || []);
    let fixtures = (event.fixtures || []).map((f) => formatFixtureOutput(f, clubMap));
    if (query?.group) {
      fixtures = fixtures.filter((f) => f.group === query.group);
    }
    if (query?.stage) {
      fixtures = fixtures.filter((f) => f.stage === query.stage);
    }
    if (query?.status) {
      fixtures = fixtures.filter((f) => f.status === query.status);
    }

    return {
      totalFixtures: fixtures.length,
      fixtures,
      bracket: event.bracket || null,
      tournamentStatus: event.tournamentStatus,
      isLiveMode: !!event.isLiveMode,
      simulationStep: event.simulationStep,
    };
  }

  /**
   * Get Current Tournament Group Allocations (Admin View)
   */
  async getAllocatedGroups(eventId: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const event = await ExtraEvent.findOne({ _id: eventId, academyId: academy._id });
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    // Auto-heal any clubs in database missing an _id
    let modified = false;
    if (event.registeredClubs && event.registeredClubs.length > 0) {
      for (const c of event.registeredClubs) {
        if (!c._id) {
          c._id = new Types.ObjectId();
          modified = true;
        }
      }
      if (modified) {
        event.markModified('registeredClubs');
        await event.save();
      }
    }

    const clubs = (event.registeredClubs || []).map(formatTournamentClub);
    const groupA = clubs.filter((c: any) => c.allocatedGroup === 'GROUP A');
    const groupB = clubs.filter((c: any) => c.allocatedGroup === 'GROUP B');
    const unallocated = clubs.filter((c: any) => !c.allocatedGroup);

    return {
      totalRegistered: clubs.length,
      maxCapacity: event.maxCapacity || 8,
      groupACount: groupA.length,
      groupBCount: groupB.length,
      unallocatedCount: unallocated.length,
      isFullyAllocated: clubs.length >= 8 && groupA.length === 4 && groupB.length === 4,
      groupA,
      groupB,
      unallocated,
      clubs,
    };
  }

  /**
   * Get Tournament Arena (Standings, Fixtures, Bracket, Live Status)
   * Supports tab filtering: ?tab=standings | ?tab=fixtures | ?tab=bracket | ?tab=all
   */
  async getTournamentArena(
    eventId: string,
    options?: { tab?: string; group?: string; stage?: string },
  ) {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid event ID');
    }

    const event = await ExtraEvent.findById(eventId).lean();
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    const clubMap = buildClubMap(event.registeredClubs || []);
    const formattedStandings = (event.standings || []).map((s) => formatStandingOutput(s, clubMap));
    const formattedFixtures = (event.fixtures || []).map((f) => formatFixtureOutput(f, clubMap));

    const groupAStandings = formattedStandings.filter((s) => s.group === 'GROUP A');
    const groupBStandings = formattedStandings.filter((s) => s.group === 'GROUP B');
    const requestedTab = options?.tab?.trim().toLowerCase();

    const baseInfo = {
      tournamentStatus: event.tournamentStatus || 'REGISTRATION',
      isLiveMode: !!event.isLiveMode,
      simulationStep: event.simulationStep || 'NOT_STARTED',
    };

    if (requestedTab === 'standings') {
      return {
        ...baseInfo,
        activeTab: 'standings',
        standings: {
          groupA: groupAStandings,
          groupB: groupBStandings,
        },
      };
    }

    if (requestedTab === 'fixtures') {
      let filteredFixtures = formattedFixtures;
      if (options?.group) {
        filteredFixtures = filteredFixtures.filter((f) => f.group === options.group);
      }
      if (options?.stage) {
        filteredFixtures = filteredFixtures.filter((f) => f.stage === options.stage);
      }
      return {
        ...baseInfo,
        activeTab: 'fixtures',
        totalFixtures: filteredFixtures.length,
        fixtures: filteredFixtures,
      };
    }

    if (requestedTab === 'bracket') {
      return {
        ...baseInfo,
        activeTab: 'bracket',
        bracket: event.bracket || {
          semifinals: [],
          grandFinal: null,
        },
      };
    }

    return {
      ...baseInfo,
      activeTab: 'all',
      standings: {
        groupA: groupAStandings,
        groupB: groupBStandings,
      },
      fixtures: formattedFixtures,
      bracket: event.bracket || {
        semifinals: [],
        grandFinal: null,
      },
    };
  }

  /**
   * Public Fan & Parent Live Portal Data
   */
  async getPublicPortalData(eventId: string) {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid event ID');
    }

    const event = await ExtraEvent.findById(eventId).lean();
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    const clubMap = buildClubMap(event.registeredClubs || []);
    const formattedStandings = (event.standings || []).map((s) => formatStandingOutput(s, clubMap));
    const formattedFixtures = (event.fixtures || []).map((f) => formatFixtureOutput(f, clubMap));

    const groupAStandings = formattedStandings.filter((s) => s.group === 'GROUP A');
    const groupBStandings = formattedStandings.filter((s) => s.group === 'GROUP B');

    return {
      eventInfo: {
        _id: event._id,
        eventName: event.eventName,
        ageGroup: event.ageGroup,
        formattedDate: event.formattedDateRange || '',
        eventDate: event.eventDate,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
        latitude: event.latitude,
        longitude: event.longitude,
        registrationFee: event.registrationFee,
        currency: event.currency || '£',
        contactPerson: event.contactPerson,
        contactPhone: event.contactPhone,
        contactEmail: event.contactEmail,
        tournamentStatus: event.tournamentStatus || 'REGISTRATION',
        isLiveMode: !!event.isLiveMode,
      },
      arena: {
        standings: {
          groupA: groupAStandings,
          groupB: groupBStandings,
        },
        fixtures: formattedFixtures,
        bracket: event.bracket || null,
      },
      bracket: event.bracket || null,
      shareUrl: `/dashboard/academy/management/extra-events/${event._id}`,
    };
  }

  /**
   * Reset Tournament Flow back to Registration Mode
   */
  async resetTournamentFlow(eventId: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const event = await ExtraEvent.findOne({ _id: eventId, academyId: academy._id });
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    event.tournamentStatus = 'REGISTRATION';
    event.isLiveMode = false;
    event.simulationStep = 'NOT_STARTED';
    event.fixtures = [];
    event.standings = [];
    event.bracket = undefined;

    await event.save();

    return {
      message: 'Tournament flow has been reset to registration and preview mode.',
      tournamentStatus: event.tournamentStatus,
      isLiveMode: event.isLiveMode,
      simulationStep: event.simulationStep,
    };
  }
}

export const academyTournamentEngineService = new AcademyTournamentEngineService();
