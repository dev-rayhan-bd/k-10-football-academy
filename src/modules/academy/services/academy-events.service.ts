import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { Team, ExtraEvent, AcademyProfile, AcademyFeePayment } from '../academy.model';
import { PlayerProfile } from '@/modules/player/player.model';
import QueryBuilder from '@/builder/QueryBuilder';
import { env } from '@/config/env';
import { NotificationService } from '@/modules/notification/notification.service';
import { logger } from '@/utils/logger';
import { academyResolverService } from './academy-resolver.service';
import { TARGET_ATTENDEES_ENUM } from '../academy.interface';
import { getStripeClient } from '@/config/stripe';
import { academyStripeConnectService } from './academy-stripe-connect.service';
import { normalizeStripeCurrency } from './academy-tournament-registration.service';

const notificationService = new NotificationService();

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** An unpaid checkout holds a seat for 31 minutes (Stripe Checkout minimum expiry is 30). */
const PENDING_HOLD_MS = 31 * 60 * 1000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const isSamePerson = (p: any, userId: string, email: string) =>
  (userId && p.userId && String(p.userId) === userId) ||
  (email && p.email && String(p.email).toLowerCase() === email);

const isExpiredPending = (p: any, now = new Date()) =>
  p.paymentStatus === 'PENDING' &&
  now.getTime() - new Date(p.registeredAt || 0).getTime() > PENDING_HOLD_MS;

/** Confirmed places: paid/free individuals + paid clubs. */
const confirmedCount = (ev: any) =>
  (ev.participants || []).filter(
    (p: any) => p.paymentStatus === 'PAID' || p.paymentStatus === 'FREE',
  ).length + (ev.registeredClubs || []).filter((c: any) => c.paymentStatus === 'PAID').length;

/** Confirmed + seats held by an open (not expired) checkout. */
const heldCount = (ev: any, now = new Date()) =>
  confirmedCount(ev) +
  (ev.participants || []).filter(
    (p: any) => p.paymentStatus === 'PENDING' && !isExpiredPending(p, now),
  ).length;

/** Status computed at read time: the stored status, closed by deadline or capacity. */
export const effectiveEventStatus = (ev: any, now = new Date()) => {
  if (ev.status === 'CLOSED') {
    return { status: 'CLOSED', closedReason: 'Registration is closed for this event' };
  }
  if (ev.registrationDeadline && new Date(ev.registrationDeadline).getTime() < now.getTime()) {
    return { status: 'CLOSED', closedReason: 'The registration deadline has passed' };
  }
  if (ev.maxCapacity && heldCount(ev, now) >= Number(ev.maxCapacity)) {
    return { status: 'CLOSED', closedReason: 'This event is full' };
  }
  return { status: ev.status || 'OPEN', closedReason: null as string | null };
};

const isTournamentEvent = (ev: any) =>
  /tournament/i.test(String(ev.eventType || '')) ||
  (ev.tournamentStatus && ev.tournamentStatus !== 'REGISTRATION') ||
  (ev.registeredClubs || []).length > 0;

