/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import {
  AcademyProfile,
  GameReport,
  AcademyFinanceTransaction,
  ExtraEvent,
} from '@/modules/academy/academy.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import { ClubProfile } from '@/modules/club/club.model';
import { ParentMatchReport } from '@/modules/parent/parent.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { ShopOrder } from '@/modules/shop/shop.model';
import { PlatformPayment, AdminPaymentStatus } from '../admin.model';
import {
  IAdminPaymentQuery,
  isIgnoredFilter,
  parseFlexibleDate,
  formatDateYMD,
} from './admin.utils';

interface IUnifiedPaymentRow {
  _id: string;
  paymentId: string;
  sourceId: string;
  sourceModel: string;
  type: string;
  category: 'SUBSCRIPTION' | 'GAME_REPORT' | 'TOURNAMENT' | 'EVENT' | 'SHOP' | 'OTHER';
  subType: string;
  userOrEntity: string;
  entity: {
    _id: string | null;
    userId: string | null;
    profileId: string | null;
    name: string;
    email: string;
    role: string;
    avatar: string;
  };
  amount: number;
  spend: number;
  commissionPaid: number;
  commissionRate: string;
  commissionRecipient: string;
  adminEarnings: number;
  currency: string;
  date: string;
  rawDate: Date;
  status: AdminPaymentStatus;
  rawStatus: string;
  paymentMethod: string;
  transactionId: string;
  notes: string;
  createdAt: Date;
}

const normalizePaymentStatus = (raw?: string): AdminPaymentStatus => {
  const s = String(raw || 'PENDING')
    .trim()
    .toUpperCase();
  if (['COMPLETED', 'PAID', 'ACTIVE', 'APPROVED', 'EVALUATED'].includes(s)) return 'COMPLETED';
  if (['FAILED', 'REJECTED'].includes(s)) return 'FAILED';
  if (s === 'REFUNDED') return 'REFUNDED';
  if (s === 'CANCELLED') return 'CANCELLED';
  return 'PENDING';
};

const normalizePaymentCategory = (
  input?: string,
): 'SUBSCRIPTION' | 'GAME_REPORT' | 'TOURNAMENT' | 'EVENT' | 'SHOP' | 'OTHER' => {
  const s = String(input || '')
    .trim()
    .toUpperCase();
  if (s.includes('SUBSCRIPTION') || s.includes('MEMBERSHIP') || s.includes('PLAN')) {
    return 'SUBSCRIPTION';
  }
  if (
    s.includes('GAME') ||
    s.includes('REPORT') ||
    s.includes('EVALUATION') ||
    s.includes('MATCH')
  ) {
    return 'GAME_REPORT';
  }
  if (s.includes('TOURNAMENT')) return 'TOURNAMENT';
  if (s.includes('EVENT')) return 'EVENT';
  if (s.includes('SHOP') || s.includes('STORE') || s.includes('ORDER')) return 'SHOP';
  return 'OTHER';
};

