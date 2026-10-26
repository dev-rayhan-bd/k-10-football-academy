import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { Team } from '../academy.model';
import bcrypt from 'bcryptjs';
import { PlayerProfile } from '@/modules/player/player.model';
import { User } from '@/modules/user/user.model';
import { ParentProfile, ParentChild } from '@/modules/parent/parent.model';
import { env } from '@/config/env';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { academyResolverService } from './academy-resolver.service';

export class AcademyParentsService {
  async getAcademyParents(user: any, query: any = {}, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    // 1. Gather all players belonging to this academy (directly or through teams)
    const academyTeams = await Team.find({ academyId: academy._id }).select('playerIds teamName');
    const teamPlayerIds = academyTeams.flatMap((t) => t.playerIds || []);
    const teamMap = new Map<string, string>();
    academyTeams.forEach((t) => {
      (t.playerIds || []).forEach((pid) => teamMap.set(pid.toString(), t.teamName));
    });

    const directAcademyPlayers = await PlayerProfile.find({
      $or: [
        { academyId: academy._id },
        { academy: academy.name },
        { currentClub: academy.name },
        { _id: { $in: teamPlayerIds } },
      ],
    }).select('_id fullName position profileImage age currentClub userId');

    const academyPlayerIds = directAcademyPlayers.map((p) => p._id);
    const academyPlayerMap = new Map<string, any>();
    directAcademyPlayers.forEach((p) => {
      academyPlayerMap.set(p._id.toString(), p);
    });

    // 2. Find ParentChild links for these academy players
    const parentChildLinks = await ParentChild.find({
      childPlayerId: { $in: academyPlayerIds },
    }).lean();

    const linkedParentIds = parentChildLinks.map((l) => l.parentId);

    // 3. Find ParentProfiles onboarded by this academy directly
    const onboardedProfiles = await ParentProfile.find({ academyId: academy._id })
      .select('_id userId')
      .lean();
    const onboardedProfileIds = onboardedProfiles.map((p) => p._id);
    const onboardedUserIds = onboardedProfiles.map((p) => p.userId);

    // 4. Combine all parent identifiers (profile IDs & user IDs)
    const allParentLookupIds = Array.from(
      new Set([
        ...linkedParentIds.map((id) => id.toString()),
        ...onboardedProfileIds.map((id) => id.toString()),
        ...onboardedUserIds.filter(Boolean).map((id) => id.toString()),
      ]),
    );

    // 5. Fetch all ParentProfiles
    const parentProfiles = await ParentProfile.find({
      $or: [
        { _id: { $in: allParentLookupIds } },
        { userId: { $in: allParentLookupIds } },
        { academyId: academy._id },
      ],
    })
      .populate('userId', 'name email avatar phone address status')
      .sort({ createdAt: -1 })
      .lean();

    // In case some ParentChild records only pointed to User without a ParentProfile, handle user lookup
    const foundProfileUserIds = new Set(
      parentProfiles.map((p) => (p.userId as any)?._id?.toString() || p.userId?.toString()),
    );
    const missingUserIds = allParentLookupIds.filter(
      (id) => !foundProfileUserIds.has(id) && Types.ObjectId.isValid(id),
    );

    let orphanParentUsers: any[] = [];
    if (missingUserIds.length > 0) {
      orphanParentUsers = await User.find({
        _id: { $in: missingUserIds },
        role: { $in: ['PARENT', 'GUARDIAN'] },
      }).lean();
    }

    // 6. Gather all child links for each parent to format linked players
    const allProfilesAndUsers = [
      ...parentProfiles.map((p) => ({ type: 'profile', doc: p })),
      ...orphanParentUsers.map((u) => ({
        type: 'user',
        doc: {
          _id: u._id,
          userId: u,
          contactPhone: u.phone,
          firstName: u.name?.split(' ')[0] || '',
          lastName: u.name?.split(' ').slice(1).join(' ') || '',
          notes: '',
          createdAt: u.createdAt,
        },
      })),
    ];

    const allCandidateParentIds = allProfilesAndUsers.flatMap((item: any) => {
      const p = item.doc;
      const ids: string[] = [];
      if (p._id) ids.push(p._id.toString());
      if (p.userId?._id) ids.push(p.userId._id.toString());
      else if (p.userId) ids.push(p.userId.toString());
      return ids;
    });

    const allLinks = await ParentChild.find({
      parentId: { $in: allCandidateParentIds },
    })
      .populate({
        path: 'childPlayerId',
        select: 'fullName position profileImage age userId currentClub',
      })
      .lean();

    // Map parentId string to its children
    const linksByParentId = new Map<string, any[]>();
    allLinks.forEach((link: any) => {
      const pIdStr = link.parentId?.toString();
      if (!linksByParentId.has(pIdStr)) linksByParentId.set(pIdStr, []);
      linksByParentId.get(pIdStr)!.push(link);
    });

    // 7. Format rows
    const formattedParents = allProfilesAndUsers.map((item: any) => {
      const p = item.doc;
      const u = (p.userId && typeof p.userId === 'object' ? p.userId : {}) as any;

      const pProfileId = p._id ? p._id.toString() : '';
      const pUserId = u._id ? u._id.toString() : p.userId ? p.userId.toString() : '';

      const relevantLinks = [
        ...(linksByParentId.get(pProfileId) || []),
        ...(linksByParentId.get(pUserId) || []),
      ];

      // Deduplicate children by childPlayerId
      const seenChildIds = new Set<string>();
      const linkedPlayers: any[] = [];
      for (const l of relevantLinks) {
        const child = l.childPlayerId;
        if (!child || !child._id) continue;
        const cIdStr = child._id.toString();
        if (seenChildIds.has(cIdStr)) continue;
        seenChildIds.add(cIdStr);

        linkedPlayers.push({
          _id: child._id,
          id: child._id,
          name: child.fullName || 'Athlete',
          position: child.position || 'Forward',
          avatar: child.profileImage || '',
          teamName: teamMap.get(cIdStr) || '',
          age: child.age ? `${child.age} yrs` : '',
          ageValue: child.age || null,
          relationshipType: l.relationshipType,
        });
      }

      const fullName =
        u.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Parent / Guardian';

      const firstName = p.firstName || (u.name ? u.name.split(' ')[0] : '');
      const lastName = p.lastName || (u.name ? u.name.split(' ').slice(1).join(' ') : '');

      const phone = p.contactPhone || u.phone || '';
      const email = u.email || '';
      const relationship =
        p.relationship ||
        (linkedPlayers[0]?.relationshipType
          ? linkedPlayers[0].relationshipType.charAt(0) +
            linkedPlayers[0].relationshipType.slice(1).toLowerCase()
          : 'Parent');

      const streetAddress = p.streetAddress || '';
      const city = p.city || '';
      const zipCode = p.zipCode || '';
      const address = [streetAddress, city, zipCode].filter(Boolean).join(', ') || u.address || '';

      return {
        _id: p._id,
        id: p._id,
        userId: pUserId,
        name: fullName,
        firstName,
        lastName,
        email,
        phone,
        alternatePhone: p.alternatePhone || '',
        relationship,
        occupation: p.occupation || '',
        streetAddress,
        city,
        zipCode,
        address,
        notes: p.notes || '',
        avatar: u.avatar || '',
        status: u.status || 'ACTIVE',
        linkedPlayers,
        linkedPlayersCount: linkedPlayers.length,
        createdAt: p.createdAt || u.createdAt,
      };
    });

    // 8. Comprehensive Filtering
    let filtered = formattedParents;

    // Search filter (name, email, phone, relationship, occupation, notes, address, child athlete name, position, team)
    const searchTerm = (query.searchTerm || query.search || query.q || '').trim().toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter((item) => {
        const matchName = item.name.toLowerCase().includes(searchTerm);
        const matchEmail = item.email.toLowerCase().includes(searchTerm);
        const matchPhone = item.phone.toLowerCase().includes(searchTerm);
        const matchRel = item.relationship.toLowerCase().includes(searchTerm);
        const matchOcc = item.occupation.toLowerCase().includes(searchTerm);
        const matchAddr = item.address.toLowerCase().includes(searchTerm);
        const matchNotes = item.notes.toLowerCase().includes(searchTerm);
        const matchChild = item.linkedPlayers.some(
          (c: any) =>
            c.name.toLowerCase().includes(searchTerm) ||
            c.position.toLowerCase().includes(searchTerm) ||
            c.teamName.toLowerCase().includes(searchTerm),
        );
        return (
          matchName ||
          matchEmail ||
          matchPhone ||
          matchRel ||
          matchOcc ||
          matchAddr ||
          matchNotes ||
          matchChild
        );
      });
    }

