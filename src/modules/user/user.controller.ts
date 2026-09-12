import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { userService, UserService } from './user.service';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { uploadToStorage } from '@/utils/fileUpload.utils';

export class UserController {
  constructor(private readonly service: UserService) {}

  register = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.file) {
      const avatarUrl = await uploadToStorage(req.file, 'avatars');
      req.body.avatar = avatarUrl;
    }

    const user = await this.service.registerUser(req.body);
    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      success: true,
      message: 'User registered successfully. Verification OTP sent to email.',
      data: user,
    });
  });

  login = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    const result = await this.service.loginUser(email, password);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'User logged in successfully',
      data: result,
    });
  });

  verifyOtp = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email, otp } = req.body;
    await this.service.verifyOtp(email, otp);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Email verified successfully',
    });
  });

  resendOtp = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;
    await this.service.resendOtp(email);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'New OTP sent to your email',
    });
  });

  forgotPassword = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;
    await this.service.forgotPassword(email);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Password reset OTP code sent to your email',
    });
  });

  resetPassword = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email, otp, newPassword } = req.body;
    await this.service.resetPassword(email, otp, newPassword);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  });

  refreshToken = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;
    const result = await this.service.refreshToken(refreshToken);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Access token refreshed successfully',
      data: result,
    });
  });

  logout = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      await this.service.logoutUser(authHeader);
    }
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Logged out successfully',
    });
  });

  changePassword = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { oldPassword, newPassword } = req.body;
    await this.service.changePassword(userId, oldPassword, newPassword);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Password changed successfully',
    });
  });

  getProfile = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const user = await this.service.getUserById(userId);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'User profile retrieved successfully',
      data: user,
    });
  });

  getAll = catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const users = await this.service.getAllUsers();
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Users retrieved successfully',
      data: users,
    });
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = await this.service.getUserById(req.params.id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'User retrieved successfully',
      data: user,
    });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.file) {
      const avatarUrl = await uploadToStorage(req.file, 'avatars');
      req.body.avatar = avatarUrl;
    }

    const user = await this.service.updateUser(req.params.id, req.body);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  });

  delete = catchAsync(async (req: Request, res: Response): Promise<void> => {
    await this.service.deleteUser(req.params.id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'User deleted successfully',
    });
  });
}

export const userController = new UserController(userService);
