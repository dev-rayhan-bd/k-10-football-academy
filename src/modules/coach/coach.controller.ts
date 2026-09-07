import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { coachService } from './coach.service';

export const createCoachProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.createProfile(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Coach profile created successfully',
    data: result,
  });
});

export const getCoachProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.getProfileById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach profile fetched successfully',
    data: result,
  });
});

export const getAllCoachProfiles = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.getAllProfiles(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach profiles fetched successfully',
    data: result,
  });
});

export const updateCoachProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.updateProfile(req.params.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Coach profile updated successfully',
    data: result,
  });
});

export const saveTacticalFormation = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.saveTacticalFormation(req.params.coachId, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tactical formation saved successfully',
    data: result,
  });
});

export const getTacticalFormations = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.getTacticalFormations(req.params.coachId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tactical formations fetched successfully',
    data: result,
  });
});

export const addTestimonial = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.addTestimonial(req.params.coachId, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Testimonial added successfully',
    data: result,
  });
});

export const getTestimonials = catchAsync(async (req: Request, res: Response) => {
  const result = await coachService.getTestimonials(req.params.coachId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Testimonials fetched successfully',
    data: result,
  });
});