export class AdminPaymentsService {
  /**
   * Collects and unifies all real platform payment streams strictly from DB values (zero fallback inflation, zero duplicate counting).
   */
  private async collectAllPlatformPayments(
    includeFreeGrants = false,
  ): Promise<IUnifiedPaymentRow[]> {
    const [
      subscriptions,
      matchRecords,
      parentReports,
      financeTxns,
      gameReports,
      shopOrders,
      extraEvents,
      platformPayments,
      academies,
      clubs,
      agents,
      players,
      coaches,
    ] = await Promise.all([
      UserSubscription.find()
        .populate('userId', 'name email role avatar clubName academyName agencyName')
        .populate('planId', 'title planName targetRole price billingCycle currency')
        .sort({ createdAt: 1 })
        .lean(),
      MatchRecord.find({
        $or: [{ 'coachReview.paymentStatus': 'PAID' }, { 'coachReview.paymentAmount': { $gt: 0 } }],
      })
        .populate('playerId', 'fullName userId academyId academy currentClub profileImage')
        .sort({ createdAt: 1 })
        .lean(),
      ParentMatchReport.find({
        $or: [
          { paymentStatus: 'PAID' },
          { coachReviewStatus: 'AWAITING_PAYMENT' },
          { transactionId: { $exists: true, $nin: [null, ''] } },
        ],
      })
        .populate('parentId', 'userId firstName lastName academyId')
        .populate('childPlayerId', 'fullName userId academyId academy currentClub profileImage')
        .sort({ createdAt: 1 })
        .lean(),
      AcademyFinanceTransaction.find()
        .populate('academyId', 'name userId logo')
        .populate('playerId', 'fullName userId profileImage')
        .sort({ transactionDate: 1, createdAt: 1 })
        .lean(),
      GameReport.find({
        $or: [{ paymentStatus: 'PAID' }, { price: { $gt: 0 } }],
      })
        .populate('academyId', 'name userId logo')
        .populate('playerId', 'fullName userId profileImage')
        .sort({ createdAt: 1 })
        .lean(),
      ShopOrder.find().populate('userId', 'name email role avatar').sort({ createdAt: 1 }).lean(),
      ExtraEvent.find({
        $or: [
          { 'registeredClubs.paidAmount': { $gt: 0 } },
          { 'participants.paidAmount': { $gt: 0 } },
        ],
      })
        .populate('academyId', 'name userId logo')
        .sort({ createdAt: 1 })
        .lean(),
      PlatformPayment.find().sort({ paymentDate: 1, createdAt: 1 }).lean(),
      AcademyProfile.find().select('_id userId name logo').lean(),
      ClubProfile.find().select('_id userId name logo').lean(),
      AgentProfile.find().select('_id userId fullName name agencyName avatar').lean(),
      PlayerProfile.find().select('_id userId fullName profileImage academy academyId').lean(),
      CoachProfile.find().select('_id userId fullName profileImage').lean(),
    ]);

    const entityByUserId = new Map<
      string,
      { profileId: string; name: string; avatar: string; role: string }
    >();
    const academyById = new Map<string, { _id: string; name: string; logo: string }>();

    for (const ac of academies) {
      academyById.set(ac._id.toString(), {
        _id: ac._id.toString(),
        name: ac.name,
        logo: ac.logo || '',
      });
      if (ac.userId) {
        entityByUserId.set(ac.userId.toString(), {
          profileId: ac._id.toString(),
          name: ac.name,
          avatar: ac.logo || '',
          role: 'ACADEMY',
        });
      }
    }
    for (const cl of clubs) {
      if (cl.userId) {
        entityByUserId.set(cl.userId.toString(), {
          profileId: cl._id.toString(),
          name: cl.name,
          avatar: cl.logo || '',
          role: 'CLUB',
        });
      }
    }
    for (const ag of agents) {
      if (ag.userId) {
        entityByUserId.set(ag.userId.toString(), {
          profileId: ag._id.toString(),
          name: ag.fullName || (ag as any).name || ag.agencyName || 'Agent',
          avatar: (ag as any).avatar || '',
          role: 'AGENT',
        });
      }
    }
    for (const pl of players) {
      if (pl.userId) {
        entityByUserId.set(pl.userId.toString(), {
          profileId: pl._id.toString(),
          name: pl.fullName,
          avatar: pl.profileImage || '',
          role: 'PLAYER',
        });
      }
    }
    for (const co of coaches) {
      if (co.userId) {
        entityByUserId.set(co.userId.toString(), {
          profileId: co._id.toString(),
          name: co.fullName,
          avatar: co.profileImage || '',
          role: 'COACH',
        });
      }
    }

    // Index AcademyFinanceTransactions by reportId so we link commissions without duplicate counting
    const financeByReportId = new Map<string, any>();
    for (const ft of financeTxns) {
      if (ft.reportId) {
        financeByReportId.set(ft.reportId.toString(), ft);
      }
    }

    // Index Admin Overrides from PlatformPayment
    const overrideByTargetId = new Map<string, any>();
    const standalonePlatformPayments: any[] = [];
    for (const pp of platformPayments) {
      if (pp.overrideTargetId) {
        overrideByTargetId.set(pp.overrideTargetId.toString(), pp);
      } else {
        standalonePlatformPayments.push(pp);
      }
    }

    const rows: IUnifiedPaymentRow[] = [];
    const consumedReportIds = new Set<string>();

    // 1. Subscriptions (UserSubscription) — strictly real DB amountPaid or linked plan.price
    for (const sub of subscriptions as any[]) {
      const u = sub.userId as any;
      const plan = sub.planId as any;
      const rawPaid = Number(sub.amountPaid) || 0;
      const planPrice = Number(plan?.price) || 0;

      if (sub.isAdminGrant && rawPaid === 0 && !includeFreeGrants) {
        continue;
      }

      const gross = sub.isAdminGrant && rawPaid === 0 ? 0 : rawPaid || planPrice;
      if (gross <= 0 && !includeFreeGrants) {
        continue;
      }

      const uid = u?._id ? u._id.toString() : null;
      const mappedEntity = uid ? entityByUserId.get(uid) : undefined;
      const role = (u?.role || sub.category || plan?.targetRole || 'PLAYER').toUpperCase();

      const spend = 0;
      const net = parseFloat((gross - spend).toFixed(2));
      const dt = new Date(sub.startDate || sub.createdAt || Date.now());

      const entityName =
        mappedEntity?.name || u?.academyName || u?.clubName || u?.agencyName || u?.name || '';

      rows.push({
        _id: sub._id.toString(),
        paymentId: '',
        sourceId: sub._id.toString(),
        sourceModel: 'UserSubscription',
        type: 'Subscription',
        category: 'SUBSCRIPTION',
        subType: plan?.planName || plan?.title || '',
        userOrEntity: entityName,
        entity: {
          _id: mappedEntity?.profileId || uid,
          userId: uid,
          profileId: mappedEntity?.profileId || null,
          name: entityName,
          email: u?.email || '',
          role,
          avatar: mappedEntity?.avatar || u?.avatar || '',
        },
        amount: gross,
        spend,
        commissionPaid: spend,
        commissionRate: '0%',
        commissionRecipient: '',
        adminEarnings: net,
        currency: plan?.currency || '$',
        date: formatDateYMD(dt),
        rawDate: dt,
        status: normalizePaymentStatus(sub.status),
        rawStatus: sub.status || '',
        paymentMethod: sub.isAdminGrant ? 'ADMIN_GRANT' : 'STRIPE',
        transactionId: sub.stripePaymentIntentId || sub.stripeSessionId || sub._id.toString(),
        notes: plan?.title || plan?.planName || '',
        createdAt: new Date(sub.createdAt || dt),
      });
    }

    // 2. Player Coach Game Reports (MatchRecord) — strictly real DB paymentAmount / financeTxn.cost & commissionAcademy
    for (const mr of matchRecords as any[]) {
      const rid = mr._id.toString();
      const linkedFin = financeByReportId.get(rid);
      const gross = Number(linkedFin?.cost ?? mr.coachReview?.paymentAmount ?? 0);
      if (gross <= 0) continue;

      consumedReportIds.add(rid);

      const pl = mr.playerId as any;
      const playerUserId = pl?.userId ? pl.userId.toString() : null;
      const playerName = pl?.fullName || mr.playerInfo?.playerName || '';

      const spend = Number(linkedFin?.commissionAcademy) || 0;
      const net = parseFloat((gross - spend).toFixed(2));
      const dt = new Date(mr.createdAt || mr.matchDate || Date.now());

      const acadInfo = pl?.academyId ? academyById.get(pl.academyId.toString()) : undefined;
      const recipientName =
        (linkedFin?.academyId as any)?.name ||
        acadInfo?.name ||
        mr.coachReview?.coachName ||
        pl?.academy ||
        '';

      const rawSt =
        mr.coachReview?.paymentStatus === 'PAID'
          ? 'COMPLETED'
          : mr.coachReview?.paymentStatus || 'PENDING';

      rows.push({
        _id: rid,
        paymentId: '',
        sourceId: rid,
        sourceModel: 'MatchRecord',
        type: 'Game Report',
        category: 'GAME_REPORT',
        subType: 'Coach Match Evaluation Report',
        userOrEntity: playerName,
        entity: {
          _id: pl?._id ? pl._id.toString() : playerUserId,
          userId: playerUserId,
          profileId: pl?._id ? pl._id.toString() : null,
          name: playerName,
          email: '',
          role: 'PLAYER',
          avatar: pl?.profileImage || '',
        },
        amount: gross,
        spend,
        commissionPaid: spend,
        commissionRate: gross > 0 && spend > 0 ? `${Math.round((spend / gross) * 100)}%` : '0%',
        commissionRecipient: recipientName,
        adminEarnings: net,
        currency: '$',
        date: formatDateYMD(dt),
        rawDate: dt,
        status: normalizePaymentStatus(rawSt),
        rawStatus: rawSt,
        paymentMethod: 'STRIPE',
        transactionId: mr.coachReview?.transactionId || rid,
        notes: mr.homeTeam && mr.awayTeam ? `${mr.homeTeam} vs ${mr.awayTeam}` : '',
        createdAt: new Date(mr.createdAt || dt),
      });
    }

    // 3. Parent Match Reports (ParentMatchReport) — strictly real DB coachReviewPrice / financeTxn.cost & commissionAcademy
    for (const pr of parentReports as any[]) {
      const rid = pr._id.toString();
      const linkedFin = financeByReportId.get(rid);
      const gross = Number(linkedFin?.cost ?? pr.coachReviewPrice ?? 0);
      if (gross <= 0) continue;

      consumedReportIds.add(rid);

      const parent = pr.parentId as any;
      const child = pr.childPlayerId as any;

      const payerName =
        parent?.firstName || parent?.lastName
          ? `${parent.firstName || ''} ${parent.lastName || ''}`.trim()
          : child?.fullName || '';

      const spend = Number(linkedFin?.commissionAcademy) || 0;
      const net = parseFloat((gross - spend).toFixed(2));
      const dt = new Date(pr.paidAt || pr.createdAt || pr.matchDate || Date.now());

      const acadInfo = child?.academyId ? academyById.get(child.academyId.toString()) : undefined;
      const recipientName =
        (linkedFin?.academyId as any)?.name || acadInfo?.name || child?.academy || '';

      const rawSt = pr.paymentStatus === 'PAID' ? 'COMPLETED' : pr.paymentStatus || 'PENDING';

      rows.push({
        _id: rid,
        paymentId: '',
        sourceId: rid,
        sourceModel: 'ParentMatchReport',
        type: 'Game Report',
        category: 'GAME_REPORT',
        subType: 'Parent Match Evaluation Report',
        userOrEntity: payerName,
        entity: {
          _id: parent?._id ? parent._id.toString() : child?._id ? child._id.toString() : null,
          userId: parent?.userId ? parent.userId.toString() : null,
          profileId: parent?._id ? parent._id.toString() : null,
          name: payerName,
          email: '',
          role: 'PARENT',
          avatar: child?.profileImage || '',
        },
        amount: gross,
        spend,
        commissionPaid: spend,
        commissionRate: gross > 0 && spend > 0 ? `${Math.round((spend / gross) * 100)}%` : '0%',
        commissionRecipient: recipientName,
        adminEarnings: net,
        currency: '$',
        date: formatDateYMD(dt),
        rawDate: dt,
        status: normalizePaymentStatus(rawSt),
        rawStatus: rawSt,
        paymentMethod: 'STRIPE',
        transactionId: pr.transactionId || rid,
        notes: pr.opponentTeam || '',
        createdAt: new Date(pr.createdAt || dt),
      });
    }

    // 4. Standalone Academy Finance Committee Transactions (not already linked to MatchRecord/ParentMatchReport)
    for (const ft of financeTxns as any[]) {
      const repId = ft.reportId ? ft.reportId.toString() : null;
      if (repId && consumedReportIds.has(repId)) continue;
      if (repId) consumedReportIds.add(repId);

      const gross = Number(ft.cost) || 0;
      if (gross <= 0) continue;

      const ac = ft.academyId as any;
      const pl = ft.playerId as any;
      const spend = Number(ft.commissionAcademy) || 0;
      const net = parseFloat((gross - spend).toFixed(2));
      const dt = new Date(ft.transactionDate || ft.createdAt || Date.now());

      const entityName = pl?.fullName || ac?.name || '';
      const academyName = ac?.name || '';

      rows.push({
        _id: ft._id.toString(),
        paymentId: '',
        sourceId: ft._id.toString(),
        sourceModel: 'AcademyFinanceTransaction',
        type: 'Game Report',
        category: 'GAME_REPORT',
        subType: ft.transactionType || 'Game Report',
        userOrEntity: entityName,
        entity: {
          _id: pl?._id ? pl._id.toString() : ac?._id ? ac._id.toString() : null,
          userId: pl?.userId ? pl.userId.toString() : ac?.userId ? ac.userId.toString() : null,
          profileId: pl?._id ? pl._id.toString() : ac?._id ? ac._id.toString() : null,
          name: entityName,
          email: '',
          role: pl ? 'PLAYER' : 'ACADEMY',
          avatar: pl?.profileImage || ac?.logo || '',
        },
        amount: gross,
        spend,
        commissionPaid: spend,
        commissionRate: gross > 0 && spend > 0 ? `${Math.round((spend / gross) * 100)}%` : '0%',
        commissionRecipient: academyName,
        adminEarnings: net,
        currency: '$',
        date: formatDateYMD(dt),
        rawDate: dt,
        status: normalizePaymentStatus(ft.status),
        rawStatus: ft.status || 'COMPLETED',
        paymentMethod: 'STRIPE',
        transactionId: ft._id.toString(),
        notes: ft.notes || ft.transactionType || '',
        createdAt: new Date(ft.createdAt || dt),
      });
    }

    // 5. Academy GameReport documents (only where real price > 0)
    for (const gr of gameReports as any[]) {
      const gid = gr._id.toString();
      if (consumedReportIds.has(gid)) continue;

      const linkedFin = financeByReportId.get(gid);
      const gross = Number(linkedFin?.cost ?? gr.price ?? 0);
      if (gross <= 0) continue;

      const ac = gr.academyId as any;
      const pl = gr.playerId as any;
      const spend = Number(linkedFin?.commissionAcademy) || 0;
      const net = parseFloat((gross - spend).toFixed(2));
      const dt = new Date(gr.createdAt || gr.matchDate || Date.now());
      const entityName = pl?.fullName || ac?.name || '';

      rows.push({
        _id: gid,
        paymentId: '',
        sourceId: gid,
        sourceModel: 'GameReport',
        type: 'Game Report',
        category: 'GAME_REPORT',
        subType: gr.matchName || 'Game Report',
        userOrEntity: entityName,
        entity: {
          _id: pl?._id ? pl._id.toString() : ac?._id ? ac._id.toString() : null,
          userId: pl?.userId ? pl.userId.toString() : null,
          profileId: pl?._id ? pl._id.toString() : null,
          name: entityName,
          email: '',
          role: 'PLAYER',
          avatar: pl?.profileImage || ac?.logo || '',
        },
        amount: gross,
        spend,
        commissionPaid: spend,
        commissionRate: gross > 0 && spend > 0 ? `${Math.round((spend / gross) * 100)}%` : '0%',
        commissionRecipient: ac?.name || '',
        adminEarnings: net,
        currency: '$',
        date: formatDateYMD(dt),
        rawDate: dt,
        status: normalizePaymentStatus(gr.paymentStatus === 'PAID' ? 'COMPLETED' : gr.status),
        rawStatus: gr.paymentStatus || gr.status || 'PENDING',
        paymentMethod: 'STRIPE',
        transactionId: gid,
        notes: gr.matchName || '',
        createdAt: new Date(gr.createdAt || dt),
      });
    }

    // 6. Store / Shop Orders (ShopOrder)
    for (const order of shopOrders as any[]) {
      const gross = Number(order.totalAmount) || 0;
      if (gross <= 0) continue;

      const u = order.userId as any;
      const uid = u?._id ? u._id.toString() : null;
      const mapped = uid ? entityByUserId.get(uid) : undefined;
      const entityName = mapped?.name || u?.name || 'Customer';
      const role = (u?.role || mapped?.role || 'PLAYER').toUpperCase();

      const spend = 0;
      const net = parseFloat((gross - spend).toFixed(2));
      const dt = new Date(order.paidAt || order.createdAt || Date.now());

      rows.push({
        _id: order._id.toString(),
        paymentId: '',
        sourceId: order._id.toString(),
        sourceModel: 'ShopOrder',
        type: 'Shop Order',
        category: 'SHOP',
        subType: `Store Order #${order.orderNumber || order._id.toString().slice(-6)}`,
        userOrEntity: entityName,
        entity: {
          _id: mapped?.profileId || uid,
          userId: uid,
          profileId: mapped?.profileId || null,
          name: entityName,
          email: u?.email || '',
          role,
          avatar: mapped?.avatar || u?.avatar || '',
        },
        amount: gross,
        spend,
        commissionPaid: 0,
        commissionRate: '0%',
        commissionRecipient: '',
        adminEarnings: net,
        currency: '$',
        date: formatDateYMD(dt),
        rawDate: dt,
        status: normalizePaymentStatus(order.paymentStatus),
        rawStatus: order.paymentStatus || 'PENDING',
        paymentMethod: 'STRIPE',
        transactionId: order.stripePaymentIntentId || order.stripeSessionId || order.orderNumber,
        notes: `Merchandise Order (${Array.isArray(order.items) ? order.items.length : 1} items)`,
        createdAt: new Date(order.createdAt || dt),
      });
    }

    // 7. ExtraEvent Tournament Club Registrations & Paid Event Participants (strictly where paidAmount > 0)
    for (const ev of extraEvents as any[]) {
      if (Array.isArray(ev.registeredClubs)) {
        for (const rc of ev.registeredClubs) {
          const gross = Number(rc.paidAmount) || 0;
          if (gross <= 0) continue;

          const spend = 0;
          const net = gross;
          const dt = new Date(rc.registeredAt || ev.createdAt || Date.now());
          const subId = rc._id ? rc._id.toString() : `${ev._id}_club_${rc.clubName}`;

          rows.push({
            _id: subId,
            paymentId: '',
            sourceId: subId,
            sourceModel: 'ExtraEventClubRegistration',
            type: 'Tournament',
            category: 'TOURNAMENT',
            subType: `${ev.eventName} (Tournament Entry)`,
            userOrEntity: rc.clubName || 'Registered Club',
            entity: {
              _id: subId,
              userId: null,
              profileId: null,
              name: rc.clubName || 'Registered Club',
              email: rc.contactEmail || '',
              role: 'CLUB',
              avatar: rc.logoUrl || '',
            },
            amount: gross,
            spend,
            commissionPaid: 0,
            commissionRate: '0%',
            commissionRecipient: '',
            adminEarnings: net,
            currency: '$',
            date: formatDateYMD(dt),
            rawDate: dt,
            status: normalizePaymentStatus(rc.paymentStatus),
            rawStatus: rc.paymentStatus || 'PENDING',
            paymentMethod: 'STRIPE',
            transactionId: rc.stripePaymentIntentId || rc.stripeSessionId || subId,
            notes: `Tournament registration for ${ev.eventName}`,
            createdAt: dt,
          });
        }
      }

      if (Array.isArray(ev.participants)) {
        for (const part of ev.participants) {
          const gross = Number(part.paidAmount) || 0;
          if (gross <= 0) continue;

          const spend = 0;
          const net = gross;
          const dt = new Date(part.registeredAt || ev.createdAt || Date.now());
          const subId = part._id ? part._id.toString() : `${ev._id}_part_${part.name}`;

          rows.push({
            _id: subId,
            paymentId: '',
            sourceId: subId,
            sourceModel: 'ExtraEventParticipant',
            type: 'Event Registration',
            category: 'EVENT',
            subType: ev.eventName,
            userOrEntity: part.name || 'Participant',
            entity: {
              _id: part.userId ? part.userId.toString() : subId,
              userId: part.userId ? part.userId.toString() : null,
              profileId: null,
              name: part.name || 'Participant',
              email: part.email || '',
              role: 'PLAYER',
              avatar: '',
            },
            amount: gross,
            spend,
            commissionPaid: 0,
            commissionRate: '0%',
            commissionRecipient: '',
            adminEarnings: net,
            currency: '$',
            date: formatDateYMD(dt),
            rawDate: dt,
            status: normalizePaymentStatus(part.paymentStatus),
            rawStatus: part.paymentStatus || 'PAID',
            paymentMethod: 'STRIPE',
            transactionId: subId,
            notes: `Event registration for ${ev.eventName}`,
            createdAt: dt,
          });
        }
      }
    }

    // 8. Standalone PlatformPayment records (created directly by Super Admin)
    for (const pp of standalonePlatformPayments) {
      const gross = Number(pp.amount) || 0;
      const spend = Number(pp.spend ?? pp.commissionPaid) || 0;
      const net = parseFloat((gross - spend).toFixed(2));
      const dt = new Date(pp.paymentDate || pp.createdAt || Date.now());
      const cat = normalizePaymentCategory(pp.category || pp.type);
      const role = (pp.entityRole || 'USER').toUpperCase();

      rows.push({
        _id: pp._id.toString(),
        paymentId: pp.paymentCode || '',
        sourceId: pp._id.toString(),
        sourceModel: 'PlatformPayment',
        type: pp.type || 'Subscription',
        category: cat,
        subType: pp.type || 'Platform Payment',
        userOrEntity: pp.userOrEntityName || 'Platform Entity',
        entity: {
          _id: pp.entityId ? pp.entityId.toString() : pp.userId ? pp.userId.toString() : null,
          userId: pp.userId ? pp.userId.toString() : null,
          profileId: pp.entityId ? pp.entityId.toString() : null,
          name: pp.userOrEntityName || 'Platform Entity',
          email: pp.entityEmail || '',
          role,
          avatar: pp.entityAvatar || '',
        },
        amount: gross,
        spend,
        commissionPaid: Number(pp.commissionPaid ?? spend),
        commissionRate:
          pp.commissionRate ||
          (gross > 0 && spend > 0 ? `${Math.round((spend / gross) * 100)}%` : '0%'),
        commissionRecipient: pp.commissionRecipient || '',
        adminEarnings: net,
        currency: pp.currency || '$',
        date: formatDateYMD(dt),
        rawDate: dt,
        status: normalizePaymentStatus(pp.status),
        rawStatus: pp.status || 'COMPLETED',
        paymentMethod: pp.paymentMethod || 'STRIPE',
        transactionId: pp.transactionId || pp._id.toString(),
        notes: pp.notes || '',
        createdAt: new Date(pp.createdAt || dt),
      });
    }

    // Apply any Admin Overrides from PlatformPayment (where overrideTargetId matches row._id)
    for (const row of rows) {
      const ov = overrideByTargetId.get(row._id);
      if (!ov) continue;

      if (ov.paymentCode) row.paymentId = ov.paymentCode;
      if (ov.type) {
        row.type = ov.type;
        row.category = normalizePaymentCategory(ov.category || ov.type);
      }
      if (ov.userOrEntityName) {
        row.userOrEntity = ov.userOrEntityName;
        row.entity.name = ov.userOrEntityName;
      }
      if (ov.amount !== undefined && ov.amount !== null) {
        row.amount = Number(ov.amount);
      }
      if (ov.spend !== undefined && ov.spend !== null) {
        row.spend = Number(ov.spend);
        row.commissionPaid = Number(ov.commissionPaid ?? ov.spend);
      }
      if (ov.commissionRate) row.commissionRate = ov.commissionRate;
      if (ov.commissionRecipient !== undefined) row.commissionRecipient = ov.commissionRecipient;
      row.adminEarnings = parseFloat((row.amount - row.spend).toFixed(2));
      if (ov.status) {
        row.status = normalizePaymentStatus(ov.status);
        row.rawStatus = ov.status;
      }
      if (ov.paymentDate) {
        row.rawDate = new Date(ov.paymentDate);
        row.date = formatDateYMD(row.rawDate);
      }
      if (ov.notes !== undefined) row.notes = ov.notes;
    }

    // Sort chronologically ascending first to assign deterministic PAY-001, PAY-002, PAY-003...
    rows.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
    rows.forEach((row, index) => {
      if (!row.paymentId) {
        row.paymentId = `PAY-${String(index + 1).padStart(3, '0')}`;
      }
    });

    return rows;
  }

