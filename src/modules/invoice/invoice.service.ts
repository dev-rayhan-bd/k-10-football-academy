import PDFDocument from 'pdfkit';
import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { ParentProfile, ParentChild } from '@/modules/parent/parent.model';
import { PlayerProfile } from '@/modules/player/player.model';
import {
  ExtraEvent,
  AcademyFeePayment,
  AcademyFinanceTransaction,
} from '@/modules/academy/academy.model';
import { IAcademyInvoice } from './invoice.interface';
import { AcademyInvoice } from './invoice.model';

export class InvoiceService {
  async createInvoice(payload: Partial<IAcademyInvoice>) {
    const count = await AcademyInvoice.countDocuments();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
    return AcademyInvoice.create({ ...payload, invoiceNumber });
  }

  async getInvoiceById(id: string) {
    const invoice = await AcademyInvoice.findById(id)
      .populate('parentId')
      .populate('childPlayerId')
      .populate('academyId');
    if (!invoice) {
      throw new AppError(404, 'Invoice not found');
    }
    return invoice;
  }

  async getInvoicesByAcademy(academyId: string) {
    return AcademyInvoice.find({ academyId })
      .populate('childPlayerId', 'fullName position')
      .sort({ createdAt: -1 });
  }

  async updateInvoiceStatus(id: string, status: 'UNPAID' | 'PAID' | 'OVERDUE') {
    const update: Record<string, unknown> = { status };
    if (status === 'PAID') {
      update.paidAt = new Date();
    }
    const invoice = await AcademyInvoice.findByIdAndUpdate(id, update, { new: true });
    if (!invoice) {
      throw new AppError(404, 'Invoice not found');
    }
    return invoice;
  }

  /**
   * Parent Portal: Get Event Entry Fees for Parent's Linked Children
   * Strictly filters ONLY event entry fees and syncs from child's academy ExtraEvents
   */
  async getParentEventInvoices(user: any, query: { status?: string } = {}) {
    const parentUserId = user?.userId || user?._id || user?.id;

    // Resolve parent profile
    const targetParentIds: any[] = [parentUserId];
    if (Types.ObjectId.isValid(parentUserId)) {
      const parentProfile = await ParentProfile.findOne({
        $or: [{ _id: parentUserId }, { userId: parentUserId }],
      });
      if (parentProfile) {
        targetParentIds.push(parentProfile._id);
        targetParentIds.push(parentProfile.userId);
      }
    }

    // 1. Find all children linked to this parent
    const links = await ParentChild.find({ parentId: { $in: targetParentIds } }).lean();
    const childPlayerIds = links.map((l) => l.childPlayerId);

    if (childPlayerIds.length === 0) {
      return [];
    }

    // 2. Fetch children profiles to find their academies
    const players = await PlayerProfile.find({ _id: { $in: childPlayerIds } }).lean();
    const academyIds: any[] = [];

    for (const player of players) {
      if (player.academyId) {
        academyIds.push(player.academyId);
      }
    }

    // 3. Auto-sync ExtraEvents with registrationFee > 0 from child's academy into AcademyInvoice
    if (academyIds.length > 0) {
      const extraEvents = await ExtraEvent.find({
        academyId: { $in: academyIds },
        registrationFee: { $gt: 0 },
      }).lean();

      for (const ev of extraEvents) {
        for (const player of players) {
          if (player.academyId && player.academyId.toString() === ev.academyId.toString()) {
            const existingInvoice = await AcademyInvoice.findOne({
              childPlayerId: player._id,
              $or: [{ eventId: ev._id }, { title: `${ev.eventName} Entry Fee` }],
            });

            const isParticipantPaid = (ev.participants || []).some(
              (p: any) =>
                p.paymentStatus === 'PAID' &&
                (p.name?.toLowerCase() === player.fullName?.toLowerCase() ||
                  (p.userId && p.userId.toString() === player.userId?.toString())),
            );

            if (!existingInvoice) {
              const currentYear = new Date(ev.eventDate || Date.now()).getFullYear();
              const count = await AcademyInvoice.countDocuments();
              const invoiceNumber = `INV-${currentYear}-${(count + 1).toString().padStart(3, '0')}`;

              await AcademyInvoice.create({
                parentId: targetParentIds[0],
                childPlayerId: player._id,
                academyId: ev.academyId,
                eventId: ev._id,
                feeType: 'EVENT_ENTRY_FEE',
                title: `${ev.eventName} Entry Fee`,
                invoiceNumber,
                amount: ev.registrationFee || 0,
                dueDate: ev.registrationDeadline || ev.eventDate || new Date(),
                status: isParticipantPaid ? 'PAID' : 'UNPAID',
                paidAt: isParticipantPaid ? new Date() : undefined,
              });
            } else if (isParticipantPaid && existingInvoice.status !== 'PAID') {
              existingInvoice.status = 'PAID';
              existingInvoice.paidAt = new Date();
              await existingInvoice.save();
            }
          }
        }
      }
    }

    // 4. Query only event entry fee invoices for these children
    const invoiceFilter: any = {
      childPlayerId: { $in: childPlayerIds },
      $or: [
        { feeType: 'EVENT_ENTRY_FEE' },
        { eventId: { $exists: true, $ne: null } },
        { title: { $regex: /Entry Fee|Event/i } },
      ],
    };

    const statusParam = (query.status || 'ALL').toUpperCase().trim();
    if (statusParam === 'PAID') {
      invoiceFilter.status = 'PAID';
    } else if (statusParam === 'UNPAID') {
      invoiceFilter.status = { $in: ['UNPAID', 'OVERDUE'] };
    }

    const invoices = await AcademyInvoice.find(invoiceFilter)
      .populate('childPlayerId', 'fullName position profileImage currentClub')
      .populate('academyId', 'name logo')
      .populate('eventId', 'eventName eventDate venueName venueAddress status')
      .sort({ createdAt: -1 })
      .lean();

    return invoices.map((inv: any) => {
      const isPaid = inv.status === 'PAID';
      const child = inv.childPlayerId || {};
      const academy = inv.academyId || {};
      const ev = inv.eventId || {};
      const due = inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : '';

      return {
        _id: inv._id,
        id: inv._id,
        title: inv.title,
        invoiceNumber: inv.invoiceNumber,
        idDisplay: `ID: ${inv.invoiceNumber}`,
        dueDate: due,
        dueDateFormatted: due ? `Due: ${due}` : '',
        amount: inv.amount,
        amountFormatted: `$${Number(inv.amount || 0).toFixed(2)}`,
        status: inv.status,
        displayStatus: isPaid ? 'Paid' : 'Unpaid',
        feeType: inv.feeType || 'EVENT_ENTRY_FEE',
        canPay: !isPaid,
        canDownload: isPaid,
        childPlayer: {
          _id: child._id,
          fullName: child.fullName || 'Athlete',
          position: child.position || 'Player',
          profileImage: child.profileImage || '',
        },
        academy: {
          _id: academy._id,
          name: academy.name || 'Academy',
          logo: academy.logo || '',
        },
        event: ev._id
          ? {
              _id: ev._id,
              eventName: ev.eventName,
              eventDate: ev.eventDate,
              venueName: ev.venueName,
            }
          : undefined,
        paidAt: inv.paidAt || null,
        transactionId: inv.transactionId || null,
        paymentMethod: inv.paymentMethod || null,
        createdAt: inv.createdAt,
      };
    });
  }

