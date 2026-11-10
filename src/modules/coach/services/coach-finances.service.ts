import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { CoachProfile } from '../coach.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { AcademyFinanceTransaction } from '@/modules/academy/academy.model';

export class CoachFinancesService {
  /**
   * Get Coach Financial Summary & Commission Earnings History
   * Client Requirement 7:
   * - Total earnings ($12.00 per CV validation)
   * - Commission history
   * - Pending payments & Completed payouts
   * - Associated transactions
   */
  async getCoachFinances(coachUserId: string, query: Record<string, unknown> = {}) {
    const coach = await CoachProfile.findOne({
      $or: [
        { userId: Types.ObjectId.isValid(coachUserId) ? new Types.ObjectId(coachUserId) : null },
        { _id: Types.ObjectId.isValid(coachUserId) ? new Types.ObjectId(coachUserId) : null },
      ].filter(Boolean) as any[],
    });

    if (!coach) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Coach profile not found');
    }

    const coachIdentifiers = [coach._id, coach.userId].filter(Boolean);

    // 1. Fetch verified players validated by this coach (ensures complete historical sync)
    const verifiedPlayers = await PlayerProfile.find({
      $or: [
        { verifyingCoachId: { $in: coachIdentifiers } },
        { 'coachVerification.verifiedByCoachId': { $in: coachIdentifiers } },
        { 'coachVerification.coachName': coach.fullName },
      ],
      $and: [
        {
          $or: [{ isVerifiedByCoach: true }, { 'coachVerification.isVerified': true }],
        },
      ],
    })
      .select(
        '_id fullName position profileImage currentClub academyId coachVerification updatedAt',
      )
      .lean();

    // 2. Fetch all finance transactions for this coach
    const verifiedPlayerIds = verifiedPlayers.map((p) => p._id);
    const transactions = await AcademyFinanceTransaction.find({
      $or: [
        { coachId: { $in: coachIdentifiers } },
        { playerId: { $in: verifiedPlayerIds }, transactionType: 'CV Validation' },
      ],
    })
      .populate('playerId', 'fullName position profileImage currentClub')
      .populate('academyId', 'name logo')
      .sort({ transactionDate: -1, createdAt: -1 })
      .lean();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalEarnings = 0;
    let pendingPayouts = 0;
    let completedPayouts = 0;
    let thisMonthEarnings = 0;

    const transactionMap = new Map<string, any>();

    // 3. Process records from AcademyFinanceTransaction
    for (const tx of transactions) {
      const pl = (tx.playerId as any) || {};
      const ac = (tx.academyId as any) || {};
      const earned =
        tx.commissionCoach !== undefined && tx.commissionCoach !== null && tx.commissionCoach > 0
          ? Number(tx.commissionCoach)
          : tx.transactionType === 'CV Validation'
            ? 12.0
            : 0;

      const tDate = new Date(tx.transactionDate || (tx as any).createdAt || now);
      totalEarnings += earned;

      if (tx.payoutStatusCoach === 'PAID') {
        completedPayouts += earned;
      } else {
        pendingPayouts += earned;
      }

      if (tDate >= startOfMonth) {
        thisMonthEarnings += earned;
      }

      const key = tx.playerId ? (tx.playerId._id || tx.playerId).toString() : tx._id.toString();
      transactionMap.set(key, {
        id: tx._id.toString(),
        transactionType: tx.transactionType,
        grossFee: tx.cost || 24.0,
        coachEarnings: earned,
        coachEarningsFormatted: `$ ${earned.toFixed(2)}`,
        commissionPercentage: '50%',
        player: {
          id: pl._id ? pl._id.toString() : null,
          name: pl.fullName || 'Player',
          position: pl.position || 'Forward',
          avatar: pl.profileImage || '',
        },
        academy: {
          id: ac._id ? ac._id.toString() : null,
          name: ac.name || coach.currentClub || 'Official Academy',
        },
        date: tDate.toISOString(),
        status: tx.status || 'COMPLETED',
        payoutStatus: tx.payoutStatusCoach || 'PENDING',
        notes: tx.notes || `CV Validation Commission ($${earned.toFixed(2)})`,
      });
    }

