import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { AcademyFeePayment, AcademyFinanceTransaction } from '../academy.model';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { ParentMatchReport } from '@/modules/parent/parent.model';
import { academyResolverService } from './academy-resolver.service';

export class AcademyFinanceService {
  async getFeesPayments(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    // Filter construction
    const filter: any = { academyId: academy._id };

    if (
      query.status &&
      ['PAID', 'UNPAID', 'PENDING'].includes(String(query.status).toUpperCase())
    ) {
      filter.status = String(query.status).toUpperCase();
    }

    if (query.feeType) {
      filter.feeType = { $regex: new RegExp(String(query.feeType).trim(), 'i') };
    }

    if (query.startDate || query.endDate) {
      filter.paymentDate = {};
      if (query.startDate) filter.paymentDate.$gte = new Date(query.startDate);
      if (query.endDate) filter.paymentDate.$lte = new Date(query.endDate);
    }

    // Pagination
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    // Search by player name
    if (query.search) {
      const searchRegex = new RegExp(String(query.search).trim(), 'i');
      const matchedPlayers = await PlayerProfile.find({ fullName: searchRegex }).select('_id');
      const matchedPlayerIds = matchedPlayers.map((p) => p._id);
      filter.playerId = { $in: matchedPlayerIds };
    }

    const [totalRecords, paymentDocs] = await Promise.all([
      AcademyFeePayment.countDocuments(filter),
      AcademyFeePayment.find(filter)
        .populate('playerId', 'fullName position profileImage currentClub')
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // Financial Metrics Calculation
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalPaidAgg, totalPendingAgg, thisMonthAgg] = await Promise.all([
      AcademyFeePayment.aggregate([
        { $match: { academyId: academy._id, status: 'PAID' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      AcademyFeePayment.aggregate([
        { $match: { academyId: academy._id, status: { $in: ['UNPAID', 'PENDING'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      AcademyFeePayment.aggregate([
        {
          $match: {
            academyId: academy._id,
            status: 'PAID',
            paymentDate: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const totalCollected = totalPaidAgg[0]?.total || 0;
    const pendingAmount = totalPendingAgg[0]?.total || 0;
    const thisMonthAmount = thisMonthAgg[0]?.total || 0;

    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const formattedPayments = paymentDocs.map((doc: any) => {
      const player = doc.playerId || {};
      const pDate = doc.paymentDate ? new Date(doc.paymentDate) : new Date();
      const formattedDate = `${monthNames[pDate.getMonth()]} ${pDate.getDate()}, ${pDate.getFullYear()}`;

      return {
        _id: doc._id,
        id: doc._id,
        playerId: player._id || null,
        player: {
          _id: player._id || null,
          id: player._id || null,
          name: player.fullName || 'Player',
          position: player.position || 'Forward',
          avatar: player.profileImage || '',
          currentClub: player.currentClub || academy.name,
        },
        feeType: doc.feeType,
        type: doc.feeType,
        amount: doc.amount,
        amountFormatted: `$${doc.amount.toLocaleString()}`,
        paymentDate: doc.paymentDate,
        date: formattedDate,
        status: doc.status,
        paymentMethod: doc.paymentMethod || 'CASH',
        transactionId: doc.transactionId || null,
        notes: doc.notes || '',
        createdAt: doc.createdAt,
      };
    });

    return {
      stats: {
        totalCollected,
        totalCollectedFormatted: `$${totalCollected.toLocaleString()}`,
        pending: pendingAmount,
        pendingFormatted: `$${pendingAmount.toLocaleString()}`,
        thisMonth: thisMonthAmount,
        thisMonthFormatted: `$${thisMonthAmount.toLocaleString()}`,
        currency: '$',
      },
      payments: formattedPayments,
      meta: {
        page,
        limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  async createFeePayment(user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const player = await PlayerProfile.findById(payload.playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid payment amount is required');
    }

    const newPayment = await AcademyFeePayment.create({
      academyId: academy._id,
      playerId: player._id,
      parentId: payload.parentId || undefined,
      feeType: payload.feeType || 'Monthly Fee',
      amount,
      paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : new Date(),
      status: payload.status || 'PAID',
      paymentMethod: payload.paymentMethod || 'CASH',
      transactionId: payload.transactionId || undefined,
      notes: payload.notes || '',
    });

    return {
      message: 'Fee payment recorded successfully',
      payment: newPayment,
    };
  }

  async updateFeePaymentStatus(
    paymentId: string,
    user: any,
    payload: any,
    academyIdentifier?: string,
  ) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const payment = await AcademyFeePayment.findOne({
      _id: paymentId,
      academyId: academy._id,
    });

    if (!payment) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Fee payment record not found');
    }

    if (payload.status) {
      payment.status = payload.status;
    }
    if (payload.paymentMethod) {
      payment.paymentMethod = payload.paymentMethod;
    }
    if (payload.notes !== undefined) {
      payment.notes = payload.notes;
    }

    await payment.save();

    return {
      message: 'Fee payment status updated successfully',
      payment,
    };
  }

  async getFeesPaymentsExport(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const filter: any = { academyId: academy._id };
    if (query.status) filter.status = String(query.status).toUpperCase();
    if (query.feeType) filter.feeType = { $regex: new RegExp(String(query.feeType).trim(), 'i') };

    const payments = await AcademyFeePayment.find(filter)
      .populate('playerId', 'fullName position')
      .sort({ paymentDate: -1 })
      .lean();

    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const exportRows = payments.map((doc: any) => {
      const player = doc.playerId || {};
      const pDate = doc.paymentDate ? new Date(doc.paymentDate) : new Date();
      const formattedDate = `${monthNames[pDate.getMonth()]} ${pDate.getDate()}, ${pDate.getFullYear()}`;

      return {
        id: doc._id.toString(),
        player: player.fullName || 'Unknown Player',
        position: player.position || 'N/A',
        feeType: doc.feeType,
        amount: doc.amount,
        date: formattedDate,
        status: doc.status,
        paymentMethod: doc.paymentMethod || 'CASH',
        notes: doc.notes || '',
      };
    });

    // CSV representation
    const csvHeaders = 'ID,Player,Position,Fee Type,Amount,Date,Status,Payment Method,Notes\n';
    const csvLines = exportRows
      .map(
        (r) =>
          `"${r.id}","${r.player}","${r.position}","${r.feeType}",${r.amount},"${r.date}","${r.status}","${r.paymentMethod}","${r.notes}"`,
      )
      .join('\n');

    return {
      fileName: `fees-payments-${academy.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.csv`,
      total: exportRows.length,
      csvContent: csvHeaders + csvLines,
      records: exportRows,
    };
  }

  async getFinanceCommittee(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    // Auto-sync any match evaluation game reports of academy players
    const academyPlayers = await PlayerProfile.find({
      $or: [{ academyId: academy._id }, { academy: academy.name }, { currentClub: academy.name }],
    }).select('_id fullName position');
    const academyPlayerIds = academyPlayers.map((p) => p._id);

    if (academyPlayerIds.length > 0) {
      const matchReports = await MatchRecord.find({
        playerId: { $in: academyPlayerIds },
        'coachReview.paymentStatus': 'PAID',
      }).lean();

      for (const m of matchReports) {
        const cost = m.coachReview?.paymentAmount || 6.99;
        const commissionAcademy = parseFloat((cost * 0.4).toFixed(3));
        const status =
          m.coachReview?.status === 'COMPLETED'
            ? 'COMPLETED'
            : (m.coachReview?.status as string) === 'REJECTED'
              ? 'REJECTED'
              : 'PENDING';

        await AcademyFinanceTransaction.findOneAndUpdate(
          { reportId: m._id },
          {
            academyId: academy._id,
            playerId: m.playerId,
            coachId: m.coachReview?.coachId,
            reportId: m._id,
            transactionType: 'Game Report',
            cost,
            commissionAcademy,
            transactionDate: m.createdAt || m.matchDate || new Date(),
            status,
            notes: `Stripe payment via ${m.coachReview?.transactionId || 'session'}`,
          },
          { upsert: true, new: true },
        );
      }

      // Auto-sync any paid parent match reports of academy players
      const parentReports = await ParentMatchReport.find({
        childPlayerId: { $in: academyPlayerIds },
        paymentStatus: 'PAID',
      }).lean();

      for (const pr of parentReports) {
        const cost = pr.coachReviewPrice || 25.0;
        const commissionAcademy = parseFloat((cost * 0.4).toFixed(2));
        const k10Commission = parseFloat((cost - commissionAcademy).toFixed(2));
        const status = pr.coachReviewStatus === 'REJECTED' ? 'REJECTED' : 'COMPLETED';

        await AcademyFinanceTransaction.findOneAndUpdate(
          { reportId: pr._id },
          {
            academyId: academy._id,
            playerId: pr.childPlayerId,
            coachId: pr.coachId,
            reportId: pr._id,
            transactionType: 'Parent Match Report',
            cost,
            commissionAcademy,
            transactionDate: pr.paidAt || pr.createdAt || new Date(),
            status,
            notes: `Paid to K10 via Stripe (${pr.transactionId || 'session'}). K10 Commission: $${k10Commission}, Academy Share: $${commissionAcademy}`,
          },
          { upsert: true, new: true },
        );
      }
    }

    const filter: any = { academyId: academy._id };

    if (
      query.status &&
      ['COMPLETED', 'PENDING', 'REJECTED'].includes(String(query.status).toUpperCase())
    ) {
      filter.status = String(query.status).toUpperCase();
    }

    if (query.transactionType) {
      filter.transactionType = { $regex: new RegExp(String(query.transactionType).trim(), 'i') };
    }

    if (query.startDate || query.endDate) {
      filter.transactionDate = {};
      if (query.startDate) filter.transactionDate.$gte = new Date(query.startDate);
      if (query.endDate) filter.transactionDate.$lte = new Date(query.endDate);
    }

    // Pagination
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    // Search by player
    if (query.search) {
      const searchRegex = new RegExp(String(query.search).trim(), 'i');
      const matchedPlayers = await PlayerProfile.find({ fullName: searchRegex }).select('_id');
      const matchedPlayerIds = matchedPlayers.map((p) => p._id);
      filter.playerId = { $in: matchedPlayerIds };
    }

    const [totalRecords, transactionDocs] = await Promise.all([
      AcademyFinanceTransaction.countDocuments(filter),
      AcademyFinanceTransaction.find(filter)
        .populate('playerId', 'fullName position profileImage currentClub')
        .sort({ transactionDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // Calculate Dynamic Stats strictly from DB
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [gameReportsCount, pendingCount, rejectedCount, totalEarningsAgg, thisMonthAgg] =
      await Promise.all([
        academyPlayerIds.length > 0
          ? MatchRecord.countDocuments({ playerId: { $in: academyPlayerIds } })
          : AcademyFinanceTransaction.countDocuments({
              academyId: academy._id,
              transactionType: { $regex: /Game Report|Parent Match Report|Match Report/i },
            }),
        AcademyFinanceTransaction.countDocuments({
          academyId: academy._id,
          status: 'PENDING',
        }),
        AcademyFinanceTransaction.countDocuments({
          academyId: academy._id,
          status: 'REJECTED',
        }),
        AcademyFinanceTransaction.aggregate([
          { $match: { academyId: academy._id, status: 'COMPLETED' } },
          { $group: { _id: null, total: { $sum: '$commissionAcademy' } } },
        ]),
        AcademyFinanceTransaction.aggregate([
          {
            $match: {
              academyId: academy._id,
              status: 'COMPLETED',
              transactionDate: { $gte: startOfMonth },
            },
          },
          { $group: { _id: null, total: { $sum: '$commissionAcademy' } } },
        ]),
      ]);

    const totalEarnings = totalEarningsAgg[0]?.total
      ? parseFloat(totalEarningsAgg[0].total.toFixed(2))
      : 0;
    const thisMonthEarnings = thisMonthAgg[0]?.total
      ? parseFloat(thisMonthAgg[0].total.toFixed(2))
      : 0;

    const formattedTransactions = transactionDocs.map((doc: any) => {
      const player = doc.playerId || {};
      const tDate = doc.transactionDate ? new Date(doc.transactionDate) : new Date();
      const dateIso = tDate.toISOString().split('T')[0];

      return {
        _id: doc._id,
        id: doc._id,
        playerId: player._id || null,
        player: {
          _id: player._id || null,
          id: player._id || null,
          name: (player.fullName || 'Player').toUpperCase(),
          position: (player.position || 'Forward').toUpperCase(),
          avatar: player.profileImage || '',
        },
        transactionType: doc.transactionType,
        type: doc.transactionType,
        cost: doc.cost,
        costFormatted: `$ ${doc.cost.toFixed(2)}`,
        commissionAcademy: doc.commissionAcademy,
        commissionAcademyFormatted: `$ ${doc.commissionAcademy.toFixed(3)}`,
        commissionPercentage: '40%',
        transactionDate: doc.transactionDate,
        date: dateIso,
        status: doc.status,
        notes: doc.notes || '',
        createdAt: doc.createdAt,
      };
    });

    return {
      stats: {
        gameReportsCount,
        pendingCount,
        rejectedCount,
        totalEarnings,
        totalEarningsFormatted: `$ ${totalEarnings.toFixed(2)}`,
        thisMonthEarnings,
        thisMonthEarningsFormatted: `$ ${thisMonthEarnings.toFixed(2)}`,
        commissionRate: '40%',
        currency: '$',
      },
      transactions: formattedTransactions,
      meta: {
        page,
        limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  async createFinanceTransaction(user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const player = await PlayerProfile.findById(payload.playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    const cost = Number(payload.cost);
    if (isNaN(cost) || cost <= 0) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Valid cost is required');
    }

    // Default commission is 40% if not explicitly passed
    const commissionAcademy =
      payload.commissionAcademy !== undefined
        ? Number(payload.commissionAcademy)
        : parseFloat((cost * 0.4).toFixed(3));

    const newTransaction = await AcademyFinanceTransaction.create({
      academyId: academy._id,
      playerId: player._id,
      coachId: payload.coachId || undefined,
      reportId: payload.reportId || undefined,
      validationId: payload.validationId || undefined,
      transactionType: payload.transactionType || 'Game Report',
      cost,
      commissionAcademy,
      transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : new Date(),
      status: payload.status || 'COMPLETED',
      notes: payload.notes || '',
    });

    return {
      message: 'Finance transaction recorded successfully',
      transaction: newTransaction,
    };
  }

  async updateFinanceTransactionStatus(
    transactionId: string,
    user: any,
    payload: any,
    academyIdentifier?: string,
  ) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const transaction = await AcademyFinanceTransaction.findOne({
      _id: transactionId,
      academyId: academy._id,
    });

    if (!transaction) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Finance transaction record not found');
    }

    if (payload.status) {
      transaction.status = payload.status;
    }
    if (payload.notes !== undefined) {
      transaction.notes = payload.notes;
    }

    await transaction.save();

    return {
      message: 'Finance transaction status updated successfully',
      transaction,
    };
  }
}

export const academyFinanceService = new AcademyFinanceService();