/** Public shape of an event: no participant / club contact data. */
const toPublicEvent = (ev: any, userId?: string, detail = false) => {
  const now = new Date();
  const eff = effectiveEventStatus(ev, now);
  const currency = ev.currency || '£';
  const fee = Number(ev.registrationFee) || 0;
  const maxCap = ev.maxCapacity ? Number(ev.maxCapacity) : null;
  const confirmed = confirmedCount(ev);
  const academy = ev.academyId && typeof ev.academyId === 'object' ? ev.academyId : null;
  const tournament = isTournamentEvent(ev);

  const myParticipant = userId
    ? (ev.participants || []).find(
        (p: any) => p.userId && String(p.userId) === userId && !isExpiredPending(p, now),
      )
    : null;
  const myClub = userId
    ? (ev.registeredClubs || []).find(
        (c: any) => c.registeredByUserId && String(c.registeredByUserId) === userId,
      )
    : null;

  return {
    _id: ev._id,
    eventName: ev.eventName,
    eventType: ev.eventType,
    isTournament: tournament,
    registrationMode: tournament ? 'CLUB' : 'INDIVIDUAL',
    group: ev.group,
    ageGroup: ev.ageGroup,
    targetAttendees: ev.targetAttendees,
    academy: academy
      ? {
          _id: academy._id,
          name: academy.name || '',
          logo: academy.logo || '',
          city: academy.city || '',
          country: academy.country || '',
        }
      : { _id: ev.academyId || null, name: '', logo: '', city: '', country: '' },
    eventDate: ev.eventDate,
    eventEndDate: ev.eventEndDate || null,
    formattedDate: ev.formattedDateRange || '',
    startTime: ev.startTime,
    endTime: ev.endTime,
    registrationDeadline: ev.registrationDeadline,
    venueName: ev.venueName,
    venueAddress: ev.venueAddress,
    bannerImage: ev.bannerImage || '',
    registrationFee: fee,
    currency,
    feeFormatted: fee > 0 ? `${currency} ${fee}` : 'Free',
    maxCapacity: maxCap,
    confirmedCount: confirmed,
    spotsLeft: maxCap ? Math.max(0, maxCap - heldCount(ev, now)) : null,
    status: eff.status,
    closedReason: eff.closedReason,
    canRegister: eff.status !== 'CLOSED' && !myParticipant && !myClub,
    tournamentStatus: ev.tournamentStatus || 'REGISTRATION',
    isLiveMode: !!ev.isLiveMode,
    myRegistration: myParticipant
      ? {
          type: 'INDIVIDUAL',
          participantId: myParticipant._id,
          paymentStatus: myParticipant.paymentStatus,
          registeredAt: myParticipant.registeredAt,
        }
      : myClub
        ? {
            type: 'CLUB',
            clubId: myClub._id,
            clubName: myClub.clubName,
            paymentStatus: myClub.paymentStatus,
            registeredAt: myClub.registeredAt,
          }
        : null,
    ...(detail
      ? {
          description: ev.description || '',
          requirements: ev.requirements || '',
          latitude: ev.latitude ?? null,
          longitude: ev.longitude ?? null,
          contactPerson: ev.contactPerson || '',
          contactPhone: ev.contactPhone || '',
          contactEmail: ev.contactEmail || '',
        }
      : {}),
    createdAt: ev.createdAt,
  };
};

export class AcademyEventsService {
  async getExtraEventsMeta(user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    // Reuse existing academy teams directly without creating any duplicate endpoints
    const teams = await Team.find({ academyId: academy._id })
      .select('_id teamName ageGroup gender')
      .lean();

    return {
      eventTypes: [
        'Summer Training Camp',
        'Tournament Registration',
        'Skills Workshop',
        'Friendly Match',
        'Trial',
        'Clinic',
        'Charity Event',
        'Other',
      ],
      groups: ['Academy Members', 'Grassroots Teams', 'Families', 'External Teams', 'All Members'],
      ageGroups: ['U-7', 'U-9', 'U-11', 'U-13', 'U-15', 'U-17', 'U-19', 'Senior', 'All Age Groups'],
      targetAttendees: [...TARGET_ATTENDEES_ENUM],
      statusOptions: ['OPEN', 'CLOSING SOON', 'CLOSED'],
      dateFilters: ['today', 'this_week', 'this_month', 'upcoming', 'past'],
      teams,
    };
  }

