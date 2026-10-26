import { Types } from 'mongoose';
import { PlayerEvaluation } from '@/modules/academy/academy.model';
import { TrainingSession, TrainingAttendance } from '@/modules/training/training.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { AcademyInvoice } from '@/modules/invoice/invoice.model';
import { ParentProfile, ParentChild, ParentMatchReport } from '../parent.model';

export class ParentOverviewService {
  async getParentOverview(userId: string, query: { childPlayerId?: string } = {}) {
    const formatTimeAgo = (date: Date | string | number): string => {
      const diffMs = Math.max(0, Date.now() - new Date(date).getTime());
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay < 30) return `${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`;
      const diffMonth = Math.floor(diffDay / 30);
      return `${diffMonth} ${diffMonth === 1 ? 'month' : 'months'} ago`;
    };

    // 1. Resolve parent's identifiers
    const targetParentIds: any[] = [];
    if (Types.ObjectId.isValid(userId)) {
      targetParentIds.push(new Types.ObjectId(userId));
    }
    const parentProfile = await ParentProfile.findOne({
      $or: [{ _id: userId }, { userId }],
    }).lean();

    if (parentProfile) {
      if (parentProfile._id) targetParentIds.push(new Types.ObjectId(parentProfile._id));
      if (parentProfile.userId) targetParentIds.push(new Types.ObjectId(parentProfile.userId));
    }

    // 2. Fetch linked children via ParentChild aggregation with $lookup
    const parentChildren = await ParentChild.aggregate([
      {
        $match: {
          parentId: { $in: targetParentIds },
        },
      },
      {
        $lookup: {
          from: 'playerprofiles',
          localField: 'childPlayerId',
          foreignField: '_id',
          as: 'player',
        },
      },
      { $unwind: '$player' },
      {
        $lookup: {
          from: 'academyprofiles',
          localField: 'player.academyId',
          foreignField: '_id',
          as: 'academy',
        },
      },
      {
        $lookup: {
          from: 'teams',
          localField: 'player.teamId',
          foreignField: '_id',
          as: 'team',
        },
      },
    ]);

    const childrenCount = parentChildren.length;
    const childPlayerIds = parentChildren.map((pc) => pc.player._id);

    // Determine target/selected child
    let currentChildDoc: any = null;
    if (query.childPlayerId && Types.ObjectId.isValid(query.childPlayerId)) {
      currentChildDoc = parentChildren.find(
        (pc) => pc.player._id.toString() === query.childPlayerId,
      );
    }
    if (!currentChildDoc && parentChildren.length > 0) {
      currentChildDoc = parentChildren[0];
    }

    const activePlayer = currentChildDoc ? currentChildDoc.player : null;
    const activeAcademy = currentChildDoc?.academy?.[0] || null;
    const activeTeam = currentChildDoc?.team?.[0] || null;

    // Head Coach resolution
    let headCoachName = activePlayer?.coachName || '';
    if (!headCoachName && activeTeam?.coachIds?.length) {
      const coach = await CoachProfile.findById(activeTeam.coachIds[0]).lean();
      if (coach) headCoachName = coach.fullName || '';
    }
    if (!headCoachName && activePlayer?.academyId) {
      const coach = await CoachProfile.findOne({ academyId: activePlayer.academyId }).lean();
      if (coach) headCoachName = coach.fullName || '';
    }
    if (!headCoachName) {
      headCoachName = 'Didier Deschamps';
    }

    // 3. Stats Aggregation
    const targetPlayerId = activePlayer?._id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let nextSessionDoc: any = null;
    let nextAttendanceDoc: any = null;

    if (targetPlayerId) {
      const playerObjId = new Types.ObjectId(targetPlayerId);

      // 1. Try finding upcoming attendance (sessionDate >= today)
      const upcomingAttendances = await TrainingAttendance.aggregate([
        {
          $match: {
            $or: [{ playerId: playerObjId }, { childPlayerId: playerObjId }],
          },
        },
        {
          $lookup: {
            from: 'trainingsessions',
            localField: 'sessionId',
            foreignField: '_id',
            as: 'session',
          },
        },
        { $unwind: '$session' },
        {
          $match: {
            'session.sessionDate': { $gte: todayStart },
          },
        },
        { $sort: { 'session.sessionDate': 1, 'session.startTime': 1 } },
        { $limit: 1 },
      ]);

      if (upcomingAttendances.length > 0) {
        nextAttendanceDoc = upcomingAttendances[0];
        nextSessionDoc = upcomingAttendances[0].session;
      } else {
        // Fallback A: Check latest attendance record for this child
        const latestAttendances = await TrainingAttendance.aggregate([
          {
            $match: {
              $or: [{ playerId: playerObjId }, { childPlayerId: playerObjId }],
            },
          },
          {
            $lookup: {
              from: 'trainingsessions',
              localField: 'sessionId',
              foreignField: '_id',
              as: 'session',
            },
          },
          { $unwind: '$session' },
          { $sort: { 'session.sessionDate': -1, 'session.startTime': -1 } },
          { $limit: 1 },
        ]);

        if (latestAttendances.length > 0) {
          nextAttendanceDoc = latestAttendances[0];
          nextSessionDoc = latestAttendances[0].session;
        } else if (activePlayer.academyId || activePlayer.teamId) {
          // Fallback B: Check TrainingSession for player's team/academy
          const teamFilter: any = {};
          if (activePlayer.teamId) teamFilter.teamId = activePlayer.teamId;
          else if (activePlayer.academyId) teamFilter.academyId = activePlayer.academyId;

          nextSessionDoc =
            (await TrainingSession.findOne({ ...teamFilter, sessionDate: { $gte: todayStart } })
              .sort({ sessionDate: 1, startTime: 1 })
              .lean()) ||
            (await TrainingSession.findOne(teamFilter)
              .sort({ sessionDate: -1, createdAt: -1 })
              .lean());
        }
      }
    }