  /**
   * GET /api/v1/admin/payments
   */
  async getPayments(query: IAdminPaymentQuery) {
    const includeFree = query.includeFreeGrants === 'true';
    const allRows = await this.collectAllPlatformPayments(includeFree);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalRevenue = 0;
    let subscriptionRevenue = 0;
    let gameReportsRevenue = 0;
    let otherRevenue = 0;
    let totalSpend = 0;
    let totalCommissionPaid = 0;
    let pendingAmount = 0;
    let failedOrRefundedAmount = 0;

    let thisMonthRevenue = 0;
    let thisMonthSpend = 0;
    let thisMonthCount = 0;

    const breakdownByType: Record<
      string,
      { count: number; revenue: number; spend: number; netAdminEarnings: number }
    > = {
      SUBSCRIPTION: { count: 0, revenue: 0, spend: 0, netAdminEarnings: 0 },
      GAME_REPORT: { count: 0, revenue: 0, spend: 0, netAdminEarnings: 0 },
      TOURNAMENT: { count: 0, revenue: 0, spend: 0, netAdminEarnings: 0 },
      EVENT: { count: 0, revenue: 0, spend: 0, netAdminEarnings: 0 },
      SHOP: { count: 0, revenue: 0, spend: 0, netAdminEarnings: 0 },
    };

    const breakdownByStatus: Record<string, { count: number; amount: number }> = {
      COMPLETED: { count: 0, amount: 0 },
      PENDING: { count: 0, amount: 0 },
      FAILED: { count: 0, amount: 0 },
      REFUNDED: { count: 0, amount: 0 },
      CANCELLED: { count: 0, amount: 0 },
    };

    for (const r of allRows) {
      if (breakdownByStatus[r.status]) {
        breakdownByStatus[r.status].count += 1;
        breakdownByStatus[r.status].amount = parseFloat(
          (breakdownByStatus[r.status].amount + r.amount).toFixed(2),
        );
      }

      if (r.status === 'COMPLETED') {
        totalRevenue += r.amount;
        totalSpend += r.spend;
        totalCommissionPaid += r.commissionPaid;

        if (r.category === 'SUBSCRIPTION') {
          subscriptionRevenue += r.amount;
        } else if (r.category === 'GAME_REPORT') {
          gameReportsRevenue += r.amount;
        } else {
          otherRevenue += r.amount;
        }

        if (r.rawDate >= startOfMonth) {
          thisMonthRevenue += r.amount;
          thisMonthSpend += r.spend;
          thisMonthCount += 1;
        }

        const bucket = breakdownByType[r.category];
        if (bucket) {
          bucket.count += 1;
          bucket.revenue = parseFloat((bucket.revenue + r.amount).toFixed(2));
          bucket.spend = parseFloat((bucket.spend + r.spend).toFixed(2));
          bucket.netAdminEarnings = parseFloat(
            (bucket.netAdminEarnings + r.adminEarnings).toFixed(2),
          );
        }
      } else if (r.status === 'PENDING') {
        pendingAmount += r.amount;
      } else {
        failedOrRefundedAmount += r.amount;
      }
    }

    totalRevenue = parseFloat(totalRevenue.toFixed(2));
    subscriptionRevenue = parseFloat(subscriptionRevenue.toFixed(2));
    gameReportsRevenue = parseFloat(gameReportsRevenue.toFixed(2));
    otherRevenue = parseFloat(otherRevenue.toFixed(2));
    totalSpend = parseFloat(totalSpend.toFixed(2));
    totalCommissionPaid = parseFloat(totalCommissionPaid.toFixed(2));
    const netAdminEarnings = parseFloat((totalRevenue - totalSpend).toFixed(2));
    pendingAmount = parseFloat(pendingAmount.toFixed(2));
    failedOrRefundedAmount = parseFloat(failedOrRefundedAmount.toFixed(2));
    thisMonthRevenue = parseFloat(thisMonthRevenue.toFixed(2));
    thisMonthSpend = parseFloat(thisMonthSpend.toFixed(2));
    const thisMonthNetEarnings = parseFloat((thisMonthRevenue - thisMonthSpend).toFixed(2));

    const summary = {
      totalRevenue,
      subscription: subscriptionRevenue,
      gameReports: gameReportsRevenue,
      totalSpend,
      otherRevenue,
      totalCommissionPaid,
      netAdminEarnings,
      pendingAmount,
      failedOrRefundedAmount,
      thisMonth: {
        revenue: thisMonthRevenue,
        spend: thisMonthSpend,
        netAdminEarnings: thisMonthNetEarnings,
        transactionsCount: thisMonthCount,
      },
      breakdownByType,
      breakdownByStatus,
    };

    // Filtering
    const statusParam = query.status || query.paymentStatus;
    const statusFilter = !isIgnoredFilter(statusParam)
      ? String(statusParam).trim().toUpperCase()
      : '';

    const typeParam = query.type || query.paymentType || query.category;
    const typeFilter = !isIgnoredFilter(typeParam) ? String(typeParam).trim().toUpperCase() : '';

    const roleParam = query.role || query.entityRole || query.entityType;
    const roleFilter = !isIgnoredFilter(roleParam) ? String(roleParam).trim().toUpperCase() : '';

    const targetEntityId = (query.userId || query.entityId || '').trim();
    const startDate = parseFlexibleDate(query.startDate || query.dateFrom);
    const endDate = parseFlexibleDate(query.endDate || query.dateTo);
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    const minAmount =
      query.minAmount !== undefined && query.minAmount !== '' ? Number(query.minAmount) : undefined;
    const maxAmount =
      query.maxAmount !== undefined && query.maxAmount !== '' ? Number(query.maxAmount) : undefined;

    const search = (query.search || query.searchTerm || '').trim().toLowerCase();

    const filtered = allRows.filter((r) => {
      if (statusFilter) {
        const normalizedTarget = normalizePaymentStatus(statusFilter);
        if (r.status !== normalizedTarget && r.rawStatus.toUpperCase() !== statusFilter) {
          return false;
        }
      }

      if (typeFilter) {
        const normalizedCat = normalizePaymentCategory(typeFilter);
        const matchesCategory = r.category === normalizedCat && normalizedCat !== 'OTHER';
        const matchesTypeText =
          r.type.toUpperCase().includes(typeFilter) ||
          r.subType.toUpperCase().includes(typeFilter) ||
          r.category.includes(typeFilter);
        if (!matchesCategory && !matchesTypeText) return false;
      }

      if (roleFilter) {
        const targetRole = roleFilter.replace(/S$/, '');
        if (!r.entity.role.includes(targetRole)) {
          return false;
        }
      }

      if (targetEntityId) {
        if (
          r.entity._id !== targetEntityId &&
          r.entity.userId !== targetEntityId &&
          r.entity.profileId !== targetEntityId
        ) {
          return false;
        }
      }

      if (startDate && r.rawDate < startDate) return false;
      if (endDate && r.rawDate > endDate) return false;
      if (minAmount !== undefined && !isNaN(minAmount) && r.amount < minAmount) return false;
      if (maxAmount !== undefined && !isNaN(maxAmount) && r.amount > maxAmount) return false;

      if (search) {
        const haystack = [
          r.paymentId,
          r._id,
          r.transactionId,
          r.type,
          r.subType,
          r.category,
          r.userOrEntity,
          r.entity.email,
          r.entity.role,
          r.commissionRecipient,
          r.status,
          r.rawStatus,
          r.date,
          r.notes,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });

    // Sorting (default: newest date first)
    const sortBy = (query.sortBy || 'date').trim().toLowerCase();
    const sortOrder = String(query.sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;

    filtered.sort((a, b) => {
      if (sortBy === 'amount' || sortBy === 'grossamount') {
        return (a.amount - b.amount) * sortOrder;
      }
      if (sortBy === 'spend' || sortBy === 'commission') {
        return (a.spend - b.spend) * sortOrder;
      }
      if (sortBy === 'adminearnings' || sortBy === 'netrevenue') {
        return (a.adminEarnings - b.adminEarnings) * sortOrder;
      }
      if (sortBy === 'paymentid') {
        return a.paymentId.localeCompare(b.paymentId) * sortOrder;
      }
      if (sortBy === 'type') {
        return a.type.localeCompare(b.type) * sortOrder;
      }
      if (sortBy === 'status') {
        return a.status.localeCompare(b.status) * sortOrder;
      }
      return (a.rawDate.getTime() - b.rawDate.getTime()) * sortOrder;
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const total = filtered.length;
    const paginated = filtered
      .slice((page - 1) * limit, page * limit)
      .map(({ rawDate: _rawDate, ...rest }) => rest);

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
   * GET /api/v1/admin/payments/:id
   */
  async getPaymentById(id: string) {
    const target = String(id).trim();
    const allRows = await this.collectAllPlatformPayments(true);

    const found = allRows.find(
      (r) =>
        r._id === target ||
        r.paymentId.toUpperCase() === target.toUpperCase() ||
        r.transactionId === target,
    );

    if (!found) {
      throw new AppError(StatusCodes.NOT_FOUND, `Payment record "${id}" not found`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rawDate: _rawDate, ...cleanRow } = found;
    return cleanRow;
  }

  /**
   * POST /api/v1/admin/payments
   */
  async createPayment(payload: any, adminUserId?: string) {
    const amount = Number(payload.amount ?? payload.grossAmount ?? 0);
    const spend = Number(payload.spend ?? payload.commissionPaid ?? payload.commission ?? 0);

    if (isNaN(amount) || amount < 0) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid payment amount is required');
    }

    let resolvedName = payload.userOrEntity || payload.userOrEntityName || payload.name || '';
    let resolvedEmail = payload.email || payload.entityEmail || '';
    let resolvedRole = (payload.role || payload.entityRole || 'ACADEMY').toUpperCase();
    let resolvedAvatar = payload.avatar || '';
    let resolvedUserId: Types.ObjectId | undefined;
    let resolvedEntityId: Types.ObjectId | undefined;

    if (payload.userId && Types.ObjectId.isValid(payload.userId)) {
      const user = await UserModel.findById(payload.userId).lean();
      if (user) {
        resolvedUserId = user._id as Types.ObjectId;
        resolvedName =
          resolvedName || user.academyName || user.clubName || user.agencyName || user.name;
        resolvedEmail = resolvedEmail || user.email;
        resolvedRole = user.role;
        resolvedAvatar = resolvedAvatar || user.avatar || '';
      }
    }

    if (payload.entityId && Types.ObjectId.isValid(payload.entityId)) {
      resolvedEntityId = new Types.ObjectId(payload.entityId);
    }

    if (!resolvedName) {
      resolvedName = 'Platform User';
    }

    const type = payload.type || payload.paymentType || 'Subscription';
    const category = normalizePaymentCategory(payload.category || type);
    const status = normalizePaymentStatus(payload.status || 'COMPLETED');
    const paymentDate = parseFlexibleDate(payload.date || payload.paymentDate) || new Date();

    const created = await PlatformPayment.create({
      paymentCode: payload.paymentId || payload.paymentCode || undefined,
      type,
      category,
      userId: resolvedUserId,
      entityId: resolvedEntityId,
      userOrEntityName: resolvedName,
      entityEmail: resolvedEmail,
      entityRole: resolvedRole,
      entityAvatar: resolvedAvatar,
      amount,
      spend,
      commissionPaid: Number(payload.commissionPaid ?? spend),
      commissionRate:
        payload.commissionRate ||
        (amount > 0 && spend > 0 ? `${Math.round((spend / amount) * 100)}%` : '0%'),
      commissionRecipient: payload.commissionRecipient || '',
      adminEarnings: parseFloat((amount - spend).toFixed(2)),
      currency: payload.currency || '$',
      paymentDate,
      status,
      paymentMethod: payload.paymentMethod || 'ADMIN',
      transactionId: payload.transactionId || undefined,
      notes: payload.notes || '',
      ...(adminUserId && Types.ObjectId.isValid(adminUserId)
        ? { createdByAdminId: new Types.ObjectId(adminUserId) }
        : {}),
    });

    return await this.getPaymentById(created._id.toString());
  }

  /**
   * PATCH /api/v1/admin/payments/:id
   */
  async updatePayment(id: string, payload: any, adminUserId?: string) {
    const existingRow = await this.getPaymentById(id);
    const targetId = existingRow._id;

    const nextAmount =
      payload.amount !== undefined || payload.grossAmount !== undefined
        ? Number(payload.amount ?? payload.grossAmount)
        : existingRow.amount;

    const nextSpend =
      payload.spend !== undefined ||
      payload.commissionPaid !== undefined ||
      payload.commission !== undefined
        ? Number(payload.spend ?? payload.commissionPaid ?? payload.commission)
        : existingRow.spend;

    const nextStatus = payload.status ? normalizePaymentStatus(payload.status) : existingRow.status;

    const nextType = payload.type || payload.paymentType || existingRow.type;
    const nextCategory = normalizePaymentCategory(payload.category || nextType);
    const nextEntityName =
      payload.userOrEntity || payload.userOrEntityName || existingRow.userOrEntity;
    const nextDate =
      parseFlexibleDate(payload.date || payload.paymentDate) || new Date(existingRow.date);
    const nextNotes = payload.notes !== undefined ? String(payload.notes) : existingRow.notes;
    const nextCommissionRecipient =
      payload.commissionRecipient !== undefined
        ? String(payload.commissionRecipient)
        : existingRow.commissionRecipient;

    if (existingRow.sourceModel === 'PlatformPayment' && Types.ObjectId.isValid(targetId)) {
      await PlatformPayment.findByIdAndUpdate(targetId, {
        $set: {
          ...(payload.paymentId ? { paymentCode: payload.paymentId } : {}),
          type: nextType,
          category: nextCategory,
          userOrEntityName: nextEntityName,
          amount: nextAmount,
          spend: nextSpend,
          commissionPaid: nextSpend,
          commissionRate:
            payload.commissionRate ||
            (nextAmount > 0 && nextSpend > 0
              ? `${Math.round((nextSpend / nextAmount) * 100)}%`
              : '0%'),
          commissionRecipient: nextCommissionRecipient,
          adminEarnings: parseFloat((nextAmount - nextSpend).toFixed(2)),
          paymentDate: nextDate,
          status: nextStatus,
          notes: nextNotes,
        },
      });
    } else {
      if (existingRow.sourceModel === 'UserSubscription' && Types.ObjectId.isValid(targetId)) {
        const subStatus =
          nextStatus === 'COMPLETED'
            ? 'ACTIVE'
            : nextStatus === 'CANCELLED'
              ? 'CANCELLED'
              : 'PENDING_PAYMENT';
        await UserSubscription.findByIdAndUpdate(targetId, {
          $set: { status: subStatus, amountPaid: nextAmount },
        });
      } else if (
        existingRow.sourceModel === 'AcademyFinanceTransaction' &&
        Types.ObjectId.isValid(targetId)
      ) {
        const ftStatus =
          nextStatus === 'COMPLETED'
            ? 'COMPLETED'
            : nextStatus === 'FAILED'
              ? 'REJECTED'
              : 'PENDING';
        await AcademyFinanceTransaction.findByIdAndUpdate(targetId, {
          $set: {
            cost: nextAmount,
            commissionAcademy: nextSpend,
            status: ftStatus,
            notes: nextNotes,
          },
        });
      } else if (existingRow.sourceModel === 'MatchRecord' && Types.ObjectId.isValid(targetId)) {
        const mrPayStatus = nextStatus === 'COMPLETED' ? 'PAID' : 'UNPAID';
        await MatchRecord.findByIdAndUpdate(targetId, {
          $set: {
            'coachReview.paymentStatus': mrPayStatus,
            'coachReview.paymentAmount': nextAmount,
          },
        });
      } else if (
        existingRow.sourceModel === 'ParentMatchReport' &&
        Types.ObjectId.isValid(targetId)
      ) {
        const prPayStatus = nextStatus === 'COMPLETED' ? 'PAID' : 'UNPAID';
        await ParentMatchReport.findByIdAndUpdate(targetId, {
          $set: {
            paymentStatus: prPayStatus,
            coachReviewPrice: nextAmount,
          },
        });
      } else if (existingRow.sourceModel === 'ShopOrder' && Types.ObjectId.isValid(targetId)) {
        const shopPayStatus =
          nextStatus === 'COMPLETED' ? 'PAID' : nextStatus === 'FAILED' ? 'FAILED' : 'PENDING';
        await ShopOrder.findByIdAndUpdate(targetId, {
          $set: { paymentStatus: shopPayStatus, totalAmount: nextAmount },
        });
      }

      await PlatformPayment.findOneAndUpdate(
        { overrideTargetId: targetId },
        {
          $set: {
            overrideTargetId: targetId,
            sourceModel: existingRow.sourceModel,
            paymentCode: payload.paymentId || existingRow.paymentId,
            type: nextType,
            category: nextCategory,
            userOrEntityName: nextEntityName,
            entityRole: existingRow.entity.role,
            amount: nextAmount,
            spend: nextSpend,
            commissionPaid: nextSpend,
            commissionRate:
              payload.commissionRate ||
              (nextAmount > 0 && nextSpend > 0
                ? `${Math.round((nextSpend / nextAmount) * 100)}%`
                : '0%'),
            commissionRecipient: nextCommissionRecipient,
            adminEarnings: parseFloat((nextAmount - nextSpend).toFixed(2)),
            paymentDate: nextDate,
            status: nextStatus,
            notes: nextNotes,
            ...(adminUserId && Types.ObjectId.isValid(adminUserId)
              ? { createdByAdminId: new Types.ObjectId(adminUserId) }
              : {}),
          },
        },
        { upsert: true, new: true },
      );
    }

    return await this.getPaymentById(targetId);
  }
}

export const adminPaymentsService = new AdminPaymentsService();