  async getExtraEvents(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const filter: any = { academyId: academy._id };

    // Filter by Event Type (e.g. Training Camp, Tournament, Workshop)
    if (query.eventType) {
      filter.eventType = { $regex: new RegExp(String(query.eventType).trim(), 'i') };
    }

    // Filter by Status (OPEN, CLOSING SOON, CLOSED)
    if (
      query.status &&
      ['OPEN', 'CLOSING SOON', 'CLOSED'].includes(String(query.status).toUpperCase())
    ) {
      filter.status = String(query.status).toUpperCase();
    }

    // Filter by group, ageGroup, targetAttendees
    if (query.group) {
      filter.group = { $regex: new RegExp(String(query.group).trim(), 'i') };
    }
    if (query.ageGroup) {
      filter.ageGroup = { $regex: new RegExp(String(query.ageGroup).trim(), 'i') };
    }
    if (query.targetAttendees) {
      filter.targetAttendees = { $regex: new RegExp(String(query.targetAttendees).trim(), 'i') };
    }

    // Filter by Date (Date dropdown)
    if (query.date) {
      const now = new Date();
      if (query.date === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
          999,
        );
        filter.eventDate = { $gte: startOfDay, $lte: endOfDay };
      } else if (query.date === 'this_week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);
        filter.eventDate = { $gte: startOfWeek, $lte: endOfWeek };
      } else if (query.date === 'this_month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        filter.eventDate = { $gte: startOfMonth, $lte: endOfMonth };
      } else if (query.date === 'upcoming') {
        filter.eventDate = { $gte: new Date() };
      } else if (query.date === 'past') {
        filter.eventDate = { $lt: new Date() };
      } else {
        const parsed = new Date(query.date);
        if (!isNaN(parsed.getTime())) {
          const start = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
          const end = new Date(
            parsed.getFullYear(),
            parsed.getMonth(),
            parsed.getDate(),
            23,
            59,
            59,
            999,
          );
          filter.eventDate = { $gte: start, $lte: end };
        }
      }
    }