  /**
   * Parent initiates payment for event fee via Stripe Checkout
   */
  async payEventFeeInvoice(user: any, invoiceId: string) {
    const invoice = await AcademyInvoice.findById(invoiceId)
      .populate('childPlayerId', 'fullName position')
      .populate('academyId', 'name');

    if (!invoice) {
      throw new AppError(404, 'Event fee invoice not found');
    }

    if (invoice.status === 'PAID') {
      return {
        alreadyPaid: true,
        message: 'This event fee invoice has already been paid.',
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
      };
    }

    const stripe = getStripeClient();
    const child = (invoice.childPlayerId as any) || {};
    const academy = (invoice.academyId as any) || {};

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(invoice.amount * 100),
            product_data: {
              name: `${invoice.title} - ${child.fullName || 'Athlete'}`,
              description: `Event Entry Fee for ${academy.name || 'Academy'} (${invoice.invoiceNumber})`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentType: 'EVENT_ENTRY_FEE',
        invoiceId: invoice._id.toString(),
        childPlayerId: (invoice.childPlayerId?._id || invoice.childPlayerId || '').toString(),
        academyId: (invoice.academyId?._id || invoice.academyId || '').toString(),
        parentId: (user?.userId || user?._id || '').toString(),
      },
      success_url: `${env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}&invoiceId=${invoice._id}`,
      cancel_url: env.STRIPE_CANCEL_URL,
    });

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
    };
  }

  /**
   * Verify Event Fee Payment Session
   */
  async verifyEventFeePayment(sessionId?: string, invoiceId?: string) {
    const stripe = getStripeClient();
    let targetId = invoiceId;

    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid') {
          targetId = session.metadata?.invoiceId || targetId;
          if (targetId) {
            return this.finalizePaidInvoice(targetId, session.id);
          }
        }
      } catch (err: any) {
        logger.warn(`Stripe session retrieve error for fee payment: ${err.message}`);
      }
    }

    if (targetId) {
      const invoice = await AcademyInvoice.findById(targetId);
      if (invoice?.status === 'PAID') {
        return {
          success: true,
          message: 'Payment verified successfully (idempotent)',
          invoice,
        };
      }
    }

    return {
      success: false,
      message: 'Payment has not been completed or verified yet.',
    };
  }

  /**
   * Finalize Paid Event Fee Invoice
   */
  async finalizePaidInvoice(invoiceId: string, transactionId?: string) {
    const invoice = await AcademyInvoice.findById(invoiceId)
      .populate('childPlayerId')
      .populate('academyId');

    if (!invoice) {
      throw new AppError(404, 'Invoice not found');
    }

    if (invoice.status === 'PAID') {
      return {
        success: true,
        message: 'Invoice already paid',
        invoice,
      };
    }

    invoice.status = 'PAID';
    invoice.paidAt = new Date();
    invoice.paymentMethod = 'STRIPE';
    if (transactionId) invoice.transactionId = transactionId;
    await invoice.save();

    const child = (invoice.childPlayerId as any) || {};

    // 1. If invoice has eventId, register/update participant in ExtraEvent
    if (invoice.eventId) {
      try {
        const ev = await ExtraEvent.findById(invoice.eventId);
        if (ev) {
          ev.participants = ev.participants || [];
          const exists = ev.participants.find(
            (p: any) =>
              p.name?.toLowerCase() === child.fullName?.toLowerCase() ||
              (p.userId && child.userId && p.userId.toString() === child.userId.toString()),
          );
          if (exists) {
            exists.paymentStatus = 'PAID';
            exists.paidAmount = invoice.amount;
          } else {
            ev.participants.push({
              userId: child.userId,
              name: child.fullName || 'Athlete',
              registeredAt: new Date(),
              paidAmount: invoice.amount,
              paymentStatus: 'PAID',
            });
            ev.currentAttendees = (ev.currentAttendees || 0) + 1;
          }
          await ev.save();
        }
      } catch (evErr: any) {
        logger.warn(`Failed to update ExtraEvent participant: ${evErr.message}`);
      }
    }

    // 2. Record AcademyFeePayment for academy fee reports
    try {
      await AcademyFeePayment.create({
        academyId: invoice.academyId,
        playerId: invoice.childPlayerId,
        parentId: invoice.parentId,
        feeType: invoice.title || 'Event Entry Fee',
        amount: invoice.amount,
        paymentDate: new Date(),
        status: 'PAID',
        paymentMethod: 'STRIPE',
        transactionId: transactionId || invoice.invoiceNumber,
        notes: `Paid via Stripe for ${invoice.title} (${invoice.invoiceNumber})`,
      });
    } catch (feeErr: any) {
      logger.warn(`Failed to record AcademyFeePayment: ${feeErr.message}`);
    }

    // 3. Record AcademyFinanceTransaction (40% commission to Academy, 60% to K10)
    try {
      const cost = invoice.amount;
      const commissionAcademy = parseFloat((cost * 0.4).toFixed(2));
      const k10Commission = parseFloat((cost - commissionAcademy).toFixed(2));

      await AcademyFinanceTransaction.findOneAndUpdate(
        { invoiceId: invoice._id },
        {
          academyId: invoice.academyId,
          playerId: invoice.childPlayerId,
          transactionType: 'Event Entry Fee',
          cost,
          commissionAcademy,
          transactionDate: new Date(),
          status: 'COMPLETED',
          notes: `Paid to K10 via Stripe (${transactionId || 'session'}). K10: $${k10Commission}, Academy: $${commissionAcademy} for ${invoice.title}`,
        },
        { upsert: true, new: true },
      );
    } catch (finErr: any) {
      logger.warn(`Failed to record AcademyFinanceTransaction: ${finErr.message}`);
    }

    return {
      success: true,
      message: 'Invoice paid successfully',
      invoice,
    };
  }

  /**
   * Generate Downloadable Official PDF Invoice using pdfkit
   */
  async generateInvoicePdf(invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await AcademyInvoice.findById(invoiceId)
      .populate('childPlayerId', 'fullName position dateOfBirth country')
      .populate('academyId', 'name email phone address logo')
      .populate('parentId', 'fullName email phone');

    if (!invoice) {
      throw new AppError(404, 'Invoice not found');
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));

    // HEADER
    doc
      .fillColor('#00E676')
      .fontSize(22)
      .text('K10 FOOTBALL ANALYSIS', 50, 50)
      .fillColor('#666666')
      .fontSize(10)
      .text('Official Academy Invoice & Billing Receipt', 50, 78);

    // INVOICE DETAILS (Right side)
    doc
      .fillColor('#111111')
      .fontSize(16)
      .text('INVOICE', 350, 50, { align: 'right' })
      .fontSize(10)
      .fillColor('#444444')
      .text(`Invoice ID: ${invoice.invoiceNumber}`, 350, 72, { align: 'right' })
      .text(
        `Date: ${new Date(invoice.createdAt || Date.now()).toISOString().split('T')[0]}`,
        350,
        86,
        { align: 'right' },
      )
      .text(`Due Date: ${new Date(invoice.dueDate).toISOString().split('T')[0]}`, 350, 100, {
        align: 'right',
      });

    // STATUS BADGE
    const isPaid = invoice.status === 'PAID';
    doc.roundedRect(440, 120, 105, 24, 4).fill(isPaid ? '#E8F5E9' : '#FFEBEE');
    doc
      .fillColor(isPaid ? '#2E7D32' : '#C62828')
      .fontSize(11)
      .text(isPaid ? 'PAID' : 'UNPAID', 440, 126, { width: 105, align: 'center' });

    // DIVIDER
    doc.strokeColor('#EEEEEE').lineWidth(1).moveTo(50, 160).lineTo(545, 160).stroke();

    // BILL TO & ISSUED BY
    const child = (invoice.childPlayerId as any) || {};
    const academy = (invoice.academyId as any) || {};
    const parent = (invoice.parentId as any) || {};

    doc
      .fillColor('#888888')
      .fontSize(9)
      .text('BILL TO (ATHLETE & PARENT)', 50, 180)
      .fillColor('#111111')
      .fontSize(11)
      .text(`Athlete: ${child.fullName || 'Athlete'}`, 50, 195)
      .fontSize(10)
      .fillColor('#555555')
      .text(`Position: ${child.position || 'Forward'}`, 50, 210)
      .text(`Parent: ${parent.fullName || 'Parent'}`, 50, 225);

    doc
      .fillColor('#888888')
      .fontSize(9)
      .text('ISSUED BY (ACADEMY)', 300, 180)
      .fillColor('#111111')
      .fontSize(11)
      .text(academy.name || 'Football Academy', 300, 195)
      .fontSize(10)
      .fillColor('#555555')
      .text('Platform: K10 Football Academy Platform', 300, 210)
      .text(`Contact: ${academy.email || academy.phone || 'support@k10football.com'}`, 300, 225);

    // TABLE HEADER
    doc.rect(50, 260, 495, 25).fill('#F5F5F5');
    doc
      .fillColor('#333333')
      .fontSize(10)
      .text('ITEM / DESCRIPTION', 60, 268)
      .text('TYPE', 300, 268)
      .text('AMOUNT', 480, 268, { align: 'right' });

    // TABLE ROW
    doc
      .fillColor('#111111')
      .fontSize(10)
      .text(invoice.title, 60, 298)
      .fillColor('#666666')
      .text('Event Entry Fee', 300, 298)
      .fillColor('#111111')
      .text(`$${Number(invoice.amount || 0).toFixed(2)}`, 480, 298, { align: 'right' });

    doc.strokeColor('#EEEEEE').lineWidth(1).moveTo(50, 325).lineTo(545, 325).stroke();

    // TOTALS
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Subtotal:', 350, 345)
      .text(`$${Number(invoice.amount || 0).toFixed(2)}`, 480, 345, { align: 'right' })
      .fillColor('#111111')
      .fontSize(12)
      .text('Total Amount:', 350, 365)
      .text(`$${Number(invoice.amount || 0).toFixed(2)}`, 480, 365, { align: 'right' });

    if (isPaid && invoice.paidAt) {
      doc
        .fontSize(10)
        .fillColor('#2E7D32')
        .text(`Paid On: ${new Date(invoice.paidAt).toLocaleDateString()}`, 350, 390)
        .text(`Payment Method: ${invoice.paymentMethod || 'Stripe Online'}`, 350, 405);
    }

    // FOOTER
    doc.strokeColor('#EEEEEE').lineWidth(1).moveTo(50, 720).lineTo(545, 720).stroke();

    doc
      .fontSize(8)
      .fillColor('#999999')
      .text(
        'Thank you for your payment. This invoice was electronically generated by K10 Football Academy Platform.',
        50,
        735,
        { align: 'center', width: 495 },
      );

    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        const buffer = Buffer.concat(buffers);
        resolve({
          buffer,
          filename: `Invoice-${invoice.invoiceNumber}.pdf`,
        });
      });
      doc.on('error', reject);
    });
  }
}

export const invoiceService = new InvoiceService();
