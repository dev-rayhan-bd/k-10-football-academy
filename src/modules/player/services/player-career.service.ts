import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import { ALLOWED_PLAYER_STYLES } from '../player.interface';
import { PlayerProfile } from '../player.model';
import { playerCacheService } from './player-cache.service';
import { uploadToStorage, deleteFromStorage } from '@/utils/fileUpload.utils';

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
        period = `${fromStr || ''} - ${toStr || 'Present'}`;
      }

      return {
        ...item,
        from: fromStr || undefined,
        to: toStr || undefined,
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

    if (normalizedItem.isCurrent) {
      profile.clubHistory.forEach((c: any) => {
        c.isCurrent = false;
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