    // Search by name, venue, eventType
    if (query.searchTerm || query.search) {
      const term = String(query.searchTerm || query.search).trim();
      const regex = new RegExp(term, 'i');
      filter.$or = [
        { eventName: regex },
        { eventType: regex },
        { venueName: regex },
        { venueAddress: regex },
      ];
    }

    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const [totalRecords, events] = await Promise.all([
      ExtraEvent.countDocuments(filter),
      ExtraEvent.find(filter).sort({ eventDate: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const formattedEvents = events.map((ev: any) => {
      const currency = ev.currency || '£';
      const fee = Number(ev.registrationFee) || 0;
      const maxCap = ev.maxCapacity ? Number(ev.maxCapacity) : null;
      const attendees =
        Number(ev.currentAttendees) ||
        (Array.isArray(ev.participants) ? ev.participants.length : 0);

      const eff = effectiveEventStatus(ev);
      // Status badge styling metadata for UI
      let badgeVariant = 'green';
      if (eff.status === 'CLOSING SOON') badgeVariant = 'yellow';
      if (eff.status === 'CLOSED') badgeVariant = 'gray';

      return {
        _id: ev._id,
        eventName: ev.eventName,
        eventType: ev.eventType,
        group: ev.group,
        ageGroup: ev.ageGroup,
        targetAttendees: ev.targetAttendees,
        status: eff.status,
        closedReason: eff.closedReason,
        statusBadge: {
          label: eff.status,
          variant: badgeVariant,
        },
        formattedDate: ev.formattedDateRange || '',
        eventDate: ev.eventDate,
        eventEndDate: ev.eventEndDate,
        startTime: ev.startTime,
        endTime: ev.endTime,
        registrationDeadline: ev.registrationDeadline,
        venueName: ev.venueName,
        venueAddress: ev.venueAddress,
        latitude: ev.latitude,
        longitude: ev.longitude,
        registrationFee: fee,
        currency,
        feeFormatted: `${currency} ${fee}`,
        currentAttendees: attendees,
        maxCapacity: maxCap,
        capacityRatio: maxCap ? `${attendees}/${maxCap}` : `${attendees}/∞`,
        description: ev.description,
        requirements: ev.requirements || '',
        contactPerson: ev.contactPerson,
        contactPhone: ev.contactPhone,
        contactEmail: ev.contactEmail,
        bannerImage: ev.bannerImage || '',
        canRegister: eff.status !== 'CLOSED',
        shareUrl: `/dashboard/academy/management/extra-events/${ev._id}`,
        tournamentStatus: ev.tournamentStatus || 'REGISTRATION',
        isLiveMode: !!ev.isLiveMode,
        createdAt: ev.createdAt,
      };
    });

    return {
      events: formattedEvents,
      meta: {
        page,
        limit,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    };
  }

  async getExtraEventById(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const event = await ExtraEvent.findOne({
      _id: id,
      academyId: academy._id,
    }).lean();

    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Extra event not found');
    }

    const ev: any = event;
    const currency = ev.currency || '£';
    const fee = Number(ev.registrationFee) || 0;
    const maxCap = ev.maxCapacity ? Number(ev.maxCapacity) : null;
    const attendees =
      Number(ev.currentAttendees) || (Array.isArray(ev.participants) ? ev.participants.length : 0);

    return {
      _id: ev._id,
      eventName: ev.eventName,
      eventType: ev.eventType,
      group: ev.group,
      ageGroup: ev.ageGroup,
      targetAttendees: ev.targetAttendees,
      status: effectiveEventStatus(ev).status,
      closedReason: effectiveEventStatus(ev).closedReason,
      formattedDate: ev.formattedDateRange || '',
      eventDate: ev.eventDate,
      eventEndDate: ev.eventEndDate,
      startTime: ev.startTime,
      endTime: ev.endTime,
      registrationDeadline: ev.registrationDeadline,
      venueName: ev.venueName,
      venueAddress: ev.venueAddress,
      latitude: ev.latitude,
      longitude: ev.longitude,
      registrationFee: fee,
      currency,
      feeFormatted: `${currency} ${fee}`,
      currentAttendees: attendees,
      maxCapacity: maxCap,
      capacityRatio: maxCap ? `${attendees}/${maxCap}` : `${attendees}/∞`,
      description: ev.description,
      requirements: ev.requirements || '',
      contactPerson: ev.contactPerson,
      contactPhone: ev.contactPhone,
      contactEmail: ev.contactEmail,
      bannerImage: ev.bannerImage || '',
      participants: ev.participants || [],
      tournamentStatus: ev.tournamentStatus || 'REGISTRATION',
      isLiveMode: !!ev.isLiveMode,
      simulationStep: ev.simulationStep || 'NOT_STARTED',
      registeredClubs: ev.registeredClubs || [],
      fixtures: ev.fixtures || [],
      standings: ev.standings || [],
      bracket: ev.bracket || {
        semifinals: [],
        grandFinal: null,
      },
      canRegister: effectiveEventStatus(ev).status !== 'CLOSED',
      shareUrl: `/dashboard/academy/management/extra-events/${ev._id}`,
      createdAt: ev.createdAt,
      updatedAt: ev.updatedAt,
    };
  }

  async createExtraEvent(user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const currentPlan = academy.currentPlan || 'FREE';
    const isElite = currentPlan === 'ELITE' || currentPlan === 'PREMIUM';
    if (!isElite && user.role !== 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Upgrade to the K10 Elite Plan to unlock this feature. The Elite Plan gives your Academy access to advanced team management, tournament and event creation, online store management, game report commissions, player profile transfers, and additional exclusive benefits.',
      );
    }

    const event = new ExtraEvent({
      academyId: academy._id,
      eventName: payload.eventName,
      eventType: payload.eventType,
      group: payload.group,
      ageGroup: payload.ageGroup,
      targetAttendees: payload.targetAttendees,
      eventDate: new Date(payload.eventDate),
      eventEndDate: payload.eventEndDate ? new Date(payload.eventEndDate) : undefined,
      formattedDateRange: payload.formattedDateRange,
      startTime: payload.startTime,
      endTime: payload.endTime,
      registrationDeadline: new Date(payload.registrationDeadline),
      venueName: payload.venueName,
      venueAddress: payload.venueAddress,
      latitude: payload.latitude !== undefined ? Number(payload.latitude) : undefined,
      longitude: payload.longitude !== undefined ? Number(payload.longitude) : undefined,
      registrationFee: Number(payload.registrationFee) || 0,
      currency: payload.currency || '£',
      maxCapacity: payload.maxCapacity ? Number(payload.maxCapacity) : undefined,
      currentAttendees: 0,
      description: payload.description,
      requirements: payload.requirements,
      contactPerson: payload.contactPerson,
      contactPhone: payload.contactPhone,
      contactEmail: payload.contactEmail,
      bannerImage: payload.bannerImage || '',
      status: payload.status || 'OPEN',
      participants: [],
      tournamentStatus: 'REGISTRATION',
      isLiveMode: false,
      simulationStep: 'NOT_STARTED',
      registeredClubs: [],
      fixtures: [],
      standings: [],
    });

    await event.save();

    return {
      message: 'Extra event created successfully',
      event,
    };
  }

  async updateExtraEvent(id: string, user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const event = await ExtraEvent.findOne({
      _id: id,
      academyId: academy._id,
    });

    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Extra event not found');
    }

    if (payload.eventName) event.eventName = payload.eventName;
    if (payload.eventType) event.eventType = payload.eventType;
    if (payload.group) event.group = payload.group;
    if (payload.ageGroup) event.ageGroup = payload.ageGroup;
    if (payload.targetAttendees) event.targetAttendees = payload.targetAttendees;
    if (payload.eventDate) event.eventDate = new Date(payload.eventDate);
    if (payload.eventEndDate !== undefined)
      event.eventEndDate = payload.eventEndDate ? new Date(payload.eventEndDate) : undefined;
    if (payload.formattedDateRange !== undefined)
      event.formattedDateRange = payload.formattedDateRange;
    if (payload.startTime) event.startTime = payload.startTime;
    if (payload.endTime) event.endTime = payload.endTime;
    if (payload.registrationDeadline)
      event.registrationDeadline = new Date(payload.registrationDeadline);
    if (payload.venueName) event.venueName = payload.venueName;
    if (payload.venueAddress) event.venueAddress = payload.venueAddress;
    if (payload.latitude !== undefined) event.latitude = Number(payload.latitude);
    if (payload.longitude !== undefined) event.longitude = Number(payload.longitude);
    if (payload.registrationFee !== undefined)
      event.registrationFee = Number(payload.registrationFee) || 0;
    if (payload.currency) event.currency = payload.currency;
    if (payload.maxCapacity !== undefined)
      event.maxCapacity = payload.maxCapacity ? Number(payload.maxCapacity) : undefined;
    if (payload.description) event.description = payload.description;
    if (payload.requirements !== undefined) event.requirements = payload.requirements;
    if (payload.contactPerson) event.contactPerson = payload.contactPerson;
    if (payload.contactPhone) event.contactPhone = payload.contactPhone;
    if (payload.contactEmail) event.contactEmail = payload.contactEmail;
    if (payload.bannerImage !== undefined) event.bannerImage = payload.bannerImage;
    if (payload.status) event.status = payload.status;

    await event.save();

    return {
      message: 'Extra event updated successfully',
      event,
    };
  }

  async deleteExtraEvent(id: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const existing = await ExtraEvent.findOne({ _id: id, academyId: academy._id })
      .select('participants.paymentStatus registeredClubs.paymentStatus')
      .lean();
    if (!existing) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Extra event not found');
    }
    const paidCount =
      ((existing as any).participants || []).filter((p: any) => p.paymentStatus === 'PAID').length +
      ((existing as any).registeredClubs || []).filter((c: any) => c.paymentStatus === 'PAID')
        .length;
    if (paidCount > 0) {
      throw new AppError(
        StatusCodes.CONFLICT,
        `This event has ${paidCount} paid registration(s). Close the event (status CLOSED) instead of deleting it, or refund the registrations first.`,
      );
    }
    await ExtraEvent.deleteOne({ _id: id, academyId: academy._id });

    return {
      message: 'Extra event deleted successfully',
    };
  }