    // 4. Auto-reconcile any verified players who might not yet have an AcademyFinanceTransaction
    for (const pl of verifiedPlayers) {
      const key = pl._id.toString();
      if (!transactionMap.has(key)) {
        const earned = 12.0;
        const vDate = new Date(pl.coachVerification?.verifiedAt || (pl as any).updatedAt || now);
        totalEarnings += earned;
        pendingPayouts += earned;
        if (vDate >= startOfMonth) {
          thisMonthEarnings += earned;
        }

        // Persist a canonical AcademyFinanceTransaction in MongoDB if one doesn't exist yet
        let persistedTx = await AcademyFinanceTransaction.findOne({
          playerId: pl._id,
          transactionType: 'CV Validation',
        });

        if (!persistedTx) {
          persistedTx = await AcademyFinanceTransaction.create({
            academyId: pl.academyId || coach.academyId,
            coachId: coach._id,
            playerId: pl._id,
            transactionType: 'CV Validation',
            cost: 24.0,
            commissionRate: 25,
            commissionCoach: 12.0,
            commissionAcademy: 6.0,
            platformShare: 6.0,
            status: 'COMPLETED',
            payoutStatusCoach: 'PENDING',
            payoutStatusAcademy: 'PENDING',
            transactionDate: vDate,
            notes: `CV Validation Commission for ${pl.fullName || 'Player'} ($12.00 earned)`,
          });
        }

        transactionMap.set(key, {
          id: persistedTx._id.toString(),
          transactionType: 'CV Validation',
          grossFee: 24.0,
          coachEarnings: earned,
          coachEarningsFormatted: `$ ${earned.toFixed(2)}`,
          commissionPercentage: '50%',
          player: {
            id: pl._id.toString(),
            name: pl.fullName || 'Player',
            position: pl.position || 'Forward',
            avatar: pl.profileImage || '',
          },
          academy: {
            id: pl.academyId ? pl.academyId.toString() : null,
            name: pl.currentClub || coach.currentClub || 'Official Academy',
          },
          date: vDate.toISOString(),
          status: persistedTx.status || 'COMPLETED',
          payoutStatus: persistedTx.payoutStatusCoach || 'PENDING',
          notes: `CV Validation Commission for ${pl.fullName || 'Player'} ($12.00 earned)`,
        });
      }
    }

    const allTransactions = Array.from(transactionMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Optional query filtering by payoutStatus or status (?payoutStatus=PENDING or ?status=PAID)
    const targetStatus = query.payoutStatus || query.status;
    const filteredTransactions = targetStatus
      ? allTransactions.filter(
          (t) =>
            t.payoutStatus === String(targetStatus).toUpperCase().trim() ||
            t.status === String(targetStatus).toUpperCase().trim(),
        )
      : allTransactions;

    return {
      coach: {
        id: coach._id.toString(),
        userId: coach.userId.toString(),
        name: coach.fullName || 'Coach',
        club: coach.currentClub || '',
        license: coach.licenseStatus || '',
      },
      stripeConnect: {
        isConnected: Boolean(coach.stripeConnect?.stripeAccountId),
        stripeAccountId: coach.stripeConnect?.stripeAccountId || null,
        accountStatus: coach.stripeConnect?.accountStatus || 'NOT_CONNECTED',
        detailsSubmitted: coach.stripeConnect?.detailsSubmitted || false,
        payoutsEnabled: coach.stripeConnect?.payoutsEnabled || false,
        chargesEnabled: coach.stripeConnect?.chargesEnabled || false,
      },
      summary: {
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalEarningsFormatted: `$ ${totalEarnings.toFixed(2)}`,
        thisMonthEarnings: parseFloat(thisMonthEarnings.toFixed(2)),
        thisMonthEarningsFormatted: `$ ${thisMonthEarnings.toFixed(2)}`,
        pendingPayments: parseFloat(pendingPayouts.toFixed(2)),
        pendingPaymentsFormatted: `$ ${pendingPayouts.toFixed(2)}`,
        pendingPayouts: parseFloat(pendingPayouts.toFixed(2)),
        pendingPayoutsFormatted: `$ ${pendingPayouts.toFixed(2)}`,
        completedPayouts: parseFloat(completedPayouts.toFixed(2)),
        completedPayoutsFormatted: `$ ${completedPayouts.toFixed(2)}`,
        totalValidationsCount: verifiedPlayers.length,
        commissionRatePerValidation: '$12.00 (50%)',
        currency: '$',
      },
      feeBreakdown: {
        totalValidationPrice: '$24.00',
        coachShare: '$12.00 (50%)',
        academyShare: '$6.00 (25%)',
        k10PlatformShare: '$6.00 (25%)',
      },
      transactions: filteredTransactions,
    };
  }
}

export const coachFinancesService = new CoachFinancesService();
