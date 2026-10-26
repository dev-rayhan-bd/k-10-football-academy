import { IClubProfile, IClubAchievement, IClubFavourite } from './club.interface';
import { clubResolverService } from './services/club-resolver.service';
import { clubProfileService } from './services/club-profile.service';
import { clubScoutingService } from './services/club-scouting.service';
import { clubCvLibraryService } from './services/club-cv-library.service';
import { clubStoriesService } from './services/club-stories.service';
import { clubAnalyticsService } from './services/club-analytics.service';

/**
 * Enterprise Facade: ClubService
 * Delegates directly to domain subservices while maintaining 100% identical public signatures and responses.
 */
export class ClubService {
  // --- ClubResolverService Delegates ---

  formatClubProfileResponse(profile: any, fallbackUser?: any) {
    return clubResolverService.formatClubProfileResponse(profile, fallbackUser);
  }

  async resolveClub(userId: string) {
    return await clubResolverService.resolveClub(userId);
  }

  formatTimeAgo(date: Date | string): string {
    return clubResolverService.formatTimeAgo(date);
  }

  // --- ClubProfileService Delegates ---

  async getMyClubProfile(userId: string) {
    return await clubProfileService.getMyClubProfile(userId);
  }

  async updateMyClubProfile(userId: string, payload: any) {
    return await clubProfileService.updateMyClubProfile(userId, payload);
  }

  async createProfile(payload: Partial<IClubProfile>) {
    return await clubProfileService.createProfile(payload);
  }

  async getProfileById(id: string) {
    return await clubProfileService.getProfileById(id);
  }

  async getAllProfiles(filter: Record<string, unknown> = {}) {
    return await clubProfileService.getAllProfiles(filter);
  }

  async addAchievement(clubId: string, payload: Partial<IClubAchievement>) {
    return await clubProfileService.addAchievement(clubId, payload);
  }

  async getAchievements(clubId: string) {
    return await clubProfileService.getAchievements(clubId);
  }

  async addFavourite(clubId: string, payload: Partial<IClubFavourite>) {
    return await clubProfileService.addFavourite(clubId, payload);
  }

  async getFavourites(clubId: string) {
    return await clubProfileService.getFavourites(clubId);
  }

  // --- ClubScoutingService Delegates ---

  async getScoutingBoard(userId: string, query: any = {}) {
    return await clubScoutingService.getScoutingBoard(userId, query);
  }

  async getScoutingBoardPlayers(userId: string, query: any = {}) {
    return await clubScoutingService.getScoutingBoardPlayers(userId, query);
  }

  async getScoutingBoardCoaches(userId: string, query: any = {}) {
    return await clubScoutingService.getScoutingBoardCoaches(userId, query);
  }

  async shareScoutingProfile(
    userId: string,
    payload: { targetType: 'PLAYER' | 'COACH'; targetId: string },
  ) {
    return await clubScoutingService.shareScoutingProfile(userId, payload);
  }

  async toggleScoutingFavourite(
    userId: string,
    payload: { targetType: 'PLAYER' | 'COACH'; targetId: string },
  ) {
    return await clubScoutingService.toggleScoutingFavourite(userId, payload);
  }

  // --- ClubCvLibraryService Delegates ---

  async getClubCvsLibrary(userId: string, query: any = {}) {
    return await clubCvLibraryService.getClubCvsLibrary(userId, query);
  }

  async toggleLikePlayerCv(userId: string, playerId: string) {
    return await clubCvLibraryService.toggleLikePlayerCv(userId, playerId);
  }

  async sharePlayerCv(userId: string, playerId: string) {
    return await clubCvLibraryService.sharePlayerCv(userId, playerId);
  }

  // --- ClubStoriesService Delegates ---

  async getClubSuccessStories(userId: string, query: any = {}) {
    return await clubStoriesService.getClubSuccessStories(userId, query);
  }

  async getClubSuccessStoryById(userId: string, storyId: string, userRole?: string) {
    return await clubStoriesService.getClubSuccessStoryById(userId, storyId, userRole);
  }

  async createClubSuccessStory(userId: string, payload: any) {
    return await clubStoriesService.createClubSuccessStory(userId, payload);
  }

  async updateClubSuccessStory(userId: string, storyId: string, payload: any) {
    return await clubStoriesService.updateClubSuccessStory(userId, storyId, payload);
  }

  async reviewClubSuccessStory(
    storyId: string,
    status: 'APPROVED' | 'REJECTED',
    adminReviewNotes?: string,
  ) {
    return await clubStoriesService.reviewClubSuccessStory(storyId, status, adminReviewNotes);
  }

  async deleteClubSuccessStory(userId: string, storyId: string) {
    return await clubStoriesService.deleteClubSuccessStory(userId, storyId);
  }

  // --- ClubAnalyticsService Delegates ---

  async getClubAnalytics(userId: string, query: any = {}) {
    return await clubAnalyticsService.getClubAnalytics(userId, query);
  }

  async recordPlayerView(userId: string, playerId: string) {
    return await clubAnalyticsService.recordPlayerView(userId, playerId);
  }

  async getClubDashboard(userId: string, query: any = {}) {
    return await clubAnalyticsService.getClubDashboard(userId, query);
  }
}

export const clubService = new ClubService();