  /**
   * Individual registration (player / parent / anyone, logged in or not).
   * Paid events ALWAYS go through Stripe Checkout; the seat is confirmed only by the Stripe
   * webhook (handleExtraEventRegistrationStripeWebhook). The client can never mark itself paid.
   */
  async registerForExtraEvent(id: string, user: any, participantData: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid event ID');
    }
    const event = await ExtraEvent.findById(id);
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Extra event not found');
    }

    const now = new Date();
    const effective = effectiveEventStatus(event, now);
    if (effective.status === 'CLOSED') {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        effective.closedReason || 'Registration is closed',
      );
    }

    const email = participantData.email ? String(participantData.email).trim().toLowerCase() : '';
    const userId = user?.userId ? String(user.userId) : '';
    if (!userId && !email) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Email is required when not logged in');
    }

    // Same person can't hold two seats. A stale unpaid checkout (expired) is dropped.
    event.participants = (event.participants || []).filter(
      (p: any) => !(isSamePerson(p, userId, email) && isExpiredPending(p, now)),
    );
    const existing = (event.participants || []).find((p: any) => isSamePerson(p, userId, email));
    if (existing) {
      throw new AppError(
        StatusCodes.CONFLICT,
        existing.paymentStatus === 'PENDING'
          ? 'You already have a registration waiting for payment. Complete it or try again in 30 minutes.'
          : 'You are already registered for this event',
      );
    }

    const fee = Number(event.registrationFee) || 0;
    const participantId = new Types.ObjectId();
    let checkoutUrl: string | null = null;
    let sessionId: string | null = null;
    const paymentStatus: 'PENDING' | 'FREE' = fee > 0 ? 'PENDING' : 'FREE';

    if (fee > 0) {
      const stripe = getStripeClient();
      const academyStripeAccountId =
        await academyStripeConnectService.getActiveConnectedStripeAccountId(event.academyId);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: normalizeStripeCurrency(event.currency),
              product_data: {
                name: `Event Registration: ${event.eventName}`,
                description: `Participant: ${participantData.name}`,
              },
              unit_amount: Math.round(fee * 100),
            },
            quantity: 1,
          },
        ],
        customer_email: email || undefined,
        // seat is held only while the checkout is open
        expires_at: Math.floor((now.getTime() + PENDING_HOLD_MS) / 1000),
        ...(academyStripeAccountId
          ? { payment_intent_data: { transfer_data: { destination: academyStripeAccountId } } }
          : {}),
        metadata: {
          type: 'EXTRA_EVENT_REGISTRATION',
          paymentType: 'EXTRA_EVENT_REGISTRATION',
          eventId: event._id.toString(),
          participantId: participantId.toString(),
          academyId: event.academyId?.toString() || '',
        },
        success_url: `${env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}&type=EXTRA_EVENT&eventId=${event._id}`,
        cancel_url: `${env.STRIPE_CANCEL_URL}?type=EXTRA_EVENT&eventId=${event._id}`,
      });
      checkoutUrl = session.url;
      sessionId = session.id;
    }

    event.participants.push({
      _id: participantId,
      userId: userId ? new Types.ObjectId(userId) : undefined,
      name: String(participantData.name).trim(),
      email: email || undefined,
      phone: participantData.phone,
      teamName: participantData.teamName,
      registeredAt: now,
      paidAmount: 0,
      paymentStatus,
      stripeSessionId: sessionId || undefined,
    } as any);

    if (paymentStatus === 'FREE') {
      event.currentAttendees = confirmedCount(event);
      if (event.maxCapacity && event.currentAttendees >= event.maxCapacity) event.status = 'CLOSED';
    }
    await event.save();

    if (paymentStatus === 'FREE') {
      await this.notifyAcademyOfRegistration(event, String(participantData.name));
    }

    return {
      message: checkoutUrl
        ? 'Complete the payment to confirm your place.'
        : 'Registration completed successfully',
      participantId,
      paymentStatus,
      requiresPayment: Boolean(checkoutUrl),
      checkoutUrl,
      sessionId,
      currentAttendees: event.currentAttendees,
      maxCapacity: event.maxCapacity ?? null,
      status: effectiveEventStatus(event).status,
    };
  }

  /** Stripe webhook: confirm a paid individual registration (idempotent). */
  async handleExtraEventRegistrationStripeWebhook(session: any) {
    const { eventId, participantId } = session?.metadata || {};
    if (!eventId || !Types.ObjectId.isValid(eventId)) return;
    const event = await ExtraEvent.findById(eventId);
    if (!event) return;

    const participant: any = (event.participants || []).find(
      (p: any) =>
        (participantId && String(p._id) === participantId) ||
        (session.id && p.stripeSessionId === session.id),
    );
    if (!participant || participant.paymentStatus === 'PAID') return;
    if (participant.stripeSessionId && participant.stripeSessionId !== session.id) return;

    participant.paymentStatus = 'PAID';
    participant.paidAmount = session.amount_total
      ? session.amount_total / 100
      : Number(event.registrationFee) || 0;
    participant.stripePaymentIntentId = session.payment_intent || undefined;
    event.currentAttendees = confirmedCount(event);
    if (event.maxCapacity && event.currentAttendees >= event.maxCapacity) event.status = 'CLOSED';
    await event.save();

    // Record in AcademyFeePayment so the fees-payments dashboard shows it with avatar
    try {
      const txnId = session.payment_intent || session.id;
      const alreadyRecorded = await AcademyFeePayment.findOne({
        academyId: event.academyId,
        transactionId: txnId,
      }).lean();
      if (!alreadyRecorded) {
        let playerProfileId: Types.ObjectId | undefined;
        if (participant.userId) {
          const pp = await PlayerProfile.findOne({ userId: participant.userId })
            .select('_id')
            .lean();
          if (pp) playerProfileId = pp._id as Types.ObjectId;
        }
        await AcademyFeePayment.create({
          academyId: event.academyId,
          playerId: playerProfileId,
          eventId: event._id,
          feeType: `Event Registration Fee (${event.eventName || 'Extra Event'})`,
          amount: participant.paidAmount,
          paymentDate: new Date(),
          status: 'PAID',
          paymentMethod: 'STRIPE',
          transactionId: txnId,
          notes: `Registration fee paid by ${participant.name}`,
        });
      }
    } catch (err: any) {
      logger.warn(`Failed to record AcademyFeePayment for event registration: ${err.message}`);
    }

    await this.notifyAcademyOfRegistration(event, participant.name);
    if (participant.userId) {
      await notificationService.createNotification({
        recipientId: participant.userId,
        recipientRole: 'PLAYER',
        title: 'Event registration confirmed',
        message: `Your place at ${event.eventName} is confirmed.`,
        type: 'EXTRA_EVENT_REGISTERED',
        data: { eventId: event._id },
      });
    }
  }

  private async notifyAcademyOfRegistration(event: any, who: string) {
    const academy = await AcademyProfile.findById(event.academyId).select('userId').lean();
    if (!academy?.userId) return;
    await notificationService
      .createNotification({
        recipientId: academy.userId,
        recipientRole: 'ACADEMY',
        title: 'New event registration',
        message: `${who} registered for ${event.eventName}.`,
        type: 'EXTRA_EVENT_REGISTRATION',
        data: { eventId: event._id },
      })
      .catch(() => null);
  }

  // ==========================================
  // PUBLIC / PLAYER / CLUB DISCOVERY
  // ==========================================
  /** Public event list (no login needed). Never returns participant or club contact data. */
  async getPublicEvents(query: any = {}, user?: any) {
    const q: Record<string, unknown> = { ...query };
    const and: Record<string, any>[] = [];
    const now = new Date();

    if (q.academyId) {
      if (!Types.ObjectId.isValid(String(q.academyId))) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid academyId');
      }
      and.push({ academyId: new Types.ObjectId(String(q.academyId)) });
    }
    const exact = (field: string, key: string) => {
      const v = String(q[key] || '').trim();
      if (v && v.toUpperCase() !== 'ALL') {
        and.push({ [field]: { $regex: `^${escapeRegex(v)}$`, $options: 'i' } });
      }
    };
    exact('eventType', 'eventType');
    exact('ageGroup', 'ageGroup');
    exact('targetAttendees', 'targetAttendees');

    // default: upcoming events only
    const when = String(q.when || 'upcoming').toLowerCase();
    if (when === 'upcoming') and.push({ eventDate: { $gte: startOfDay(now) } });
    else if (when === 'past') and.push({ eventDate: { $lt: startOfDay(now) } });
    else if (when !== 'all') {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid when. Use upcoming, past or all');
    }

    const onlyOpen = String(q.openOnly || '').toLowerCase() === 'true';
    if (onlyOpen) {
      and.push({ status: { $ne: 'CLOSED' }, registrationDeadline: { $gte: now } });
    }

    const term = String(q.searchTerm || q.search || '').trim();
    const listQuery: Record<string, unknown> = {
      page: Math.max(1, Number(q.page) || 1),
      limit: Math.max(1, Math.min(100, Number(q.limit) || 10)),
      sort:
        typeof q.sort === 'string' && q.sort
          ? q.sort
          : when === 'past'
            ? '-eventDate'
            : 'eventDate',
      ...(term ? { searchTerm: escapeRegex(term) } : {}),
    };

    const builder = new QueryBuilder(ExtraEvent.find(and.length ? { $and: and } : {}), listQuery)
      .search(['eventName', 'eventType', 'venueName', 'venueAddress'])
      .filter()
      .sort()
      .paginate();
    const [events, meta] = await Promise.all([
      builder.modelQuery.populate('academyId', 'name logo city country').lean(),
      builder.countTotal(),
    ]);

    return {
      meta,
      events: (events as any[]).map((ev) => toPublicEvent(ev, user?.userId)),
    };
  }

  /** Public event detail (+ my registration when logged in). */
  async getPublicEventById(id: string, user?: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid event ID');
    }
    const ev: any = await ExtraEvent.findById(id)
      .populate('academyId', 'name logo city country')
      .lean();
    if (!ev) throw new AppError(StatusCodes.NOT_FOUND, 'Extra event not found');
    return toPublicEvent(ev, user?.userId, true);
  }

  /** Events the logged-in user registered for (individually, or a club they registered). */
  async getMyRegistrations(user: any, query: any = {}) {
    const me = new Types.ObjectId(String(user.userId));
    const listQuery: Record<string, unknown> = {
      page: Math.max(1, Number(query.page) || 1),
      limit: Math.max(1, Math.min(100, Number(query.limit) || 10)),
      sort: '-eventDate',
    };
    const builder = new QueryBuilder(
      ExtraEvent.find({
        $or: [{ 'participants.userId': me }, { 'registeredClubs.registeredByUserId': me }],
      }),
      listQuery,
    )
      .sort()
      .paginate();
    const [events, meta] = await Promise.all([
      builder.modelQuery.populate('academyId', 'name logo city country').lean(),
      builder.countTotal(),
    ]);
    return {
      meta,
      events: (events as any[]).map((ev) => toPublicEvent(ev, String(user.userId), true)),
    };
  }
}

export const academyEventsService = new AcademyEventsService();
