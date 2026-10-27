import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { ExtraEvent } from '../academy.model';
import { getStripeClient } from '@/config/stripe';
import { logger } from '@/utils/logger';

export const TOURNAMENT_PRESET_BADGES = [
  {
    id: 'RED_DEVILS',
    name: 'RED DEVILS ACADEMY',
    color: '#EF4444',
    icon: 'shield-devil',
  },
  {
    id: 'BLUE_TIGERS',
    name: 'BLUE TIGERS FC',
    color: '#3B82F6',
    icon: 'shield-tiger',
  },
  {
    id: 'GREEN_HAWKS',
    name: 'GREEN HAWKS ACADEMY',
    color: '#10B981',
    icon: 'shield-hawk',
  },
  {
    id: 'YELLOW_HORNETS',
    name: 'YELLOW HORNETS FC',
    color: '#EAB308',
    icon: 'shield-hornet',
  },
];

export const STANDARD_BADGE_PRESETS = TOURNAMENT_PRESET_BADGES.map((p) => p.name);

export const normalizeStripeCurrency = (raw?: string): string => {
  if (!raw) return 'gbp';
  const val = raw.trim().toLowerCase();
  if (val === '£' || val === 'gbp') return 'gbp';
  if (val === '$' || val === 'usd') return 'usd';
  if (val === '€' || val === 'eur') return 'eur';
  if (val === '৳' || val === 'bdt') return 'bdt';
  if (/^[a-z]{3}$/.test(val)) return val;
  return 'usd';
};

export class AcademyTournamentRegistrationService {
  /**
   * Register a club for a tournament with roster & Stripe checkout session
   */
  async registerClub(eventId: string, payload: any, originUrl?: string) {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid event ID');
    }

    const event = await ExtraEvent.findById(eventId);
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    if (event.status === 'CLOSED') {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Registration is closed for this tournament');
    }

