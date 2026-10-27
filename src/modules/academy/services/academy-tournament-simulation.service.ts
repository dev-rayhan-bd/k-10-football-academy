import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { ExtraEvent } from '../academy.model';
import { academyResolverService } from './academy-resolver.service';

export class AcademyTournamentSimulationService {
  /**
   * Helper to generate realistic football match scores
   */
  private generateMatchScore(allowDraw = true): { homeScore: number; awayScore: number } {
    const scores = [0, 1, 1, 2, 2, 3, 0, 1, 2];
    let homeScore = scores[Math.floor(Math.random() * scores.length)];
    let awayScore = scores[Math.floor(Math.random() * scores.length)];

    if (!allowDraw && homeScore === awayScore) {
      if (Math.random() > 0.5) {
        homeScore += 1;
      } else {
        awayScore += 1;
      }
    }

    return { homeScore, awayScore };
  }

  /**
   * Execute Step-by-Step Simulation (Group Stage -> Semifinals -> Grand Final)
   * Supports manual score inputs: payload = { step?: string, scores?: Array<{ matchId, homeScore, awayScore }> }
   */
  async simulateStage(
    eventId: string,
    payload?:
      | string
      | {
          step?: string;
          scores?: Array<{ matchId: string; homeScore: number; awayScore: number }>;
        },
    user?: any,
    academyIdentifier?: string,
  ) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const event = await ExtraEvent.findOne({ _id: eventId, academyId: academy._id });
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    if (!event.isLiveMode || event.tournamentStatus !== 'LIVE GAME') {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Please start tournament and generate fixtures first',
      );
    }

    const currentStep = event.simulationStep || 'GROUP_STAGE';
    const targetStep = typeof payload === 'string' ? payload : payload?.step || currentStep;
    const manualScores = typeof payload === 'object' && payload?.scores ? payload.scores : [];

    if (targetStep === 'GROUP_STAGE') {
      return await this.simulateGroupStage(event, manualScores);
    } else if (targetStep === 'SEMIFINALS') {
      return await this.simulateSemifinals(event, manualScores);
    } else if (targetStep === 'GRAND_FINAL') {
      return await this.simulateGrandFinal(event, manualScores);
    } else {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Invalid or completed simulation step: ${targetStep}`,
      );
    }
  }

  /**
   * Step 1: Simulate Group Stages (Supports manual score inputs)
   */
  private async simulateGroupStage(event: any, manualScores: any[] = []) {
    const fixtures = event.fixtures || [];
    const groupMatches = fixtures.filter((f: any) => f.stage === 'GROUP_STAGE');

    if (groupMatches.length === 0) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'No group stage fixtures found. Please start tournament first.',
      );
    }

    const scoresMap = new Map<string, { homeScore: number; awayScore: number }>();
    for (const s of manualScores) {
      if (s.matchId && s.homeScore !== undefined && s.awayScore !== undefined) {
        scoresMap.set(s.matchId, {
          homeScore: Number(s.homeScore),
          awayScore: Number(s.awayScore),
        });
      }
    }

    // 1. Apply scores for all group matches (either manual input or realistic generated)
    for (const match of groupMatches) {
      const manual = scoresMap.get(match.matchId);
      const generated = this.generateMatchScore(true);
      const homeScore = manual ? manual.homeScore : generated.homeScore;
      const awayScore = manual ? manual.awayScore : generated.awayScore;

      match.homeTeam.score = homeScore;
      match.awayTeam.score = awayScore;
      match.status = 'COMPLETED';
      match.isLiveMatch = false;
      if (homeScore > awayScore) {
        match.winner = match.homeTeam.name;
      } else if (awayScore > homeScore) {
        match.winner = match.awayTeam.name;
      } else {
        match.winner = 'DRAW';
      }
    }

    // 2. Recalculate Standings from simulated match results
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
      s.isQualified = idx < 2; // Top 2 qualify
    });
    groupBStandings.forEach((s, idx) => {
      s.rank = idx + 1;
      s.isQualified = idx < 2; // Top 2 qualify
    });

    event.standings = [...groupAStandings, ...groupBStandings];

    // 3. Populate Semi-finals in Bracket
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
        status: 'LIVE',
      },
      {
        matchId: 'SF-2',
        label: 'Semi-final 2',
        dayLabel: 'DAY 2',
        homeTeamPlaceholder: 'Winner Group B',
        awayTeamPlaceholder: 'Runner-up Group A',
        homeTeam: groupBWinner,
        awayTeam: groupARunnerUp,
        status: 'LIVE',
      },
    ];

    event.simulationStep = 'SEMIFINALS';
    await event.save();

    return {
      message:
        'Group stage simulated successfully! Standings updated and top squads qualified for knockouts.',
      simulationStep: event.simulationStep,
      standings: {
        groupA: groupAStandings,
        groupB: groupBStandings,
      },
      bracket: event.bracket,
    };
  }

  /**
   * Step 2: Simulate Semifinals (Supports manual score inputs)
   */
  private async simulateSemifinals(event: any, manualScores: any[] = []) {
    if (!event.bracket?.semifinals || event.bracket.semifinals.length < 2) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Semi-finals have not been prepared yet. Please simulate group stages first.',
      );
    }

    const sf1 = event.bracket.semifinals[0];
    const sf2 = event.bracket.semifinals[1];

    if (!sf1.homeTeam || !sf1.awayTeam || !sf2.homeTeam || !sf2.awayTeam) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Semi-final teams not determined yet');
    }

    const scoresMap = new Map<string, { homeScore: number; awayScore: number }>();
    for (const s of manualScores) {
      if (s.matchId && s.homeScore !== undefined && s.awayScore !== undefined) {
        scoresMap.set(s.matchId, {
          homeScore: Number(s.homeScore),
          awayScore: Number(s.awayScore),
        });
      }
    }

    // SF 1 Score (manual or generated)
    const manualSF1 = scoresMap.get('SF-1');
    const score1 = manualSF1 || this.generateMatchScore(false);
    sf1.homeScore = score1.homeScore;
    sf1.awayScore = score1.awayScore;
    sf1.winner = score1.homeScore > score1.awayScore ? sf1.homeTeam : sf1.awayTeam;
    sf1.status = 'COMPLETED';

    // SF 2 Score (manual or generated)
    const manualSF2 = scoresMap.get('SF-2');
    const score2 = manualSF2 || this.generateMatchScore(false);
    sf2.homeScore = score2.homeScore;
    sf2.awayScore = score2.awayScore;
    sf2.winner = score2.homeScore > score2.awayScore ? sf2.homeTeam : sf2.awayTeam;
    sf2.status = 'COMPLETED';

    // Populate Grand Final
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

    event.simulationStep = 'GRAND_FINAL';
    await event.save();

    return {
      message: 'Semi-finals completed! Grand Final match determined.',
      simulationStep: event.simulationStep,
      semifinals: event.bracket.semifinals,
      grandFinal: event.bracket.grandFinal,
      bracket: event.bracket,
    };
  }

  /**
   * Step 3: Simulate Grand Final (Supports manual score inputs)
   */
  private async simulateGrandFinal(event: any, manualScores: any[] = []) {
    if (
      !event.bracket?.grandFinal ||
      !event.bracket.grandFinal.homeTeam ||
      !event.bracket.grandFinal.awayTeam
    ) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Grand Final match has not been set up. Please simulate semi-finals first.',
      );
    }

    const scoresMap = new Map<string, { homeScore: number; awayScore: number }>();
    for (const s of manualScores) {
      if (s.matchId && s.homeScore !== undefined && s.awayScore !== undefined) {
        scoresMap.set(s.matchId, {
          homeScore: Number(s.homeScore),
          awayScore: Number(s.awayScore),
        });
      }
    }

    const gf = event.bracket.grandFinal;
    const manualGF = scoresMap.get('GF-1');
    const finalScore = manualGF || this.generateMatchScore(false);

    gf.homeScore = finalScore.homeScore;
    gf.awayScore = finalScore.awayScore;
    gf.winner = finalScore.homeScore > finalScore.awayScore ? gf.homeTeam : gf.awayTeam;
    gf.status = 'COMPLETED';

    const champion = gf.winner;
    const runnerUp = gf.winner === gf.homeTeam ? gf.awayTeam : gf.homeTeam;

    event.bracket.champion = champion;
    event.bracket.runnerUp = runnerUp;
    event.tournamentStatus = 'COMPLETED';
    event.simulationStep = 'COMPLETED';

    await event.save();

    return {
      message: `Championship Grand Final completed! Champion: ${champion}`,
      tournamentStatus: event.tournamentStatus,
      simulationStep: event.simulationStep,
      champion,
      runnerUp,
      grandFinal: gf,
      bracket: event.bracket,
    };
  }
}

export const academyTournamentSimulationService = new AcademyTournamentSimulationService();