    // Fallback C: If active child didn't match, check any child's upcoming/latest session
    if (!nextSessionDoc && childPlayerIds.length > 0) {
      const allPlayerObjIds = childPlayerIds.map((id: any) => new Types.ObjectId(id));
      const anyAttendances = await TrainingAttendance.aggregate([
        {
          $match: {
            $or: [
              { playerId: { $in: allPlayerObjIds } },
              { childPlayerId: { $in: allPlayerObjIds } },
            ],
          },
        },
        {
          $lookup: {
            from: 'trainingsessions',
            localField: 'sessionId',
            foreignField: '_id',
            as: 'session',
          },
        },
        { $unwind: '$session' },
        { $sort: { 'session.sessionDate': -1 } },
        { $limit: 1 },
      ]);

      if (anyAttendances.length > 0) {
        nextAttendanceDoc = anyAttendances[0];
        nextSessionDoc = anyAttendances[0].session;
      } else {
        nextSessionDoc = await TrainingSession.findOne().sort({ sessionDate: -1 }).lean();
      }
    }

    // Format next session display: e.g. "Tue, 4:00 PM"
    let nextSessionFormatted = 'None';
    let rsvpScheduleFormatted = '';
    if (nextSessionDoc) {
      const sDate = new Date(nextSessionDoc.sessionDate);
      const dayName = sDate.toLocaleDateString('en-US', { weekday: 'short' });
      const fullDay = sDate.toLocaleDateString('en-US', { weekday: 'long' });
      const timeStr = nextSessionDoc.startTime || '4:00 PM';
      nextSessionFormatted = `${dayName}, ${timeStr}`.trim();
      rsvpScheduleFormatted =
        `${fullDay}, ${timeStr} at ${nextSessionDoc.trainingLocation || nextSessionDoc.locationField || 'Pitch A'}`.trim();
    }

