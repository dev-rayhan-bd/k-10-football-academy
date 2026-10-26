import { IUser, IUserDocument, ILoginResponse, IRefreshTokenResponse } from './user.interface';
import { userRepository, UserRepository } from './user.repository';
import { userRegistrationService } from './services/user-registration.service';
import { userAuthService } from './services/user-auth.service';
import { userProfileService } from './services/user-profile.service';
import { userVerificationService } from './services/user-verification.service';

/**
 * Enterprise Facade: UserService
 * Delegates directly to domain subservices while maintaining 100% identical public signatures and responses.
 */
export class UserService {
  constructor(_userRepo: UserRepository = userRepository) {
    void _userRepo;
  }

  // --- UserRegistrationService Delegates ---

  async registerUser(
    userData: Partial<IUser>,
  ): Promise<{ user: IUserDocument; isResent: boolean }> {
    return await userRegistrationService.registerUser(userData);
  }

  // --- UserAuthService Delegates ---

  async loginUser(email: string, candidatePassword: string): Promise<ILoginResponse> {
    return await userAuthService.loginUser(email, candidatePassword);
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    return await userAuthService.verifyOtp(email, otp);
  }

  async resendOtp(email: string): Promise<void> {
    return await userAuthService.resendOtp(email);
  }

  async forgotPassword(email: string): Promise<void> {
    return await userAuthService.forgotPassword(email);
  }

  async verifyResetOtp(email: string, otp: string): Promise<{ resetToken: string }> {
    return await userAuthService.verifyResetOtp(email, otp);
  }

  async resetPassword(params: {
    email?: string;
    newPassword: string;
    resetToken?: string;
    otp?: string;
  }): Promise<void> {
    return await userAuthService.resetPassword(params);
  }

  async refreshToken(refreshToken: string): Promise<IRefreshTokenResponse> {
    return await userAuthService.refreshToken(refreshToken);
  }

  async logoutUser(token: string): Promise<void> {
    return await userAuthService.logoutUser(token);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    return await userAuthService.changePassword(userId, oldPassword, newPassword);
  }

  // --- UserProfileService Delegates ---

  async getUserById(id: string): Promise<any> {
    return await userProfileService.getUserById(id);
  }

  async getAllUsers(): Promise<IUserDocument[]> {
    return await userProfileService.getAllUsers();
  }

  async updateMyProfile(userId: string, updateData: any): Promise<any> {
    return await userProfileService.updateMyProfile(userId, updateData);
  }

  async updateUser(id: string, updateData: Partial<IUser>): Promise<IUserDocument> {
    return await userProfileService.updateUser(id, updateData);
  }

  async deleteUser(id: string): Promise<void> {
    return await userProfileService.deleteUser(id);
  }

  // --- UserVerificationService Delegates ---

  async getPendingVerifications(role?: string) {
    return await userVerificationService.getPendingVerifications(role);
  }

  async decideVerification(
    targetUserId: string,
    payload: { status: 'APPROVED' | 'REJECTED'; reviewNotes?: string },
  ) {
    return await userVerificationService.decideVerification(targetUserId, payload);
  }
}

export const userService = new UserService();
