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

    const targetPlayerObjIds = targetPlayerId
      ? [new Types.ObjectId(targetPlayerId)]
      : childPlayerIds.map((id: any) => new Types.ObjectId(id));

    const formatRsvpItem = (sessionDoc: any, attendanceDoc: any) => {
      if (!sessionDoc) return null;
      const sDate = new Date(sessionDoc.sessionDate);
      const fullDay = sDate.toLocaleDateString('en-US', { weekday: 'long' });
      const timeStr = sessionDoc.startTime || '9:00 AM';
      const loc =
        sessionDoc.trainingLocation || sessionDoc.locationField || sessionDoc.location || 'Pitch A';
      const formattedSched = `${fullDay}, ${timeStr} at ${loc}`.trim();
      const status = (attendanceDoc?.rsvpStatus || 'PENDING').toUpperCase();

      return {
        sessionId: sessionDoc._id,
        sessionName: sessionDoc.sessionName || sessionDoc.sessionTitle || 'Training Session',
        sessionDate: sessionDoc.sessionDate,
        startTime: timeStr,
        location: loc,
        formattedSchedule: formattedSched,
        rsvpStatus: status.charAt(0) + status.slice(1).toLowerCase(),
        isConfirmed: status === 'CONFIRMED',
        isDeclined: status === 'DECLINED',
        isPending: status === 'PENDING',
        attendanceId: attendanceDoc?._id || null,
        canRsvp: true,
      };
    };

    let upcomingRsvpList: any[] = [];
    let nextSessionDoc: any = null;

    if (targetPlayerObjIds.length > 0) {
      // 1. Find upcoming attendances (sessionDate >= today)
      const upcomingAttendances = await TrainingAttendance.aggregate([
        {
          $match: {
            $or: [
              { playerId: { $in: targetPlayerObjIds } },
              { childPlayerId: { $in: targetPlayerObjIds } },
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
        {
          $match: {
            'session.sessionDate': { $gte: todayStart },
          },
        },
        { $sort: { 'session.sessionDate': 1, 'session.startTime': 1 } },
        { $limit: 20 },
      ]);

      const sessionRsvpMap = new Map<string, any>();
      for (const att of upcomingAttendances) {
        const sId = att.session?._id?.toString();
        if (sId && !sessionRsvpMap.has(sId)) {
          const item = formatRsvpItem(att.session, att);
          if (item) sessionRsvpMap.set(sId, item);
        }
      }

      // Check upcoming team/academy sessions for active player
      const teamFilter: any = {};
      if (activePlayer?.teamId) teamFilter.teamId = activePlayer.teamId;
      else if (activePlayer?.academyId) teamFilter.academyId = activePlayer.academyId;

      if (Object.keys(teamFilter).length > 0) {
        const upcomingTeamSessions = await TrainingSession.find({
          ...teamFilter,
          sessionDate: { $gte: todayStart },
        })
          .sort({ sessionDate: 1, startTime: 1 })
          .limit(20)
          .lean();

        for (const sess of upcomingTeamSessions) {
          const sId = sess._id.toString();
          if (!sessionRsvpMap.has(sId)) {
            const existingAtt = await TrainingAttendance.findOne({
              sessionId: sess._id,
              $or: [
                { playerId: { $in: targetPlayerObjIds } },
                { childPlayerId: { $in: targetPlayerObjIds } },
              ],
            }).lean();
            const item = formatRsvpItem(sess, existingAtt);
            if (item) sessionRsvpMap.set(sId, item);
          }
        }
      }

      upcomingRsvpList = Array.from(sessionRsvpMap.values());
    }

    // Set nextSessionDoc for summary card display (only from upcoming sessions)
    if (upcomingRsvpList.length > 0) {
      const firstItem = upcomingRsvpList[0];
      nextSessionDoc = {
        _id: firstItem.sessionId,
        sessionName: firstItem.sessionName,
        sessionTitle: firstItem.sessionName,
        sessionDate: firstItem.sessionDate,
        startTime: firstItem.startTime,
        trainingLocation: firstItem.location,
      };
    }

    // Format next session display: e.g. "Tue, 4:00 PM"
    let nextSessionFormatted = 'None';
    if (nextSessionDoc) {
      const sDate = new Date(nextSessionDoc.sessionDate);
      const dayName = sDate.toLocaleDateString('en-US', { weekday: 'short' });
      const timeStr = nextSessionDoc.startTime || '4:00 PM';
      nextSessionFormatted = `${dayName}, ${timeStr}`.trim();
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

    // 5. Training RSVP Data (array of upcoming training RSVP items)
    const trainingRsvp = upcomingRsvpList;

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
