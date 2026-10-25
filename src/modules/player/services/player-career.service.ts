import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import { ALLOWED_PLAYER_STYLES } from '../player.interface';
import { PlayerProfile } from '../player.model';
import { playerCacheService } from './player-cache.service';
import { uploadToStorage, deleteFromStorage } from '@/utils/fileUpload.utils';

export function validateClubHistoryTimeline(clubHistory: any[]): void {
  const currentYear = new Date().getFullYear();

  // 1. Check for single current club
  let currentClubsCount = 0;
  for (const item of clubHistory) {
    const isCurr = item.isCurrent === true || String(item.isCurrent).toLowerCase() === 'true';
    const toPresent =
      String(item.to || '')
        .trim()
        .toLowerCase() === 'present';
    if (isCurr || toPresent) {
      currentClubsCount++;
    }
  }

  if (currentClubsCount > 1) {
    throw new AppError(
      400,
      'A player cannot have multiple current clubs. Only one club in clubHistory can have isCurrent: true or to: "Present".',
    );
  }

  // 2. Parse parsed intervals and validate range & overlaps
  const parsedIntervals: Array<{
    clubName: string;
    startYear: number;
    endYear: number;
    isCurrent: boolean;
    toLabel: string;
  }> = [];

  for (const item of clubHistory) {
    const clubName = item.clubName || 'Unknown Club';
    const isCurr = item.isCurrent === true || String(item.isCurrent).toLowerCase() === 'true';
    const toPresent =
      String(item.to || '')
        .trim()
        .toLowerCase() === 'present';

    let startYear: number | null = null;
    let endYear: number | null = null;

    if (item.from !== undefined && item.from !== null && String(item.from).trim()) {
      const match = String(item.from).match(/\b(19\d\d|20\d\d)\b/);
      if (match) startYear = parseInt(match[1], 10);
    }

    if (isCurr || toPresent) {
      endYear = currentYear;
    } else if (item.to !== undefined && item.to !== null && String(item.to).trim()) {
      const match = String(item.to).match(/\b(19\d\d|20\d\d)\b/);
      if (match) endYear = parseInt(match[1], 10);
    }

    // Fallback to period string if from/to not parsed
    if ((!startYear || !endYear) && item.period) {
      const years = Array.from(String(item.period).matchAll(/\b(19\d\d|20\d\d)\b/g)).map((m) =>
        parseInt(m[0], 10),
      );
      if (!startYear && years.length > 0) startYear = years[0];
      if (!endYear) {
        if (String(item.period).toLowerCase().includes('present')) {
          endYear = currentYear;
        } else if (years.length > 1) {
          endYear = years[years.length - 1];
        }
      }
    }

    if (startYear !== null && endYear !== null) {
      if (startYear > endYear) {
        throw new AppError(
          400,
          `Invalid year range for '${clubName}': start year (${startYear}) cannot be greater than end year (${isCurr || toPresent ? 'Present' : endYear}).`,
        );
      }

      parsedIntervals.push({
        clubName,
        startYear,
        endYear,
        isCurrent: Boolean(isCurr || toPresent),
        toLabel: isCurr || toPresent ? 'Present' : String(endYear),
      });
    }
  }

  // 3. Overlap detection between any two intervals
  for (let i = 0; i < parsedIntervals.length; i++) {
    for (let j = i + 1; j < parsedIntervals.length; j++) {
      const a = parsedIntervals[i];
      const b = parsedIntervals[j];

      // Two clubs conflict if:
      // a) They both start in the same year: startA === startB
      // b) Club b starts during club a's tenure: startA < startB && startB < endA
      // c) Club a starts during club b's tenure: startB < startA && startA < endB
      const hasConflict =
        a.startYear === b.startYear ||
        (a.startYear < b.startYear && b.startYear < a.endYear) ||
        (b.startYear < a.startYear && a.startYear < b.endYear);

      if (hasConflict) {
        throw new AppError(
          400,
          `Career timeline overlap detected: '${a.clubName}' (${a.startYear} - ${a.toLabel}) and '${b.clubName}' (${b.startYear} - ${b.toLabel}) cannot have overlapping years.`,
        );
      }
    }
  }
}