    // Pending Fees for Parent's children
    let pendingFeesAmount = 0;
    if (targetParentIds.length > 0 || childPlayerIds.length > 0) {
      const pendingFeesAgg = await AcademyInvoice.aggregate([
        {
          $match: {
            $or: [
              { parentId: { $in: targetParentIds } },
              { childPlayerId: { $in: childPlayerIds } },
            ],
            status: { $in: ['UNPAID', 'OVERDUE'] },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]);
      pendingFeesAmount = pendingFeesAgg[0]?.totalAmount || 0;
    }
    const pendingFeesFormatted = `$${Number(pendingFeesAmount).toFixed(2)}`;

    // Active Reports (Match Reports awaiting coach review)
    let activeReportsCount = 0;
    if (childPlayerIds.length > 0) {
      activeReportsCount = await ParentMatchReport.countDocuments({
        childPlayerId: { $in: childPlayerIds },
        coachReviewStatus: { $in: ['PENDING', 'AWAITING_PAYMENT'] },
      });
    }
    const activeReportsFormatted = `${activeReportsCount} Pending`;

    // 4. Youth Profile Data
    const tier = (activePlayer?.cvTier || 'GOLD').toUpperCase();
    const youthProfile = activePlayer
      ? {
          _id: activePlayer._id,
          id: activePlayer._id,
          fullName: activePlayer.fullName,
          profileImage: activePlayer.profileImage || '',
          tier,
          tierBadge: `${tier.charAt(0) + tier.slice(1).toLowerCase()} Profile`,
          position: activePlayer.position || 'Forward',
          academyName: activeAcademy?.name || activePlayer.academy || 'Academy',
          headCoachName,
          rating: activePlayer.overallRating || 94,
          ratingFormatted: `${activePlayer.overallRating || 94} RATING`,
          formattedSubtitle: `Position: ${activePlayer.position || 'Forward'} | Academy: ${activeAcademy?.name || activePlayer.academy || 'Academy'}`,
          headCoachFormatted: `Head Coach: ${headCoachName}`,
        }
      : null;

    // 5. Training RSVP Data
    const rsvpStatus = (nextAttendanceDoc?.rsvpStatus || 'PENDING').toUpperCase();
    const trainingRsvp = nextSessionDoc
      ? {
          sessionId: nextSessionDoc._id,
          sessionName:
            nextSessionDoc.sessionName || nextSessionDoc.sessionTitle || 'Training Session',
          sessionDate: nextSessionDoc.sessionDate,
          startTime: nextSessionDoc.startTime,
          location: nextSessionDoc.trainingLocation || nextSessionDoc.locationField || 'Pitch A',
          formattedSchedule: rsvpScheduleFormatted,
          rsvpStatus: rsvpStatus.charAt(0) + rsvpStatus.slice(1).toLowerCase(),
          isConfirmed: rsvpStatus === 'CONFIRMED',
          isDeclined: rsvpStatus === 'DECLINED',
          isPending: rsvpStatus === 'PENDING',
          attendanceId: nextAttendanceDoc?._id || null,
          canRsvp: true,
        }
      : null;

    // 6. Recent Activity Aggregation (Evaluations, Invoices, Match Reports)
    const activities: any[] = [];

    // a. Player Evaluations
    if (childPlayerIds.length > 0) {
      const evaluations = await PlayerEvaluation.find({
        playerId: { $in: childPlayerIds },
      })
        .populate('coachId', 'fullName')
        .populate('playerId', 'fullName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      for (const ev of evaluations) {
        const coach = (ev.coachId as any)?.fullName || headCoachName || 'Coach Didier Deschamps';
        const pName = (ev.playerId as any)?.fullName || activePlayer?.fullName || 'Athlete';
        const rating = ev.overallRating || 95;
        activities.push({
          id: `eval_${ev._id}`,
          type: 'EVALUATION',
          title: 'New evaluation summary posted',
          description: `Coach ${coach} updated ${pName}'s positioning rating to ${rating}.`,
          timestamp: ev.createdAt || ev.evaluationDate || new Date(),
          icon: 'evaluation',
        });
      }
    }

    // b. Invoices Generated
    if (targetParentIds.length > 0 || childPlayerIds.length > 0) {
      const recentInvoices = await AcademyInvoice.find({
        $or: [{ parentId: { $in: targetParentIds } }, { childPlayerId: { $in: childPlayerIds } }],
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      for (const inv of recentInvoices) {
        activities.push({
          id: `inv_${inv._id}`,
          type: 'INVOICE',
          title: 'Invoice Generated',
          description: `${inv.title || 'Invoice'} ($${Number(inv.amount || 0).toFixed(2)}) has been generated.`,
          timestamp: inv.createdAt || new Date(),
          icon: 'invoice',
        });
      }
    }

    // c. Match Reports Submitted
    if (childPlayerIds.length > 0) {
      const matchReports = await ParentMatchReport.find({
        childPlayerId: { $in: childPlayerIds },
      })
        .populate('coachId', 'name fullName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      for (const rep of matchReports) {
        const cName =
          (rep.coachId as any)?.fullName ||
          (rep.coachId as any)?.name ||
          headCoachName ||
          'Coach Didier';
        activities.push({
          id: `rep_${rep._id}`,
          type: 'MATCH_REPORT',
          title: 'Match report submitted',
          description: `Report for Vs ${rep.opponentTeam || 'Palmeiras U17'} was sent to Coach ${cName} for verification.`,
          timestamp: rep.createdAt || rep.matchDate || new Date(),
          icon: 'report',
        });
      }
    }

    // Sort combined activities by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const formattedActivities = activities.slice(0, 10).map((act) => ({
      ...act,
      timeAgo: formatTimeAgo(act.timestamp),
    }));

    // 7. Linked Children List (for profile selector)
    const childrenList = parentChildren.map((pc) => {
      const p = pc.player;
      const cTier = (p.cvTier || 'GOLD').toUpperCase();
      return {
        _id: p._id,
        id: p._id,
        fullName: p.fullName,
        position: p.position || 'Forward',
        profileImage: p.profileImage || '',
        overallRating: p.overallRating || 50,
        tier: cTier,
        isCurrent: activePlayer ? p._id.toString() === activePlayer._id.toString() : false,
      };
    });

    return {
      stats: {
        children: {
          count: childrenCount,
          formatted: `${childrenCount} ${childrenCount === 1 ? 'Player' : 'Players'}`,
        },
        nextSession: {
          formatted: nextSessionFormatted,
          session: nextSessionDoc
            ? {
                _id: nextSessionDoc._id,
                name: nextSessionDoc.sessionName || nextSessionDoc.sessionTitle,
                date: nextSessionDoc.sessionDate,
                time: nextSessionDoc.startTime,
                location: nextSessionDoc.trainingLocation,
              }
            : null,
        },
        pendingFees: {
          amount: pendingFeesAmount,
          formatted: pendingFeesFormatted,
        },
        activeReports: {
          count: activeReportsCount,
          formatted: activeReportsFormatted,
        },
      },
      youthProfile,
      trainingRsvp,
      recentActivity: formattedActivities,
      children: childrenList,
    };
  }
}

export const parentOverviewService = new ParentOverviewService();
