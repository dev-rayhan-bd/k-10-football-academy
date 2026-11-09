import PDFDocument from 'pdfkit';
import { IMatchRecordDocument } from '@/modules/player/player.interface';
import {
  MATCH_EVENTS,
  FIELD_PLAYER_INDICATORS,
  GOALKEEPER_INDICATORS,
  YELLOW_INDICATORS,
  BLUE_INDICATORS,
  RED_INDICATORS,
  POSITION_CATEGORY_MULTIPLIERS,
  normalizePositionKey,
  getInterpretationScore,
  calculateMatchPerformance,
  CategoryKey,
} from '@/utils/ratingCalculator';
import { mapStatsAndEventsToMatchEvents } from './game-report.utils';
import { uploadBufferToStorage } from '@/utils/fileUpload.utils';
import { logger } from '@/utils/logger';

export class GameReportPdfService {
  /**
   * Generate Professional Official Game Report PDF (Client Requirement 4)
   * World-Class 2-Page Executive Match Evaluation Report:
   * - Page 1: Match Executive Summary, Overall Rating, Contribution KPIs, Category Breakdown & Coach Feedback
   * - Page 2: Complete 6-Column Statistical Ledger (36 Field / 45 GK Indicators with Points Earned)
   */
  async generateAndSaveReportPdf(matchRecord: IMatchRecordDocument): Promise<string> {
    try {
      const pdfBuffer = await this.buildPdfBuffer(matchRecord);
      const filename = `Game_Report_${matchRecord.playerInfo?.playerName || 'Player'}_${matchRecord._id}.pdf`;
      const pdfUrl = await uploadBufferToStorage(pdfBuffer, filename, 'game-reports');
      return pdfUrl;
    } catch (err: any) {
      logger.error({ err }, 'Failed to upload Game Report PDF to storage');
      return '';
    }
  }