export class PlayerCareerService {
  private async getOrCreateProfile(playerId: string) {
    let profile = await PlayerProfile.findOne({
      $or: [{ _id: playerId }, { userId: playerId }],
    });
    if (!profile && Types.ObjectId.isValid(playerId)) {
      const user = await UserModel.findById(playerId);
      if (user) {
        profile = await PlayerProfile.create({
          userId: user._id,
          fullName: user.name || 'New Player',
          position: user.position || 'Forward',
          age: user.age || 18,
          country: user.country || 'Bangladesh',
          profileImage: user.avatar || '',
        });
      }
    }
    return profile;
  }

  async updatePlayerStyles(playerId: string, styles: string[]) {
    if (!Array.isArray(styles)) {
      throw new AppError(400, 'Styles must be an array of strings');
    }
    if (styles.length > 4) {
      throw new AppError(400, 'Maximum 4 player styles can be selected simultaneously');
    }
    for (const style of styles) {
      if (!ALLOWED_PLAYER_STYLES.includes(style as any)) {
        throw new AppError(400, `Invalid player style: ${style}`);
      }
    }
    const profile = await this.getOrCreateProfile(playerId);
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    profile.playerStyles = styles;
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return {
      playerId: profile._id,
      playerStyles: profile.playerStyles,
    };
  }

  async updateClubHistory(playerId: string, clubHistory: any[]) {
    if (!Array.isArray(clubHistory)) {
      throw new AppError(400, 'Club history must be an array');
    }
    if (clubHistory.length > 6) {
      throw new AppError(400, 'Maximum 6 clubs allowed in career timeline');
    }
    const profile = await this.getOrCreateProfile(playerId);
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    validateClubHistoryTimeline(clubHistory);

    const mappedHistory = clubHistory.map((item: any) => {
      let isCurrent = item.isCurrent;
      if (typeof isCurrent === 'string') {
        isCurrent = isCurrent.toLowerCase() === 'true';
      }
      const fromStr = item.from !== undefined ? String(item.from) : '';
      const toStr = item.to !== undefined ? String(item.to) : '';

      if (toStr.toLowerCase() === 'present') {
        isCurrent = true;
      }

      let period = item.period;
      if (!period && (fromStr || toStr)) {
        period = `${fromStr || ''} - ${toStr || (isCurrent ? 'Present' : '')}`;
      }

      return {
        ...item,
        from: fromStr || undefined,
        to: toStr || (isCurrent ? 'Present' : undefined),
        period: period || '',
        isCurrent: Boolean(isCurrent),
      };
    });

    profile.clubHistory = mappedHistory;
    const currentClubItem = profile.clubHistory.find((c: any) => c.isCurrent);
    if (currentClubItem) {
      profile.currentClub = currentClubItem.clubName;
      if (currentClubItem.logoUrl) {
        profile.clubLogo = currentClubItem.logoUrl;
      }
    }
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return {
      playerId: profile._id,
      clubHistory: profile.clubHistory,
    };
  }

  async addClubHistoryItem(playerId: string, clubItem: any) {
    const profile = await this.getOrCreateProfile(playerId);
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }
    profile.clubHistory = profile.clubHistory || [];
    if (profile.clubHistory.length >= 6) {
      throw new AppError(400, 'Maximum 6 clubs allowed in career timeline');
    }

    let isCurrent = clubItem.isCurrent;
    if (typeof isCurrent === 'string') {
      isCurrent = isCurrent.toLowerCase() === 'true';
    }
    const fromStr = clubItem.from !== undefined ? String(clubItem.from) : '';
    const toStr = clubItem.to !== undefined ? String(clubItem.to) : '';

    if (toStr.toLowerCase() === 'present') {
      isCurrent = true;
    }

    let period = clubItem.period;
    if (!period && (fromStr || toStr)) {
      period = `${fromStr || ''} - ${toStr || 'Present'}`;
    }

    const normalizedItem = {
      ...clubItem,
      from: fromStr || undefined,
      to: toStr || undefined,
      period: period || '',
      isCurrent: Boolean(isCurrent),
    };

    validateClubHistoryTimeline([...profile.clubHistory, normalizedItem]);

