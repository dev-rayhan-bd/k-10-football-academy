import { ITrainingSession, ITrainingAttendance } from './training.interface';
import { TrainingSession, TrainingAttendance } from './training.model';
import QueryBuilder from '@/builder/QueryBuilder';

export class TrainingService {
  async createSession(payload: Partial<ITrainingSession>) {
    return TrainingSession.create(payload);
  }

  async getSessionsByAcademy(academyId: string, query: Record<string, unknown> = {}) {
    const sessionQuery = new QueryBuilder(
      TrainingSession.find({ academyId }).populate('teamId').populate('coachId'),
      query,
    )
      .search(['topic', 'location'])
      .filter()
      .sort()
      .paginate();

    const result = await sessionQuery.modelQuery;
    const meta = await sessionQuery.countTotal();

    return {
      meta,
      result,
    };
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
