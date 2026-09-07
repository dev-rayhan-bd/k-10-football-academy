import { Schema, model } from 'mongoose';
import { ITrainingSessionDocument, ITrainingAttendanceDocument } from './training.interface';

const TrainingSessionSchema = new Schema<ITrainingSessionDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile' },
    sessionTitle: { type: String, required: true },
    sessionDate: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    locationField: { type: String, required: true },
  },
  { timestamps: true },
);

const TrainingAttendanceSchema = new Schema<ITrainingAttendanceDocument>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'TrainingSession', required: true },
    childPlayerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    rsvpStatus: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'DECLINED'],
      default: 'PENDING',
    },
    attendanceStatus: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'EXCUSED'],
      default: 'ABSENT',
    },
  },
  { timestamps: true },
);

export const TrainingSession = model<ITrainingSessionDocument>(
  'TrainingSession',
  TrainingSessionSchema,
);
export const TrainingAttendance = model<ITrainingAttendanceDocument>(
  'TrainingAttendance',
  TrainingAttendanceSchema,
);