    const maxCap = event.maxCapacity || 8;
    const currentClubsCount = event.registeredClubs ? event.registeredClubs.length : 0;
    if (currentClubsCount >= maxCap) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'This tournament has reached maximum club capacity',
      );
    }

    // Check duplicate club name in this tournament
    const existingClub = event.registeredClubs?.find(
      (c) => c.clubName.trim().toLowerCase() === payload.clubName.trim().toLowerCase(),
    );
    if (existingClub) {
      throw new AppError(StatusCodes.CONFLICT, 'A club with this name is already registered');
    }

    const clubId = new Types.ObjectId();
    const fee = Number(event.registrationFee) || 0;
    const currency = normalizeStripeCurrency(event.currency);

    // Clean player roster rows
    const roster = Array.isArray(payload.roster)
      ? payload.roster
          .filter((p: any) => p && p.fullName && p.fullName.trim())
          .map((p: any) => ({
            _id: new Types.ObjectId(),
            fullName: p.fullName.trim(),
            dateOfBirth: p.dateOfBirth,
            shirtNo: p.shirtNo ? Number(p.shirtNo) : undefined,
          }))
      : [];

    let stripeSession: any = null;
    let paymentStatus: 'PAID' | 'PENDING' = 'PAID';

    if (fee > 0 && payload.paymentMethod !== 'MANUAL') {
      paymentStatus = 'PENDING';
      const stripe = getStripeClient();

      const baseUrl = originUrl || process.env.CLIENT_URL || 'http://localhost:3000';
      try {
        stripeSession = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency,
                product_data: {
                  name: `Club Registration: ${payload.clubName}`,
                  description: `Tournament Registration Fee for ${event.eventName} (${event.ageGroup || 'U-16'})`,
                },
                unit_amount: Math.round(fee * 100),
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          customer_email: payload.contactEmail,
          metadata: {
            type: 'TOURNAMENT_CLUB_REGISTRATION',
            paymentType: 'TOURNAMENT_CLUB_REGISTRATION',
            eventId: event._id.toString(),
            clubId: clubId.toString(),
            clubName: payload.clubName,
          },
          success_url: `${baseUrl}/dashboard/academy/management/extra-events/${event._id}?session_id={CHECKOUT_SESSION_ID}&payment=success`,
          cancel_url: `${baseUrl}/dashboard/academy/management/extra-events/${event._id}?payment=cancelled`,
        });
      } catch (stripeErr: any) {
        logger.error('Stripe checkout session creation failed:', stripeErr);
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Failed to initiate Stripe payment: ${stripeErr.message || 'Invalid payment parameters'}`,
        );
      }
    }

    const hasCustomLogo = Boolean(payload.logoUrl && String(payload.logoUrl).trim() !== '');

    let assignedBadgePreset: string | undefined;
    let assignedBadgeName: string | undefined;
    let assignedLogoUrl: string | undefined;

    if (hasCustomLogo) {
      assignedBadgePreset = 'CUSTOM';
      assignedBadgeName = payload.badgeName
        ? String(payload.badgeName).trim()
        : `${payload.clubName.trim()} Logo`;
      assignedLogoUrl = String(payload.logoUrl).trim();
    } else {
      let requestedPreset = payload.badgePreset ? String(payload.badgePreset).trim() : '';

      if (requestedPreset) {
        const isPresetTaken = (event.registeredClubs || []).some(
          (c) =>
            c.badgePreset && c.badgePreset.trim().toLowerCase() === requestedPreset.toLowerCase(),
        );

        if (isPresetTaken) {
          throw new AppError(
            StatusCodes.CONFLICT,
            `The badge preset "${requestedPreset}" has already been chosen by another club in this tournament. Please select a different badge preset or upload your custom club logo.`,
          );
        }
      } else {
        // Auto-assign next free preset badge if neither custom logo nor preset was provided
        const takenPresets = new Set(
          (event.registeredClubs || [])
            .filter((c) => c.badgePreset)
            .map((c) => c.badgePreset!.trim().toLowerCase()),
        );
        const freePreset = TOURNAMENT_PRESET_BADGES.find(
          (p) => !takenPresets.has(p.name.toLowerCase()) && !takenPresets.has(p.id.toLowerCase()),
        );
        requestedPreset = freePreset ? freePreset.name : 'RED DEVILS ACADEMY';
      }

      const matchedPreset =
        TOURNAMENT_PRESET_BADGES.find(
          (p) =>
            p.name.toLowerCase() === requestedPreset.toLowerCase() ||
            p.id.toLowerCase() === requestedPreset.toLowerCase(),
        ) || TOURNAMENT_PRESET_BADGES[0];

      assignedBadgePreset = matchedPreset.name;
      assignedBadgeName = matchedPreset.name;
      assignedLogoUrl = undefined; // Logo URL only comes if a custom logo is uploaded
    }

    const newClubRecord: any = {
      _id: clubId,
      clubName: payload.clubName.trim(),
      category: payload.category || event.ageGroup || 'U-16',
      badgePreset: assignedBadgePreset,
      badgeName: assignedBadgeName,
      logoUrl: assignedLogoUrl,
      coachName: payload.coachName.trim(),
      contactPerson: payload.contactPerson || payload.coachName,
      contactPhone: payload.contactPhone || '',
      contactEmail: payload.contactEmail.trim().toLowerCase(),
      paymentStatus,
      paidAmount: paymentStatus === 'PAID' ? fee : 0,
      stripeSessionId: stripeSession ? stripeSession.id : undefined,
      roster,
      registeredAt: new Date(),
    };

    event.registeredClubs = event.registeredClubs || [];
    event.registeredClubs.push(newClubRecord);

    if (paymentStatus === 'PAID') {
      event.currentAttendees = (event.currentAttendees || 0) + 1;
      if (event.maxCapacity && event.currentAttendees >= event.maxCapacity) {
        event.status = 'CLOSED';
      }
    }

    await event.save();

    return {
      message:
        paymentStatus === 'PENDING'
          ? 'Club registration initiated. Please complete payment.'
          : 'Club registered successfully',
      club: formatTournamentClub(newClubRecord),
      checkoutUrl: stripeSession?.url || null,
      sessionId: stripeSession?.id || null,
    };
  }

  /**
   * Handle incoming Stripe Webhook for Tournament Club Registration
   */
  async handleTournamentRegistrationStripeWebhook(sessionObject: any) {
    const { eventId, clubId, clubName } = sessionObject.metadata || {};
    if (!eventId) {
      logger.warn('Tournament Webhook: Missing eventId in session metadata');
      return;
    }

    const event = await ExtraEvent.findById(eventId);
    if (!event) {
      logger.warn(`Tournament Webhook: Event not found for ID ${eventId}`);
      return;
    }

    const club = event.registeredClubs?.find(
      (c) =>
        (clubId && c._id?.toString() === clubId) ||
        (sessionObject.id && c.stripeSessionId === sessionObject.id) ||
        (clubName && c.clubName.toLowerCase() === clubName.toLowerCase()),
    );

    if (club && club.paymentStatus !== 'PAID') {
      club.paymentStatus = 'PAID';
      club.paidAmount = sessionObject.amount_total
        ? sessionObject.amount_total / 100
        : Number(event.registrationFee) || 0;
      club.stripePaymentIntentId = sessionObject.payment_intent as string;

      event.currentAttendees = (event.currentAttendees || 0) + 1;
      if (event.maxCapacity && event.currentAttendees >= event.maxCapacity) {
        event.status = 'CLOSED';
      }

      await event.save();
      logger.info(
        `Tournament Webhook: Club ${club.clubName} payment confirmed for event ${event.eventName}`,
      );
    }
  }

  /**
   * Direct verification for local development or manual check
   */
  async verifyClubRegistrationPayment(eventId: string, sessionId: string) {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid event ID');
    }

    const event = await ExtraEvent.findById(eventId);
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || session.payment_status !== 'paid') {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Stripe payment has not been completed');
    }

    const club = event.registeredClubs?.find((c) => c.stripeSessionId === sessionId);
    if (!club) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        'Matching registered club not found for this session',
      );
    }

    if (club.paymentStatus !== 'PAID') {
      club.paymentStatus = 'PAID';
      club.paidAmount = session.amount_total
        ? session.amount_total / 100
        : Number(event.registrationFee) || 0;
      club.stripePaymentIntentId = session.payment_intent as string;

      event.currentAttendees = (event.currentAttendees || 0) + 1;
      await event.save();
    }

    return {
      message: 'Club registration payment verified successfully',
      club: formatTournamentClub(club),
    };
  }

  /**
   * Get all registered clubs with their rosters
   */
  async getRegisteredClubs(eventId: string) {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid event ID');
    }

    const event = await ExtraEvent.findById(eventId);
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
      groupA,
      groupB,
      unallocated,
      clubs,
    };
  }

  /**
   * Get tournament badge presets and check which ones are already taken (Separate Endpoint)
   */
  async getTournamentBadgePresets(eventId: string) {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid event ID');
    }

    const event = await ExtraEvent.findById(eventId).select('eventName registeredClubs').lean();
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    const registeredClubs = event.registeredClubs || [];
    const takenPresetNames = new Set(
      registeredClubs
        .filter((c: any) => c.badgePreset && c.badgePreset !== 'CUSTOM')
        .map((c: any) => c.badgePreset.trim().toLowerCase()),
    );

    const presets = TOURNAMENT_PRESET_BADGES.map((preset) => ({
      id: preset.id,
      name: preset.name,
      color: preset.color,
      icon: preset.icon,
      isTaken:
        takenPresetNames.has(preset.name.toLowerCase()) ||
        takenPresetNames.has(preset.id.toLowerCase()),
    }));

    const takenPresets = presets.filter((p) => p.isTaken).map((p) => p.name);
    const availablePresets = presets.filter((p) => !p.isTaken).map((p) => p.name);

    return {
      totalPresets: presets.length,
      presets,
      takenPresets,
      availablePresets,
    };
  }

  /**
   * Get single club roster
   */
  async getClubRoster(eventId: string, clubId: string) {
    if (!Types.ObjectId.isValid(eventId) || !Types.ObjectId.isValid(clubId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid event or club ID');
    }

    const event = await ExtraEvent.findById(eventId);
    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Tournament event not found');
    }

    const rawClub = event.registeredClubs?.find(
      (c) => c._id?.toString() === clubId || (c as any).clubId === clubId,
    );
    if (!rawClub) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Club not found in this tournament');
    }

    return formatTournamentClub(rawClub);
  }
}

/**
 * Standardize tournament club object representation for frontend consistency
 */
export const formatTournamentClub = (c: any) => {
  const idStr = c._id
    ? c._id.toString()
    : c.clubId
      ? c.clubId.toString()
      : new Types.ObjectId().toString();
  const nameStr = c.clubName || c.name || '';
  return {
    _id: idStr,
    clubId: idStr,
    clubName: nameStr,
    name: nameStr,
    category: c.category || 'U-16',
    badgePreset: c.badgePreset || null,
    badgeName: c.badgeName || c.badgePreset || null,
    logoUrl: c.logoUrl || null,
    coachName: c.coachName || '',
    contactPerson: c.contactPerson || '',
    contactPhone: c.contactPhone || '',
    contactEmail: c.contactEmail || '',
    paymentStatus: c.paymentStatus || 'PENDING',
    paidAmount: typeof c.paidAmount === 'number' ? c.paidAmount : 0,
    stripeSessionId: c.stripeSessionId || null,
    stripePaymentIntentId: c.stripePaymentIntentId || null,
    allocatedGroup: c.allocatedGroup || null,
    registeredAt: c.registeredAt || null,
    roster: (c.roster || []).map((p: any) => ({
      _id: p._id ? p._id.toString() : new Types.ObjectId().toString(),
      playerId: p._id ? p._id.toString() : undefined,
      fullName: p.fullName || p.name || '',
      name: p.fullName || p.name || '',
      dateOfBirth: p.dateOfBirth || '',
      shirtNo: typeof p.shirtNo === 'number' ? p.shirtNo : undefined,
    })),
  };
};

export const academyTournamentRegistrationService = new AcademyTournamentRegistrationService();
