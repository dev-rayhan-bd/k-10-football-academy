import { ITrainingSession, ITrainingAttendance } from './training.interface';
import { TrainingSession, TrainingAttendance } from './training.model';

export class TrainingService {
  async createSession(payload: Partial<ITrainingSession>) {
    return TrainingSession.create(payload);
  }

  async getSessionsByAcademy(academyId: string) {
    return TrainingSession.find({ academyId })
      .populate('teamId')
      .populate('coachId')
      .sort({ sessionDate: -1 });
  }

  async markAttendance(sessionId: string, payload: Partial<ITrainingAttendance>) {
    return TrainingAttendance.findOneAndUpdate(
      { sessionId, childPlayerId: payload.childPlayerId },
      { ...payload, sessionId },
      { new: true, upsert: true, runValidators: true },
    );
  }

  async getSessionAttendance(sessionId: string) {
    return TrainingAttendance.find({ sessionId }).populate('childPlayerId', 'fullName position');
  }
}

export const trainingService = new TrainingService();
