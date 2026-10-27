import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { Team, ExtraEvent } from '../academy.model';
import { academyResolverService } from './academy-resolver.service';
import { TARGET_ATTENDEES_ENUM } from '../academy.interface';

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

      // Status badge styling metadata for UI
      let badgeVariant = 'green';
      if (ev.status === 'CLOSING SOON') badgeVariant = 'yellow';
      if (ev.status === 'CLOSED') badgeVariant = 'gray';

      return {
        _id: ev._id,
        eventName: ev.eventName,
        eventType: ev.eventType,
        group: ev.group,
        ageGroup: ev.ageGroup,
        targetAttendees: ev.targetAttendees,
        status: ev.status,
        statusBadge: {
          label: ev.status,
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
        canRegister: ev.status === 'OPEN' && (!maxCap || attendees < maxCap),
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
      status: ev.status,
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
      canRegister: ev.status === 'OPEN' && (!maxCap || attendees < maxCap),
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

    const event = await ExtraEvent.findOneAndDelete({
      _id: id,
      academyId: academy._id,
    });

    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Extra event not found');
    }

    return {
      message: 'Extra event deleted successfully',
    };
  }

  async registerForExtraEvent(
    id: string,
    user: any,
    participantData: any,
    academyIdentifier?: string,
  ) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const event = await ExtraEvent.findOne({
      _id: id,
      academyId: academy._id,
    });

    if (!event) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Extra event not found');
    }

    if (event.status === 'CLOSED') {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Registration is closed for this event');
    }

    if (event.maxCapacity && event.currentAttendees >= event.maxCapacity) {
      event.status = 'CLOSED';
      await event.save();
      throw new AppError(StatusCodes.BAD_REQUEST, 'This event has reached maximum capacity');
    }

    event.participants = event.participants || [];
    event.participants.push({
      userId: user?.userId ? new Types.ObjectId(user.userId) : undefined,
      name: participantData.name,
      email: participantData.email,
      phone: participantData.phone,
      teamName: participantData.teamName,
      registeredAt: new Date(),
      paidAmount: participantData.paidAmount || event.registrationFee || 0,
      paymentStatus:
        event.registrationFee && event.registrationFee > 0
          ? participantData.paymentStatus || 'PAID'
          : 'FREE',
    });

    event.currentAttendees = (event.currentAttendees || 0) + 1;

    if (event.maxCapacity && event.currentAttendees >= event.maxCapacity) {
      event.status = 'CLOSED';
    }

    await event.save();

    return {
      message: 'Registration completed successfully',
      currentAttendees: event.currentAttendees,
      maxCapacity: event.maxCapacity,
      status: event.status,
    };
  }
}

export const academyEventsService = new AcademyEventsService();