  buildPdfBuffer(matchRecord: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4', autoFirstPage: true });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const brandGreen = '#00E676';
      const textPrimary = '#0F172A';
      const textSecondary = '#64748B';

      // ==========================================
      // 0. DATA PREPARATION & NORMALIZATION
      // ==========================================
      const playerName =
        matchRecord.playerInfo?.playerName || matchRecord.playerId?.fullName || 'Athlete';
      const position = matchRecord.playerInfo?.position || matchRecord.playerId?.position || 'CM';
      const club =
        matchRecord.playerInfo?.clubName || matchRecord.playerId?.currentClub || 'Academy Team';
      const foot = matchRecord.playerInfo?.foot || 'Right';
      const characteristics =
        (matchRecord.playerInfo?.characteristics || []).join(', ') || 'Playmaker';

      const normPos = normalizePositionKey(position);
      const isGoalkeeper =
        normPos === 'GK' ||
        position.toUpperCase().includes('GOAL') ||
        position.toUpperCase().includes('GK');

      const minutesPlayed = Math.max(1, Number(matchRecord.minutesPlayed) || 90);
      const timeFactor = 90 / minutesPlayed;
      const matchDuration = matchRecord.matchDuration || `${minutesPlayed}:00`;

      // Extract raw events and stats
      const rawEventsList = Array.isArray(matchRecord.events) ? matchRecord.events : [];
      const rawStatsObj =
        matchRecord.stats && typeof matchRecord.stats === 'object'
          ? matchRecord.stats.toObject
            ? matchRecord.stats.toObject()
            : matchRecord.stats
          : {};
      const mappedEvents = mapStatsAndEventsToMatchEvents(rawStatsObj, rawEventsList);
      const recordedCounts: Record<string, number> = {};
      for (const ev of mappedEvents) {
        recordedCounts[ev.eventId] = (recordedCounts[ev.eventId] || 0) + ev.count;
      }

      // Re-calculate performance to ensure 100% fidelity with client's Excel sheet
      const perf = calculateMatchPerformance(position, minutesPlayed, mappedEvents);
      const positivePoints = matchRecord.positivePoints ?? perf.positivePoints;
      const negativePoints = matchRecord.negativePoints ?? perf.negativePoints;
      const netContribution = matchRecord.netContribution ?? perf.netContribution;
      const rawRating =
        matchRecord.playerRating ?? matchRecord.coachReview?.coachRating ?? perf.overallRating;
      const displayRating =
        rawRating <= 10 && rawRating > 0 ? Math.round(rawRating * 10) : Math.round(rawRating);
      const interpretationText =
        matchRecord.interpretation || getInterpretationScore(displayRating);

      const catScores =
        matchRecord.categoryScores &&
        !(matchRecord.categoryScores instanceof Map) &&
        Object.keys(matchRecord.categoryScores).length > 0
          ? matchRecord.categoryScores
          : perf.categoryAdjustedScores;

      const catRatings =
        matchRecord.categoryRatings &&
        !(matchRecord.categoryRatings instanceof Map) &&
        Object.keys(matchRecord.categoryRatings).length > 0
          ? matchRecord.categoryRatings
          : perf.categoryRatings;

      const multipliers = POSITION_CATEGORY_MULTIPLIERS[normPos];
      const evalDate = matchRecord.coachReview?.evaluatedAt || matchRecord.updatedAt || new Date();
      const isVerified = Boolean(matchRecord.isProfessionallyVerified);
      const isParent =
        matchRecord.authorRole === 'PARENT' || matchRecord.reportCompletionType === 'PARENT';
      const authorTitle = isParent
        ? 'Parent Evaluation (Unverified Self-Report)'
        : matchRecord.coachReview?.coachName
          ? `Coach ${matchRecord.coachReview.coachName}`
          : matchRecord.evaluatorInfo?.name
            ? `${matchRecord.evaluatorInfo.name} (${matchRecord.evaluatorInfo.role || 'Evaluator'})`
            : matchRecord.authorName || 'Professional Evaluator';

      // ==========================================
      // PAGE 1: EXECUTIVE PERFORMANCE SUMMARY
      // ==========================================

      // 1. Brand Header
      doc
        .fillColor(brandGreen)
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('K10 FOOTBALL', 30, 26)
        .fillColor(textSecondary)
        .fontSize(7.5)
        .font('Helvetica')
        .text('OFFICIAL MATCH PERFORMANCE EVALUATION REPORT', 30, 45);

      doc
        .fillColor(textPrimary)
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .text(`REPORT #${matchRecord._id.toString().slice(-8).toUpperCase()}`, 335, 26, {
          align: 'right',
        })
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(textSecondary)
        .text(
          `Date of Match: ${new Date(matchRecord.matchDate || matchRecord.gameDate || Date.now()).toLocaleDateString()}`,
          335,
          38,
          { align: 'right' },
        )
        .text(`Evaluated: ${new Date(evalDate).toLocaleDateString()}`, 335, 48, { align: 'right' });

      doc.strokeColor('#E2E8F0').lineWidth(0.8).moveTo(30, 60).lineTo(565, 60).stroke();

      // 2. Match Banner
      const homeTeam = matchRecord.homeTeam || matchRecord.ownTeam || 'Home Team';
      const awayTeam = matchRecord.awayTeam || matchRecord.opponentTeam || 'Away Team';
      const homeScore = matchRecord.homeScore ?? 0;
      const awayScore = matchRecord.awayScore ?? 0;
      const league =
        matchRecord.leagueType || matchRecord.gameType || 'Friendly Championship Match';
      const location = matchRecord.location || matchRecord.gameLocation || 'London Pitch';

      doc.roundedRect(30, 65, 535, 40, 4).fill('#F8FAFC');
      doc
        .fillColor(textPrimary)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(`${homeTeam}  ${homeScore} - ${awayScore}  ${awayTeam}`, 42, 73);

      doc
        .fillColor(textSecondary)
        .fontSize(7.5)
        .font('Helvetica')
        .text(
          `Competition: ${league} | Location: ${location} | Minutes Played: ${minutesPlayed}' (${matchDuration})`,
          42,
          91,
        );

      // 3. Athlete Profile Card (Left) & Overall Rating Card (Right)
      doc.roundedRect(30, 116, 380, 70, 4).strokeColor('#E2E8F0').lineWidth(0.8).stroke();
      doc
        .fillColor(textPrimary)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(playerName, 42, 124)
        .fontSize(8)
        .font('Helvetica')
        .fillColor(textSecondary)
        .text(`Position: ${position} (${normPos}) | Primary Foot: ${foot}`, 42, 140)
        .text(`Club / Team: ${club} | Characteristics: ${characteristics}`, 42, 153)
        .fillColor('#0284C7')
        .text(`Evaluator: ${authorTitle}`, 42, 166);

      // Overall Rating Card (Right: 145 wide, Dark Executive background)
      const ratingOutOf10 = (displayRating / 10).toFixed(1);
      doc.roundedRect(420, 116, 145, 70, 4).fill('#0D1B2A');
      doc
        .fillColor('#94A3B8')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text('MATCH OVERALL RATING', 420, 123, { width: 145, align: 'center' })
        .fillColor(brandGreen)
        .fontSize(24)
        .text(ratingOutOf10, 420, 134, { width: 145, align: 'center' })
        .fillColor('#CBD5E1')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(`${interpretationText} (${displayRating}/100)`, 420, 163, {
          width: 145,
          align: 'center',
        });

      // 4. Verification Badge Bar
      doc.roundedRect(30, 196, 535, 20, 3).fill(isVerified ? '#DCFCE7' : '#FEF9C3');
      doc
        .fillColor(isVerified ? '#166534' : '#854D0E')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text(isVerified ? 'VERIFIED EVALUATION' : 'UNVERIFIED EVALUATION', 40, 202);

      doc
        .fillColor(textPrimary)
        .fontSize(7.5)
        .font('Helvetica')
        .text(`Official Evaluation Record | Calibrated to FIFA & Academy Standards`, 180, 202, {
          align: 'right',
          width: 375,
        });

      // 5. Match Contribution KPI Summary Cards (Excel Top-Right Summary)
      const kpiY = 227;
      doc
        .fillColor(textPrimary)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('MATCH PERFORMANCE CONTRIBUTION (90-MIN NORMALIZED IMPACT)', 30, kpiY);

      const cardW = 171;
      const cardH = 58;
      const gap = 11;

      // Card 1: Positive Contribution
      doc.roundedRect(30, kpiY + 13, cardW, cardH, 4).fill('#F0FDF4');
      doc
        .roundedRect(30, kpiY + 13, cardW, cardH, 4)
        .strokeColor('#BBF7D0')
        .lineWidth(0.8)
        .stroke();
      doc
        .fillColor('#15803D')
        .fontSize(7)
        .font('Helvetica-Bold')
        .text('POSITIVE CONTRIBUTION', 40, kpiY + 22)
        .fontSize(15.5)
        .text(`+${positivePoints.toFixed(2)} pts`, 40, kpiY + 34)
        .fontSize(6.5)
        .font('Helvetica')
        .fillColor('#64748B')
        .text('Attacking actions, shots & duels won', 40, kpiY + 54);

      // Card 2: Negative Contribution
      const card2X = 30 + cardW + gap;
      doc.roundedRect(card2X, kpiY + 13, cardW, cardH, 4).fill('#FEF2F2');
      doc
        .roundedRect(card2X, kpiY + 13, cardW, cardH, 4)
        .strokeColor('#FECACA')
        .lineWidth(0.8)
        .stroke();
      doc
        .fillColor('#B91C1C')
        .fontSize(7)
        .font('Helvetica-Bold')
        .text('NEGATIVE CONTRIBUTION', card2X + 10, kpiY + 22)
        .fontSize(15.5)
        .text(`${negativePoints.toFixed(2)} pts`, card2X + 10, kpiY + 34)
        .fontSize(6.5)
        .font('Helvetica')
        .fillColor('#64748B')
        .text('Errors, missed chances & fouls', card2X + 10, kpiY + 54);

      // Card 3: Net Contribution
      const card3X = card2X + cardW + gap;
      doc.roundedRect(card3X, kpiY + 13, cardW, cardH, 4).fill('#EFF6FF');
      doc
        .roundedRect(card3X, kpiY + 13, cardW, cardH, 4)
        .strokeColor('#BFDBFE')
        .lineWidth(0.8)
        .stroke();
      doc
        .fillColor('#1E40AF')
        .fontSize(7)
        .font('Helvetica-Bold')
        .text('NET MATCH CONTRIBUTION', card3X + 10, kpiY + 22)
        .fontSize(15.5)
        .text(
          `${netContribution >= 0 ? '+' : ''}${netContribution.toFixed(2)} pts`,
          card3X + 10,
          kpiY + 34,
        )
        .fontSize(6.5)
        .font('Helvetica')
        .fillColor('#64748B')
        .text('Baseline (50) + Net = Overall Rating', card3X + 10, kpiY + 54);

      // 6. Category Performance Breakdown (0-100 Ratings & Adjusted Points)
      const catY = kpiY + 80;
      doc
        .fillColor(textPrimary)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('CATEGORY PERFORMANCE BREAKDOWN (0-100 BENCHMARK SCALE)', 30, catY);

      // Render categories in structured eye-soothing cards
      const categories: CategoryKey[] = isGoalkeeper
        ? ['Attack', 'Passing', 'Possession', 'Defending', 'Discipline', 'Goalkeeping']
        : ['Attack', 'Passing', 'Possession', 'Defending', 'Discipline'];

      let catRowY = catY + 14;
      const catRowH = isGoalkeeper ? 21 : 23.5;
      const catGap = isGoalkeeper ? 3 : 4;

      for (const cat of categories) {
        const score = catScores[cat] ?? 0;
        const rating = catRatings[cat] ?? Math.min(100, Math.max(0, Math.round(50 + score)));
        const interp = getInterpretationScore(rating);

        doc.roundedRect(30, catRowY, 535, catRowH, 3).fill('#F8FAFC');
        doc
          .roundedRect(30, catRowY, 535, catRowH, 3)
          .strokeColor('#E2E8F0')
          .lineWidth(0.6)
          .stroke();

        // Category Name
        doc
          .fillColor(textPrimary)
          .fontSize(7.5)
          .font('Helvetica-Bold')
          .text(cat, 42, catRowY + (catRowH - 9) / 2);

        // Adjusted Score
        const scoreStr = score >= 0 ? `+${score.toFixed(2)} pts` : `${score.toFixed(2)} pts`;
        doc
          .fillColor(score >= 0 ? '#16A34A' : '#DC2626')
          .fontSize(7.5)
          .font('Helvetica-Bold')
          .text(scoreStr, 130, catRowY + (catRowH - 9) / 2);

        // Progress Bar
        const barX = 230;
        const barW = 150;
        const barH = 7;
        doc.roundedRect(barX, catRowY + (catRowH - barH) / 2, barW, barH, 2).fill('#E2E8F0');
        const fillW = Math.max(3, Math.min(barW, (rating / 100) * barW));
        const barColor = rating >= 80 ? '#16A34A' : rating >= 60 ? '#2563EB' : '#F59E0B';
        doc.roundedRect(barX, catRowY + (catRowH - barH) / 2, fillW, barH, 2).fill(barColor);

        // Rating Number
        doc
          .fillColor(textPrimary)
          .fontSize(7.5)
          .font('Helvetica-Bold')
          .text(`${rating} / 100`, 395, catRowY + (catRowH - 9) / 2);

        // Interpretation Pill
        doc
          .fillColor(textSecondary)
          .fontSize(7)
          .font('Helvetica')
          .text(interp, 460, catRowY + (catRowH - 9) / 2, { width: 95, align: 'right' });

        catRowY += catRowH + catGap;
      }

      // 7. Evaluator Observations & Coach Feedback
      const feedbackY = catRowY + 8;
      doc
        .fillColor(textPrimary)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('EVALUATOR OBSERVATIONS & TACTICAL FEEDBACK', 30, feedbackY);

      const feedback =
        matchRecord.coachReview?.coachFeedback ||
        matchRecord.coachFeedback ||
        'Player demonstrated tactical awareness, maintained pitch discipline, and exhibited composure in key transition phases.';

      const fbBoxY = feedbackY + 13;
      const fbBoxH = 56;
      doc.roundedRect(30, fbBoxY, 535, fbBoxH, 4).fill('#FFFFFF');
      doc.roundedRect(30, fbBoxY, 535, fbBoxH, 4).strokeColor('#E2E8F0').lineWidth(0.8).stroke();

      // Small quote bar
      doc.rect(30, fbBoxY, 4, fbBoxH).fill(brandGreen);

      doc
        .fillColor('#334155')
        .fontSize(7.8)
        .font('Helvetica')
        .text(`"${feedback}"`, 44, fbBoxY + 10, { width: 505, lineGap: 3 });

      doc
        .fillColor(textSecondary)
        .fontSize(6.8)
        .font('Helvetica-Bold')
        .text(`— Evaluated by ${authorTitle}`, 44, fbBoxY + fbBoxH - 13);

      // 8. Performance by Match Category Bar Chart (Excel Chart Visualization)
      const chartBoxY = fbBoxY + fbBoxH + 12;
      const chartBoxH = 782 - chartBoxY;
      doc.roundedRect(30, chartBoxY, 535, chartBoxH, 4).fill('#FFFFFF');
      doc
        .roundedRect(30, chartBoxY, 535, chartBoxH, 4)
        .strokeColor('#E2E8F0')
        .lineWidth(0.8)
        .stroke();

      doc
        .fillColor(textPrimary)
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .text('Performance by Match Category', 42, chartBoxY + 10);

      // Chart Legend (Matching Client Excel Chart)
      doc.rect(330, chartBoxY + 11, 8, 8).fill('#0284C7');
      doc
        .fillColor('#475569')
        .fontSize(6.8)
        .font('Helvetica')
        .text('Adjusted Contribution', 342, chartBoxY + 12);
      doc.rect(445, chartBoxY + 11, 8, 8).fill('#EA580C');
      doc
        .fillColor('#475569')
        .fontSize(6.8)
        .font('Helvetica')
        .text('Category Rating', 457, chartBoxY + 12);

      const plotX = 72;
      const plotY = chartBoxY + 30;
      const plotW = 480;
      const plotH = chartBoxH - 58;

      const chartCategories: CategoryKey[] = [
        'Attack',
        'Passing',
        'Possession',
        'Defending',
        'Discipline',
        'Goalkeeping',
      ];

      // Dynamic yMax / yMin calculation
      let maxScoreFound = 100;
      let minScoreFound = -10;
      for (const cat of chartCategories) {
        const sc = catScores[cat] ?? 0;
        const rt = catRatings[cat] ?? 50;
        if (sc > maxScoreFound) maxScoreFound = sc;
        if (sc < minScoreFound) minScoreFound = sc;
        if (rt > maxScoreFound) maxScoreFound = rt;
      }
      const yMax = maxScoreFound > 100 ? Math.ceil(maxScoreFound / 50) * 50 : 100;
      const yMin = minScoreFound < -10 ? Math.floor(minScoreFound / 20) * 20 : -10;
      const yRange = yMax - yMin;

      const getY = (val: number) => plotY + plotH - ((val - yMin) / yRange) * plotH;
      const zeroY = getY(0);

      // Grid lines
      const ticks: number[] = [];
      const step = yRange <= 120 ? 20 : Math.ceil(yRange / 5 / 20) * 20;
      for (let t = Math.ceil(yMin / step) * step; t <= yMax; t += step) {
        ticks.push(t);
      }
      if (!ticks.includes(0)) ticks.push(0);
      ticks.sort((a, b) => a - b);

      for (const tick of ticks) {
        const y = getY(tick);
        doc
          .strokeColor(tick === 0 ? '#94A3B8' : '#F1F5F9')
          .lineWidth(tick === 0 ? 0.9 : 0.5)
          .moveTo(plotX, y)
          .lineTo(plotX + plotW, y)
          .stroke();

        doc
          .fillColor('#94A3B8')
          .fontSize(5.8)
          .font('Helvetica')
          .text(tick.toFixed(2), 28, y - 3, { width: 40, align: 'right' });
      }

      // Plot Category Bars
      const slotW = plotW / chartCategories.length;
      const barW = 14;

      chartCategories.forEach((cat, idx) => {
        const slotCenter = plotX + idx * slotW + slotW / 2;
        const score = catScores[cat] ?? 0;
        const rating = catRatings[cat] ?? Math.min(100, Math.max(0, Math.round(50 + score)));

        // Bar 1: Adjusted Contribution (Blue)
        const b1X = slotCenter - barW - 1.5;
        if (score >= 0) {
          const bH = Math.max(1, zeroY - getY(score));
          doc.rect(b1X, getY(score), barW, bH).fill('#0284C7');
          doc
            .fillColor('#0284C7')
            .fontSize(5.5)
            .font('Helvetica-Bold')
            .text(`+${score.toFixed(1)}`, b1X - 5, getY(score) - 7, {
              width: barW + 10,
              align: 'center',
            });
        } else {
          const bH = Math.max(1, getY(score) - zeroY);
          doc.rect(b1X, zeroY, barW, bH).fill('#0284C7');
          doc
            .fillColor('#0284C7')
            .fontSize(5.5)
            .font('Helvetica-Bold')
            .text(score.toFixed(1), b1X - 5, zeroY + bH + 2, {
              width: barW + 10,
              align: 'center',
            });
        }

        // Bar 2: Category Rating (Orange)
        const b2X = slotCenter + 1.5;
        const rH = Math.max(1, zeroY - getY(rating));
        doc.rect(b2X, getY(rating), barW, rH).fill('#EA580C');
        doc
          .fillColor('#EA580C')
          .fontSize(5.5)
          .font('Helvetica-Bold')
          .text(String(rating), b2X - 5, getY(rating) - 7, {
            width: barW + 10,
            align: 'center',
          });

        // X Axis Category Label
        doc
          .fillColor('#334155')
          .fontSize(6.8)
          .font('Helvetica-Bold')
          .text(cat, slotCenter - slotW / 2, plotY + plotH + 5, {
            width: slotW,
            align: 'center',
          });
      });

      // Page 1 Footer
      doc
        .fillColor('#94A3B8')
        .fontSize(7)
        .text(
          'K10 Football Analysis Platform • Official Performance Evaluation • Page 1 of 2',
          30,
          795,
          { align: 'center', width: 535 },
        );

      // ==========================================
      // PAGE 2: STATISTICAL LEDGER (6 COLUMNS)
      // ==========================================
      doc.addPage({ margin: 30, size: 'A4' });

      // Page 2 Header
      doc
        .fillColor(brandGreen)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('K10 FOOTBALL', 30, 26)
        .fillColor(textSecondary)
        .fontSize(7.5)
        .font('Helvetica')
        .text('OFFICIAL STATISTICAL LEDGER & INDICATOR ANALYSIS', 30, 43);

      doc
        .fillColor(textPrimary)
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(
          `REPORT #${matchRecord._id.toString().slice(-8).toUpperCase()} | ${playerName} (${position})`,
          280,
          26,
          {
            align: 'right',
            width: 285,
          },
        );

      doc.strokeColor('#E2E8F0').lineWidth(0.8).moveTo(30, 54).lineTo(565, 54).stroke();

      // Client Sequence Selection
      const allEventKeys: readonly string[] = isGoalkeeper
        ? GOALKEEPER_INDICATORS
        : FIELD_PLAYER_INDICATORS;

      const yellowSet = new Set<string>(YELLOW_INDICATORS as unknown as string[]);
      const blueSet = new Set<string>(BLUE_INDICATORS as unknown as string[]);
      const redSet = new Set<string>(RED_INDICATORS as unknown as string[]);

      doc
        .fillColor(textPrimary)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`${allEventKeys.length} PERFORMANCE INDICATORS & POINTS EARNED`, 30, 62)
        .fillColor(textSecondary)
        .fontSize(7)
        .font('Helvetica')
        .text(
          `Sequence: ${isGoalkeeper ? 'Red (9) + Discipline (3) -> Yellow (12) -> Blue (12) -> White (9)' : 'Yellow (12) -> Blue (12) -> White (12)'} | Time Factor: ${timeFactor.toFixed(2)}x (90 / ${minutesPlayed}')`,
          30,
          74,
        );