    // Relationship filter (e.g. Father, Mother, Guardian)
    if (query.relationship) {
      const relFilter = String(query.relationship).trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.relationship.toLowerCase() === relFilter ||
          p.linkedPlayers.some(
            (c: any) =>
              (c.relationshipType || '').toLowerCase() === relFilter ||
              (c.relationshipType || '').toLowerCase() === relFilter.toUpperCase(),
          ),
      );
    }

    // Team filter (teamId or teamName)
    if (query.teamId || query.teamName) {
      const targetTeam = String(query.teamId || query.teamName)
        .trim()
        .toLowerCase();
      filtered = filtered.filter((p) =>
        p.linkedPlayers.some(
          (c: any) =>
            (c.teamName && c.teamName.toLowerCase().includes(targetTeam)) ||
            (c.teamId && c.teamId.toString() === targetTeam),
        ),
      );
    }

    // Player filter (playerId or playerName)
    if (query.playerId || query.playerName) {
      const targetPlayer = String(query.playerId || query.playerName)
        .trim()
        .toLowerCase();
      filtered = filtered.filter((p) =>
        p.linkedPlayers.some(
          (c: any) =>
            (c._id && c._id.toString() === targetPlayer) ||
            (c.name && c.name.toLowerCase().includes(targetPlayer)),
        ),
      );
    }

    // hasLinkedPlayers filter ('true' | 'false')
    if (query.hasLinkedPlayers !== undefined) {
      const hasLinks = String(query.hasLinkedPlayers).toLowerCase() === 'true';
      filtered = filtered.filter((p) => p.linkedPlayersCount > 0 === hasLinks);
    }

    // Status filter ('ACTIVE', 'INACTIVE', 'BLOCKED')
    if (query.status) {
      const statusFilter = String(query.status).trim().toUpperCase();
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    // Date range filter
    if (query.startDate) {
      const start = new Date(query.startDate).getTime();
      if (!isNaN(start)) {
        filtered = filtered.filter((p) => p.createdAt && new Date(p.createdAt).getTime() >= start);
      }
    }
    if (query.endDate) {
      const end = new Date(query.endDate).getTime();
      if (!isNaN(end)) {
        filtered = filtered.filter((p) => p.createdAt && new Date(p.createdAt).getTime() <= end);
      }
    }

    // 9. Sorting
    const sortBy = String(query.sortBy || 'createdAt');
    const sortOrder = String(query.sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;

    filtered.sort((a: any, b: any) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (sortBy === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === 'createdAt') {
        valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      } else if (sortBy === 'linkedPlayersCount') {
        valA = a.linkedPlayersCount || 0;
        valB = b.linkedPlayersCount || 0;
      }

      if (valA < valB) return -1 * sortOrder;
      if (valA > valB) return 1 * sortOrder;
      return 0;
    });

    // 10. Pagination
    const totalCount = filtered.length;
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit =
      query.limit === 'all' || query.limit === '0'
        ? totalCount || 10
        : Math.max(1, parseInt(query.limit as string, 10) || 10);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const paginatedParents =
      query.limit === 'all' || query.limit === '0'
        ? filtered
        : filtered.slice((page - 1) * limit, page * limit);

    return {
      academy: {
        _id: academy._id,
        name: academy.name,
        logo: academy.logo || '',
      },
      stats: {
        totalParents: totalCount,
        totalLinkedPlayers: filtered.reduce((acc, p) => acc + p.linkedPlayersCount, 0),
        parentsWithLinkedPlayers: filtered.filter((p) => p.linkedPlayersCount > 0).length,
        parentsWithoutLinkedPlayers: filtered.filter((p) => p.linkedPlayersCount === 0).length,
      },
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages,
      },
      parents: paginatedParents,
    };
  }

  async getAvailablePlayersForParentLinking(
    user: any,
    query: any = {},
    academyIdentifier?: string,
  ) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const teams = await Team.find({ academyId: academy._id }).select('teamName playerIds');
    const teamPlayerIds = teams.flatMap((t) => t.playerIds || []);
    const teamMap = new Map<string, string>();
    teams.forEach((t) => {
      (t.playerIds || []).forEach((pid) => teamMap.set(pid.toString(), t.teamName));
    });

    const playerFilter: any = {
      $or: [
        { academyId: academy._id },
        { academy: academy.name },
        { currentClub: academy.name },
        { _id: { $in: teamPlayerIds } },
      ],
    };

    if (query.teamId && Types.ObjectId.isValid(query.teamId)) {
      const selectedTeam = teams.find((t) => t._id.toString() === query.teamId);
      if (selectedTeam) {
        playerFilter._id = { $in: selectedTeam.playerIds || [] };
      }
    }

    const players = await PlayerProfile.find(playerFilter)
      .select('_id fullName position profileImage age userId currentClub teamId')
      .populate('userId', 'name avatar email phone')
      .sort({ fullName: 1 })
      .lean();

    const playerIds = players.map((p) => p._id);

    // Find all ParentChild links for these players
    const existingLinks = await ParentChild.find({
      childPlayerId: { $in: playerIds },
    })
      .populate({
        path: 'parentId',
        populate: { path: 'userId', select: 'name email phone avatar' },
      })
      .lean();

    // Map playerId -> list of linked parents
    const linksByPlayerId = new Map<string, any[]>();
    existingLinks.forEach((link: any) => {
      const pidStr = link.childPlayerId?.toString();
      if (!linksByPlayerId.has(pidStr)) linksByPlayerId.set(pidStr, []);
      linksByPlayerId.get(pidStr)!.push(link);
    });

    const formatted = players.map((p) => {
      const u = (p.userId && typeof p.userId === 'object' ? p.userId : {}) as any;
      const pidStr = p._id.toString();
      const pLinks = linksByPlayerId.get(pidStr) || [];

      const linkedParents = pLinks.map((l: any) => {
        const parentProf = (l.parentId && typeof l.parentId === 'object' ? l.parentId : {}) as any;
        const parentUser = (
          parentProf.userId && typeof parentProf.userId === 'object' ? parentProf.userId : {}
        ) as any;

        const parentName =
          parentUser.name ||
          [parentProf.firstName, parentProf.lastName].filter(Boolean).join(' ') ||
          'Parent';

        return {
          parentProfileId: parentProf._id || l.parentId,
          parentUserId: parentUser._id || undefined,
          name: parentName,
          relationshipType: l.relationshipType || parentProf.relationship || 'Guardian',
          email: parentUser.email || '',
          phone: parentProf.contactPhone || parentUser.phone || '',
        };
      });

      const isLinked = linkedParents.length > 0;
      const parentNames = linkedParents.map((lp) => `${lp.name} (${lp.relationshipType})`);

      return {
        _id: p._id,
        id: p._id,
        name: p.fullName || u.name || 'Athlete',
        position: p.position || 'Forward',
        avatar: p.profileImage || u.avatar || '',
        teamName: teamMap.get(pidStr) || '',
        age: p.age ? `${p.age} yrs` : '',
        ageValue: p.age || null,
        email: u.email || '',
        isLinked,
        hasParent: isLinked,
        status: isLinked ? 'LINKED' : 'AVAILABLE',
        parentsCount: linkedParents.length,
        linkedParents,
        parentNames,
      };
    });

    // Handle filters: unlinkedOnly / availableOnly / status / search
    let result = formatted;
    const filterStatus = String(query.status || '').toUpperCase();
    const unlinkedOnly =
      query.unlinkedOnly === 'true' ||
      query.availableOnly === 'true' ||
      filterStatus === 'AVAILABLE' ||
      filterStatus === 'UNLINKED';
    const linkedOnly = query.linkedOnly === 'true' || filterStatus === 'LINKED';

    if (unlinkedOnly) {
      result = result.filter((p) => !p.isLinked);
    } else if (linkedOnly) {
      result = result.filter((p) => p.isLinked);
    }

    if (query.searchTerm || query.search || query.q) {
      const q = String(query.searchTerm || query.search || query.q)
        .trim()
        .toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.position.toLowerCase().includes(q) ||
          p.teamName.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.parentNames.some((pn) => pn.toLowerCase().includes(q)),
      );
    }

    return result;
  }

  async onboardParent(user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const email = String(payload.email || '')
      .toLowerCase()
      .trim();
    if (!email) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Email address is required');
    }

    const firstName = String(payload.firstName || '').trim();
    const lastName = String(payload.lastName || '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Parent / Guardian';
    const primaryPhone = String(payload.primaryPhone || payload.phone || '').trim();
    const alternatePhone = payload.alternatePhone
      ? String(payload.alternatePhone).trim()
      : undefined;
    const relationship = String(payload.relationship || 'Guardian').trim();
    const occupation = payload.occupation ? String(payload.occupation).trim() : undefined;
    const streetAddress = payload.streetAddress ? String(payload.streetAddress).trim() : undefined;
    const city = payload.city ? String(payload.city).trim() : undefined;
    const zipCode = payload.zipCode ? String(payload.zipCode).trim() : undefined;
    const notes = payload.notes ? String(payload.notes).trim() : undefined;

    const rawLinkedPlayerIds: any[] = Array.isArray(payload.linkedPlayerIds)
      ? payload.linkedPlayerIds
      : Array.isArray(payload.linkedPlayers)
        ? payload.linkedPlayers
        : Array.isArray(payload.playerIds)
          ? payload.playerIds
          : [];

    // 1. Find or create user
    let parentUser = await User.findOne({ email });
    let isNewUser = false;
    let initialPassword = '';

    if (!parentUser) {
      isNewUser = true;
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      initialPassword = `Parent@${randomSuffix}`;
      const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
      const hashedPassword = await bcrypt.hash(initialPassword, salt);

      parentUser = await User.create({
        name: fullName,
        email,
        password: hashedPassword,
        role: 'PARENT',
        phone: primaryPhone,
        contactPhone: primaryPhone,
        address: [streetAddress, city, zipCode].filter(Boolean).join(', ') || undefined,
        isEmailVerified: true,
        status: 'ACTIVE',
      });
    } else {
      if (parentUser.role !== 'PARENT' && (parentUser.role as any) !== 'GUARDIAN') {
        parentUser.role = 'PARENT';
      }
      if (primaryPhone && !parentUser.phone) {
        parentUser.phone = primaryPhone;
      }
      if (!parentUser.address && (streetAddress || city || zipCode)) {
        parentUser.address = [streetAddress, city, zipCode].filter(Boolean).join(', ');
      }
      await parentUser.save();
    }

    // 2. Find or create ParentProfile
    let parentProfile = await ParentProfile.findOne({
      $or: [{ userId: parentUser._id }, { _id: parentUser.parentProfileId }],
    });

    if (!parentProfile) {
      parentProfile = await ParentProfile.create({
        userId: parentUser._id,
        contactPhone: primaryPhone || parentUser.phone || '+8801700000000',
        alternatePhone,
        firstName,
        lastName,
        relationship,
        occupation,
        streetAddress,
        city,
        zipCode,
        notes,
        academyId: academy._id,
      });
    } else {
      if (firstName) parentProfile.firstName = firstName;
      if (lastName) parentProfile.lastName = lastName;
      if (primaryPhone) parentProfile.contactPhone = primaryPhone;
      if (alternatePhone !== undefined) parentProfile.alternatePhone = alternatePhone;
      if (relationship) parentProfile.relationship = relationship;
      if (occupation !== undefined) parentProfile.occupation = occupation;
      if (streetAddress !== undefined) parentProfile.streetAddress = streetAddress;
      if (city !== undefined) parentProfile.city = city;
      if (zipCode !== undefined) parentProfile.zipCode = zipCode;
      if (notes !== undefined) parentProfile.notes = notes;
      if (!parentProfile.academyId) parentProfile.academyId = academy._id;
      await parentProfile.save();
    }

    // Ensure user references parentProfile
    if (
      !parentUser.parentProfileId ||
      parentUser.parentProfileId.toString() !== parentProfile._id.toString()
    ) {
      parentUser.parentProfileId = parentProfile._id.toString();
      await parentUser.save();
    }

    // 3. Link child players in ParentChild
    const relUpper = relationship.toUpperCase();
    let relEnum: 'FATHER' | 'MOTHER' | 'GUARDIAN' = 'GUARDIAN';
    if (relUpper.includes('FATHER')) relEnum = 'FATHER';
    else if (relUpper.includes('MOTHER')) relEnum = 'MOTHER';

    const linkedResults: any[] = [];
    for (const rawId of rawLinkedPlayerIds) {
      const pidStr = typeof rawId === 'object' && rawId?._id ? rawId._id : String(rawId).trim();
      if (!pidStr) continue;

      let player = null;
      if (Types.ObjectId.isValid(pidStr)) {
        player = await PlayerProfile.findById(pidStr);
        if (!player) {
          player = await PlayerProfile.findOne({ userId: pidStr });
        }
      }
      if (!player) {
        player = await PlayerProfile.findOne({ fullName: pidStr });
      }
      if (!player) continue;

      // Upsert link
      const existingLink = await ParentChild.findOne({
        parentId: parentProfile._id,
        childPlayerId: player._id,
      });

      if (!existingLink) {
        await ParentChild.create({
          parentId: parentProfile._id,
          childPlayerId: player._id,
          relationshipType: relEnum,
        });
      } else if (existingLink.relationshipType !== relEnum) {
        existingLink.relationshipType = relEnum;
        await existingLink.save();
      }

      // Mark child user accountManagedBy = 'PARENT'
      if (player.userId) {
        await User.findByIdAndUpdate(player.userId, {
          accountManagedBy: 'PARENT',
        });
      }

      // Invalidate cache
      await playerCacheService.invalidatePlayerCache(player._id, player.userId);

      linkedResults.push({
        _id: player._id,
        name: player.fullName,
        position: player.position,
      });
    }

    return {
      message: isNewUser
        ? 'Parent onboarded and account created successfully'
        : 'Parent updated and players linked successfully',
      isNewUser,
      parent: {
        _id: parentProfile._id,
        id: parentProfile._id,
        userId: parentUser._id,
        name: parentUser.name,
        firstName: parentProfile.firstName,
        lastName: parentProfile.lastName,
        email: parentUser.email,
        phone: parentProfile.contactPhone,
        alternatePhone: parentProfile.alternatePhone,
        relationship: parentProfile.relationship,
        occupation: parentProfile.occupation,
        streetAddress: parentProfile.streetAddress,
        city: parentProfile.city,
        zipCode: parentProfile.zipCode,
        address: [parentProfile.streetAddress, parentProfile.city, parentProfile.zipCode]
          .filter(Boolean)
          .join(', '),
        notes: parentProfile.notes,
        linkedPlayers: linkedResults,
        linkedPlayersCount: linkedResults.length,
      },
      credentials: isNewUser
        ? {
            email: parentUser.email,
            temporaryPassword: initialPassword,
          }
        : undefined,
    };
  }

  async getAcademyParentById(parentId: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    let parentProfile = null;
    if (Types.ObjectId.isValid(parentId)) {
      parentProfile = await ParentProfile.findOne({
        $or: [{ _id: parentId }, { userId: parentId }],
      }).populate('userId', 'name email avatar phone address status');
    }
    if (!parentProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent profile not found');
    }

    const u = (
      parentProfile.userId && typeof parentProfile.userId === 'object' ? parentProfile.userId : {}
    ) as any;

    // Find linked children
    const links = await ParentChild.find({
      parentId: { $in: [parentProfile._id, u._id].filter(Boolean) },
    }).populate({
      path: 'childPlayerId',
      select: 'fullName position profileImage age userId currentClub academyId',
    });

    const teams = await Team.find({ academyId: academy._id }).select('teamName playerIds');
    const teamMap = new Map<string, string>();
    teams.forEach((t) => {
      (t.playerIds || []).forEach((pid) => teamMap.set(pid.toString(), t.teamName));
    });

    const linkedPlayers = links.map((l: any) => {
      const child = l.childPlayerId || {};
      const cIdStr = child._id ? child._id.toString() : '';
      return {
        _id: child._id,
        id: child._id,
        name: child.fullName || 'Athlete',
        position: child.position || 'Forward',
        avatar: child.profileImage || '',
        teamName: teamMap.get(cIdStr) || '',
        age: child.age ? `${child.age} yrs` : '',
        relationshipType: l.relationshipType,
      };
    });

    return {
      _id: parentProfile._id,
      id: parentProfile._id,
      userId: u._id,
      name: u.name || `${parentProfile.firstName || ''} ${parentProfile.lastName || ''}`.trim(),
      firstName: parentProfile.firstName,
      lastName: parentProfile.lastName,
      email: u.email,
      phone: parentProfile.contactPhone || u.phone,
      alternatePhone: parentProfile.alternatePhone,
      relationship: parentProfile.relationship,
      occupation: parentProfile.occupation,
      streetAddress: parentProfile.streetAddress,
      city: parentProfile.city,
      zipCode: parentProfile.zipCode,
      address:
        [parentProfile.streetAddress, parentProfile.city, parentProfile.zipCode]
          .filter(Boolean)
          .join(', ') ||
        u.address ||
        '',
      notes: parentProfile.notes,
      avatar: u.avatar || '',
      linkedPlayers,
      linkedPlayersCount: linkedPlayers.length,
      createdAt: parentProfile.createdAt,
    };
  }

  async updateAcademyParent(parentId: string, user: any, payload: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    let parentProfile = null;
    if (Types.ObjectId.isValid(parentId)) {
      parentProfile = await ParentProfile.findOne({
        $or: [{ _id: parentId }, { userId: parentId }],
      });
    }
    if (!parentProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent profile not found');
    }

    const parentUser = await User.findById(parentProfile.userId);

    // Update parent profile fields
    if (payload.firstName !== undefined) parentProfile.firstName = payload.firstName;
    if (payload.lastName !== undefined) parentProfile.lastName = payload.lastName;
    if (payload.primaryPhone !== undefined || payload.phone !== undefined) {
      parentProfile.contactPhone = payload.primaryPhone || payload.phone;
      if (parentUser) {
        parentUser.phone = parentProfile.contactPhone;
        parentUser.contactPhone = parentProfile.contactPhone;
      }
    }
    if (payload.alternatePhone !== undefined) parentProfile.alternatePhone = payload.alternatePhone;
    if (payload.relationship !== undefined) parentProfile.relationship = payload.relationship;
    if (payload.occupation !== undefined) parentProfile.occupation = payload.occupation;
    if (payload.streetAddress !== undefined) parentProfile.streetAddress = payload.streetAddress;
    if (payload.city !== undefined) parentProfile.city = payload.city;
    if (payload.zipCode !== undefined) parentProfile.zipCode = payload.zipCode;
    if (payload.notes !== undefined) parentProfile.notes = payload.notes;

    if (payload.firstName || payload.lastName) {
      const updatedName = [
        payload.firstName || parentProfile.firstName,
        payload.lastName || parentProfile.lastName,
      ]
        .filter(Boolean)
        .join(' ');
      if (parentUser && updatedName) parentUser.name = updatedName;
    }

    await parentProfile.save();
    if (parentUser) await parentUser.save();

    // If linkedPlayerIds is provided, sync links
    const rawLinkedPlayerIds =
      payload.linkedPlayerIds || payload.linkedPlayers || payload.playerIds;
    if (Array.isArray(rawLinkedPlayerIds)) {
      // Find current academy's players
      const academyTeams = await Team.find({ academyId: academy._id }).select('playerIds');
      const teamPlayerIds = academyTeams.flatMap((t) => t.playerIds || []);
      const academyPlayers = await PlayerProfile.find({
        $or: [
          { academyId: academy._id },
          { academy: academy.name },
          { currentClub: academy.name },
          { _id: { $in: teamPlayerIds } },
        ],
      }).select('_id userId');
      const academyPlayerIds = academyPlayers.map((p) => p._id);

      // Remove existing links for this academy's players
      await ParentChild.deleteMany({
        parentId: parentProfile._id,
        childPlayerId: { $in: academyPlayerIds },
      });

      // Normalize relationship
      const relUpper = (
        payload.relationship ||
        parentProfile.relationship ||
        'Guardian'
      ).toUpperCase();
      let relEnum: 'FATHER' | 'MOTHER' | 'GUARDIAN' = 'GUARDIAN';
      if (relUpper.includes('FATHER')) relEnum = 'FATHER';
      else if (relUpper.includes('MOTHER')) relEnum = 'MOTHER';

      // Insert new links
      for (const rawPid of rawLinkedPlayerIds) {
        const pid = typeof rawPid === 'object' && rawPid?._id ? rawPid._id : String(rawPid).trim();
        if (!pid) continue;
        const player = await PlayerProfile.findById(pid);
        if (!player) continue;

        await ParentChild.create({
          parentId: parentProfile._id,
          childPlayerId: player._id,
          relationshipType: relEnum,
        });

        if (player.userId) {
          await User.findByIdAndUpdate(player.userId, {
            accountManagedBy: 'PARENT',
          });
          await playerCacheService.invalidatePlayerCache(player._id, player.userId);
        }
      }
    }

    return this.getAcademyParentById(parentProfile._id.toString(), user, academyIdentifier);
  }

  async unlinkParentFromAcademy(parentId: string, user: any, academyIdentifier?: string) {
    const academy = await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    let parentProfile = null;
    if (Types.ObjectId.isValid(parentId)) {
      parentProfile = await ParentProfile.findOne({
        $or: [{ _id: parentId }, { userId: parentId }],
      });
    }
    if (!parentProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent profile not found');
    }

    // Get this academy's player IDs
    const academyTeams = await Team.find({ academyId: academy._id }).select('playerIds');
    const teamPlayerIds = academyTeams.flatMap((t) => t.playerIds || []);
    const academyPlayers = await PlayerProfile.find({
      $or: [
        { academyId: academy._id },
        { academy: academy.name },
        { currentClub: academy.name },
        { _id: { $in: teamPlayerIds } },
      ],
    }).select('_id userId');

    const academyPlayerIds = academyPlayers.map((p) => p._id);
    const targetParentIds = [parentProfile._id, parentProfile.userId].filter(Boolean);

    // Delete ParentChild links between this parent and this academy's players
    await ParentChild.deleteMany({
      parentId: { $in: targetParentIds },
      childPlayerId: { $in: academyPlayerIds },
    });

    // Check each player: if no other parent is linked, reset accountManagedBy to 'ATHLETE'
    for (const player of academyPlayers) {
      const remainingLinks = await ParentChild.countDocuments({
        childPlayerId: player._id,
      });
      if (remainingLinks === 0 && player.userId) {
        await User.findByIdAndUpdate(player.userId, {
          accountManagedBy: 'ATHLETE',
        });
        await playerCacheService.invalidatePlayerCache(player._id, player.userId);
      }
    }

    return {
      message: 'Parent unlinked from academy players successfully',
    };
  }

  async linkPlayerToParent(
    parentId: string,
    playerId: string,
    relationship: string = 'Guardian',
    user?: any,
    academyIdentifier?: string,
  ) {
    await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const parentProfile = await ParentProfile.findOne({
      $or: [{ _id: parentId }, { userId: parentId }],
    });
    if (!parentProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent profile not found');
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    const relUpper = (relationship || 'Guardian').toUpperCase();
    let relEnum: 'FATHER' | 'MOTHER' | 'GUARDIAN' = 'GUARDIAN';
    if (relUpper.includes('FATHER')) relEnum = 'FATHER';
    else if (relUpper.includes('MOTHER')) relEnum = 'MOTHER';

    const existingLink = await ParentChild.findOne({
      parentId: parentProfile._id,
      childPlayerId: player._id,
    });

    if (!existingLink) {
      await ParentChild.create({
        parentId: parentProfile._id,
        childPlayerId: player._id,
        relationshipType: relEnum,
      });
    }

    if (player.userId) {
      await User.findByIdAndUpdate(player.userId, {
        accountManagedBy: 'PARENT',
      });
      await playerCacheService.invalidatePlayerCache(player._id, player.userId);
    }

    return {
      message: 'Player linked to parent successfully',
      parentId: parentProfile._id,
      playerId: player._id,
    };
  }

  async unlinkPlayerFromParent(
    parentId: string,
    playerId: string,
    user?: any,
    academyIdentifier?: string,
  ) {
    await academyResolverService.resolveUserAcademy(user, academyIdentifier);

    const parentProfile = await ParentProfile.findOne({
      $or: [{ _id: parentId }, { userId: parentId }],
    });
    if (!parentProfile) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Parent profile not found');
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player not found');
    }

    await ParentChild.deleteMany({
      parentId: { $in: [parentProfile._id, parentProfile.userId].filter(Boolean) },
      childPlayerId: player._id,
    });

    const remainingLinks = await ParentChild.countDocuments({
      childPlayerId: player._id,
    });
    if (remainingLinks === 0 && player.userId) {
      await User.findByIdAndUpdate(player.userId, {
        accountManagedBy: 'ATHLETE',
      });
      await playerCacheService.invalidatePlayerCache(player._id, player.userId);
    }

    return {
      message: 'Player unlinked from parent successfully',
    };
  }
}

export const academyParentsService = new AcademyParentsService();