    if (normalizedItem.isCurrent) {
      profile.clubHistory.forEach((c: any) => {
        c.isCurrent = false;
        if (c.to && String(c.to).toLowerCase() === 'present') {
          c.to = normalizedItem.from || String(new Date().getFullYear());
          c.period = `${c.from || ''} - ${c.to}`;
        }
      });
      profile.currentClub = normalizedItem.clubName;
      if (normalizedItem.logoUrl) {
        profile.clubLogo = normalizedItem.logoUrl;
      }
    }
    profile.clubHistory.push(normalizedItem);
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    const newlyAdded = profile.clubHistory[profile.clubHistory.length - 1];

    return {
      playerId: profile._id,
      addedClub: newlyAdded,
      clubHistory: profile.clubHistory,
    };
  }

  async updateClubHistoryItem(playerId: string, clubId: string, payload: any) {
    const profile = await this.getOrCreateProfile(playerId);
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    const clubIndex = (profile.clubHistory || []).findIndex(
      (c: any) =>
        c._id?.toString() === clubId ||
        c.id === clubId ||
        c.clubName?.toLowerCase() === decodeURIComponent(clubId).toLowerCase(),
    );

    if (clubIndex === -1) {
      throw new AppError(404, 'Club not found in career history');
    }

    const existingClub = profile.clubHistory![clubIndex];

    const clubName = payload.clubName !== undefined ? payload.clubName : existingClub.clubName;
    const fromStr =
      payload.from !== undefined
        ? String(payload.from)
        : existingClub.from !== undefined
          ? String(existingClub.from)
          : '';
    const toStr =
      payload.to !== undefined
        ? String(payload.to)
        : existingClub.to !== undefined
          ? String(existingClub.to)
          : '';

    let isCurrent = payload.isCurrent !== undefined ? payload.isCurrent : existingClub.isCurrent;
    if (typeof isCurrent === 'string') {
      isCurrent = isCurrent.toLowerCase() === 'true';
    }
    if (toStr.toLowerCase() === 'present') {
      isCurrent = true;
    }

    let period = payload.period !== undefined ? payload.period : existingClub.period;
    if (payload.from !== undefined || payload.to !== undefined || payload.isCurrent !== undefined) {
      period = `${fromStr || ''} - ${toStr || (isCurrent ? 'Present' : '')}`;
    }

    let logoUrl = existingClub.logoUrl;
    if (payload.logoUrl) {
      if (existingClub.logoUrl && existingClub.logoUrl !== payload.logoUrl) {
        deleteFromStorage(existingClub.logoUrl).catch(() => {});
      }
      logoUrl = payload.logoUrl;
    }

    const updatedItem = {
      _id: existingClub._id,
      clubName,
      logoUrl,
      from: fromStr || undefined,
      to: toStr || (isCurrent ? 'Present' : undefined),
      period: period || '',
      isCurrent: Boolean(isCurrent),
    };

    const prospectiveHistory = [...profile.clubHistory!];
    prospectiveHistory[clubIndex] = updatedItem;

    validateClubHistoryTimeline(prospectiveHistory);

    if (updatedItem.isCurrent) {
      profile.clubHistory!.forEach((c: any, idx: number) => {
        if (idx !== clubIndex) {
          c.isCurrent = false;
          if (c.to && String(c.to).toLowerCase() === 'present') {
            c.to = updatedItem.from || String(new Date().getFullYear());
            c.period = `${c.from || ''} - ${c.to}`;
          }
        }
      });
      profile.currentClub = updatedItem.clubName;
      if (updatedItem.logoUrl) {
        profile.clubLogo = updatedItem.logoUrl;
      }
    } else if (existingClub.isCurrent && !updatedItem.isCurrent) {
      if (profile.currentClub === existingClub.clubName) {
        const nextCurrent = prospectiveHistory.find(
          (c: any, idx: number) => idx !== clubIndex && c.isCurrent,
        );
        profile.currentClub = nextCurrent ? nextCurrent.clubName : '';
        profile.clubLogo = nextCurrent?.logoUrl || '';
      }
    }

    profile.clubHistory![clubIndex] = updatedItem;
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return {
      playerId: profile._id,
      updatedClub: profile.clubHistory![clubIndex],
      clubHistory: profile.clubHistory,
    };
  }

  async deleteClubHistoryItem(playerId: string, clubId: string) {
    const profile = await this.getOrCreateProfile(playerId);
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    const clubIndex = (profile.clubHistory || []).findIndex(
      (c: any) =>
        c._id?.toString() === clubId ||
        c.id === clubId ||
        c.clubName?.toLowerCase() === decodeURIComponent(clubId).toLowerCase(),
    );

    if (clubIndex === -1) {
      throw new AppError(404, 'Club not found in career history');
    }

    const removedClub = profile.clubHistory![clubIndex];
    if (removedClub?.logoUrl) {
      deleteFromStorage(removedClub.logoUrl).catch(() => {});
    }

    profile.clubHistory!.splice(clubIndex, 1);
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return {
      deletedClubId: clubId,
      clubHistory: profile.clubHistory,
    };
  }

  async updatePitchMap(playerId: string, payload: { positionMap?: any[]; futsalMap?: any[] }) {
    const profile = await this.getOrCreateProfile(playerId);
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }
    if (payload.positionMap !== undefined) {
      profile.positionMap = payload.positionMap;
    }
    if (payload.futsalMap !== undefined) {
      profile.futsalMap = payload.futsalMap;
    }
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return {
      playerId: profile._id,
      positionMap: profile.positionMap,
      futsalMap: profile.futsalMap,
    };
  }

  // ----------------------------------------------------
  // Documents & Certificates Management (Docs / Certificate)
  // ----------------------------------------------------
  async uploadDocuments(playerId: string, files: Express.Multer.File[], customTitle?: string) {
    const profile = await this.getOrCreateProfile(playerId);
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    if (!files || files.length === 0) {
      throw new AppError(400, 'No files provided for upload');
    }

    profile.documents = profile.documents || [];
    const startIndex = profile.documents.length;

    for (const file of files) {
      const url = await uploadToStorage(file, 'player_documents');
      const ext = file.originalname.split('.').pop()?.toUpperCase() || 'FILE';
      const docItem = {
        title: customTitle && files.length === 1 ? customTitle : file.originalname,
        url,
        fileType: ext,
        size: file.size,
        uploadedAt: new Date(),
      };
      profile.documents.push(docItem as any);
    }

    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    const newlyAdded = (profile.documents || []).slice(startIndex);
    return files.length === 1 ? newlyAdded[0] : newlyAdded;
  }

  async deleteDocument(playerId: string, documentId: string) {
    const profile = await this.getOrCreateProfile(playerId);
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    const docIndex = (profile.documents || []).findIndex(
      (d: any) => d._id?.toString() === documentId || d.id === documentId,
    );

    if (docIndex === -1) {
      throw new AppError(404, 'Document not found');
    }

    const removedDoc = profile.documents![docIndex];
    if (removedDoc?.url) {
      deleteFromStorage(removedDoc.url).catch(() => {});
    }

    profile.documents!.splice(docIndex, 1);
    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return {
      deletedDocumentId: documentId,
    };
  }

  async updateDocument(
    playerId: string,
    documentId: string,
    payload: { title?: string },
    newFile?: Express.Multer.File,
  ) {
    const profile = await this.getOrCreateProfile(playerId);
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }

    const docIndex = (profile.documents || []).findIndex(
      (d: any) => d._id?.toString() === documentId || d.id === documentId,
    );

    if (docIndex === -1) {
      throw new AppError(404, 'Document not found');
    }

    const existingDoc = profile.documents![docIndex];

    if (payload.title && payload.title.trim()) {
      existingDoc.title = payload.title.trim();
    }

    if (newFile) {
      const url = await uploadToStorage(newFile, 'player_documents');
      const ext = newFile.originalname.split('.').pop()?.toUpperCase() || 'FILE';

      if (existingDoc.url) {
        deleteFromStorage(existingDoc.url).catch(() => {});
      }

      existingDoc.url = url;
      existingDoc.fileType = ext;
      existingDoc.size = newFile.size;
      if (!payload.title || !payload.title.trim()) {
        existingDoc.title = newFile.originalname;
      }
    }

    await profile.save();
    await playerCacheService.invalidatePlayerCache(profile._id, profile.userId);

    return existingDoc;
  }

  async getDocuments(playerId: string) {
    const profile = await this.getOrCreateProfile(playerId);
    if (!profile) {
      throw new AppError(404, 'Player profile not found');
    }
    return profile.documents || [];
  }
}

export const playerCareerService = new PlayerCareerService();