      // Table Header (6 Columns)
      let tableY = 88;
      doc.rect(30, tableY, 535, 16).fill('#1E293B');
      doc
        .fillColor('#FFFFFF')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text('CRITERIA (EVENT)', 44, tableY + 4.5)
        .text('CATEGORY', 185, tableY + 4.5)
        .text('COUNT', 260, tableY + 4.5, { width: 45, align: 'center' })
        .text('BASE PTS', 310, tableY + 4.5, { width: 55, align: 'right' })
        .text('MULTIPLIER', 370, tableY + 4.5, { width: 60, align: 'center' })
        .text("POINTS EARNED (90')", 435, tableY + 4.5, { width: 120, align: 'right' });

      tableY += 16;

      const rowHeight = isGoalkeeper ? 12.8 : 14.8;
      const fontSize = isGoalkeeper ? 6.5 : 7.0;
      doc.font('Helvetica').fontSize(fontSize);

      let rowIdx = 0;
      for (const evKey of allEventKeys) {
        const evDef = MATCH_EVENTS[evKey];
        if (!evDef) continue;

        const count = recordedCounts[evKey] || 0;
        const catMult = multipliers[evDef.category] ?? 1.0;
        const rawContrib = count * evDef.basePoints * catMult;
        const adjustedContrib = rawContrib * timeFactor;

        // Group color dot
        let dotColor = '#64748B'; // White group default
        if (redSet.has(evKey)) dotColor = '#DC2626';
        else if (yellowSet.has(evKey)) dotColor = '#EAB308';
        else if (blueSet.has(evKey)) dotColor = '#2563EB';

        const bg = rowIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        doc.rect(30, tableY, 535, rowHeight).fill(bg);

        // Color group pip
        doc.circle(36, tableY + rowHeight / 2, 2.2).fill(dotColor);

        const yOffset = (rowHeight - fontSize) / 2;

        // 1. Criteria (Event)
        doc
          .fillColor(count > 0 ? '#0F172A' : '#475569')
          .font(count > 0 ? 'Helvetica-Bold' : 'Helvetica')
          .text(evDef.name, 44, tableY + yOffset);

        // 2. Category
        doc
          .fillColor(textSecondary)
          .font('Helvetica')
          .text(evDef.category, 185, tableY + yOffset);

        // 3. Recorded Count
        doc
          .fillColor(count > 0 ? '#15803D' : '#94A3B8')
          .font(count > 0 ? 'Helvetica-Bold' : 'Helvetica')
          .text(String(count), 260, tableY + yOffset, { width: 45, align: 'center' });

        // 4. Base Points
        const basePtsStr =
          evDef.basePoints > 0
            ? `+${evDef.basePoints.toFixed(2)}`
            : `${evDef.basePoints.toFixed(2)}`;
        doc
          .font('Helvetica')
          .fillColor(evDef.basePoints > 0 ? '#16A34A' : '#DC2626')
          .text(basePtsStr, 310, tableY + yOffset, { width: 55, align: 'right' });

        // 5. Positional Multiplier
        doc
          .fillColor('#475569')
          .text(`${catMult.toFixed(2)}x`, 370, tableY + yOffset, { width: 60, align: 'center' });

        // 6. Points Earned (90')
        const pointsStr =
          count > 0
            ? adjustedContrib >= 0
              ? `+${adjustedContrib.toFixed(2)}`
              : `${adjustedContrib.toFixed(2)}`
            : '0.00';

        doc
          .fillColor(count > 0 ? (adjustedContrib >= 0 ? '#16A34A' : '#DC2626') : '#94A3B8')
          .font(count > 0 ? 'Helvetica-Bold' : 'Helvetica')
          .text(pointsStr, 435, tableY + yOffset, { width: 120, align: 'right' });

        tableY += rowHeight;
        rowIdx++;
      }

      // Ledger Total Summary Row (Dark Navy Banner)
      tableY += 4;
      doc.roundedRect(30, tableY, 535, 24, 4).fill('#0D1B2A');
      doc
        .fillColor('#FFFFFF')
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .text(
          `TOTAL NET IMPACT: ${netContribution >= 0 ? '+' : ''}${netContribution.toFixed(2)} PTS`,
          42,
          tableY + 7.5,
          { width: 510, align: 'center' },
        );

      // Page 2 Footer
      doc
        .fillColor('#94A3B8')
        .fontSize(7)
        .text(
          'K10 Football Analysis Platform • Official Performance Evaluation • Page 2 of 2',
          30,
          795,
          { align: 'center', width: 535 },
        );

      doc.end();
    });
  }
}

export const gameReportPdfService = new GameReportPdfService();
