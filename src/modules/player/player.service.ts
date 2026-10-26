import { Types } from 'mongoose';
import { IPlayerProfile, IMatchRecord } from './player.interface';
import { playerCacheService } from './services/player-cache.service';
import { playerStatsService, computeProfileCompletion } from './services/player-stats.service';
import { playerCvService } from './services/player-cv.service';
import { playerProfileService } from './services/player-profile.service';
import { playerAttributeService } from './services/player-attribute.service';
import { playerMatchService } from './services/player-match.service';
import { playerCareerService } from './services/player-career.service';
import { playerMediaService } from './services/player-media.service';
import { playerAnalyticsService } from './services/player-analytics.service';

export { computeProfileCompletion };

export class PlayerService {
  // 1. Cache Management
  async invalidatePlayerCache(
    profileId?: string | Types.ObjectId,
    userId?: string | Types.ObjectId,
  ) {
    return playerCacheService.invalidatePlayerCache(profileId, userId);
  }

  // 2. Rating & Stats Recalculation
  async recalculatePlayerStats(profileId: Types.ObjectId | string) {
    return playerStatsService.recalculatePlayerStats(profileId);
  }

  // 3. Core Profile CRUD
  async createProfile(payload: Partial<IPlayerProfile>) {
    return playerProfileService.createProfile(payload);
  }

  async getProfileById(id: string, viewer?: { userId?: string; role?: string }) {
    return playerCvService.getProfileById(id, viewer);
  }

  async getCVProfile(id: string, viewer?: { userId?: string; role?: string }) {
    return playerCvService.getCVProfile(id, viewer);
  }

  async getProfileByUserId(userId: string) {
    return playerCvService.getProfileByUserId(userId);
  }

  async getAllProfiles(
    query: Record<string, unknown> = {},
    viewer?: { userId?: string; role?: string },
  ) {
    return playerProfileService.getAllProfiles(query, viewer);
  }

  async updateProfile(id: string, payload: any, caller?: { userId?: string; role?: string }) {
    return playerProfileService.updateProfile(id, payload, caller);
  }

  // 4. Styles & History
  async updatePlayerStyles(playerId: string, styles: string[]) {
    return playerCareerService.updatePlayerStyles(playerId, styles);
  }

  async updateClubHistory(playerId: string, clubHistory: any[]) {
    return playerCareerService.updateClubHistory(playerId, clubHistory);
  }

  async addClubHistoryItem(playerId: string, clubItem: any) {
    return playerCareerService.addClubHistoryItem(playerId, clubItem);
  }

  async updateClubHistoryItem(playerId: string, clubId: string, payload: any) {
    return playerCareerService.updateClubHistoryItem(playerId, clubId, payload);
  }

  async deleteClubHistoryItem(playerId: string, clubId: string) {
    return playerCareerService.deleteClubHistoryItem(playerId, clubId);
  }

  async updatePitchMap(playerId: string, payload: { positionMap?: any[]; futsalMap?: any[] }) {
    return playerCareerService.updatePitchMap(playerId, payload);
  }

  async uploadDocuments(playerId: string, files: Express.Multer.File[], customTitle?: string) {
    return playerCareerService.uploadDocuments(playerId, files, customTitle);
  }

  async deleteDocument(playerId: string, documentId: string) {
    return playerCareerService.deleteDocument(playerId, documentId);
  }

  async updateDocument(
    playerId: string,
    documentId: string,
    payload: { title?: string },
    newFile?: Express.Multer.File,
  ) {
    return playerCareerService.updateDocument(playerId, documentId, payload, newFile);
  }

  async getDocuments(playerId: string) {
    return playerCareerService.getDocuments(playerId);
  }

  // 5. Attributes Management
  formatCategorizedAttributes(doc: any) {
    return playerAttributeService.formatCategorizedAttributes(doc);
  }

  async updateAttributes(playerId: string, payload: Record<string, any>) {
    return playerAttributeService.updateAttributes(playerId, payload);
  }

  async getAttributes(playerId: string) {
    return playerAttributeService.getAttributes(playerId);
  }

  // 6. Match Records
  async addMatchRecord(payload: Partial<IMatchRecord>) {
    return playerMatchService.addMatchRecord(payload);
  }

  async getMatchRecordsByPlayerId(playerId: string) {
    return playerMatchService.getMatchRecordsByPlayerId(playerId);
  }

  async addClubInterest(playerId: string, data: { clubName: string; logoUrl?: string }) {
    return playerCvService.addClubInterest(playerId, data);
  }

  // 7. Media Gallery & Highlight Videos
  async uploadHighlightVideo(
    playerId: string,
    mediaUrl?: string,
    _thumbnailUrl?: string,
    _title?: string,
  ) {
    return playerMediaService.uploadHighlightVideo(playerId, mediaUrl, _thumbnailUrl, _title);
  }

  async uploadMediaGallery(
    playerId: string,
    mediaUrl: string,
    thumbnailUrl?: string,
    title?: string,
  ) {
    return playerMediaService.uploadMediaGallery(playerId, mediaUrl, thumbnailUrl, title);
  }

  async getMediaGallery(playerId: string, page = 1, limit = 10, mediaType?: string) {
    return playerMediaService.getMediaGallery(playerId, page, limit, mediaType);
  }

  // 8. Player Analytics Dashboard
  async getPlayerAnalytics(userIdOrPlayerId: string, query: Record<string, unknown> = {}) {
    return playerAnalyticsService.getPlayerAnalytics(userIdOrPlayerId, query);
  }

  async updateFullPotential(userIdOrPlayerId: string, payload: Record<string, any>) {
    return playerAnalyticsService.updateFullPotential(userIdOrPlayerId, payload);
  }

  async updateMentalAnalysis(userIdOrPlayerId: string, payload: Record<string, any>) {
    return playerAnalyticsService.updateMentalAnalysis(userIdOrPlayerId, payload);
  }

  // 9. Player Evaluations (Development Programme Progress Reports)
  async getMyEvaluations(userId: string) {
    return playerProfileService.getMyEvaluations(userId);
  }

  // 10. Link Parent account for 16+ player
  async linkParent(userId: string, payload: { parentEmail?: string; relationshipType?: string }) {
    return playerProfileService.linkParent(userId, payload);
  }
}

export const playerService = new PlayerService();
