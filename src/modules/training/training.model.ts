import { Schema, model } from 'mongoose';
import { ITrainingSessionDocument, ITrainingAttendanceDocument } from './training.interface';

const TrainingSessionSchema = new Schema<ITrainingSessionDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', index: true },
    sessionName: { type: String, required: true, trim: true },
    sessionTitle: { type: String, trim: true },
    sessionDate: { type: Date, required: true, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    trainingLocation: { type: String, required: true },
    locationField: { type: String },
    sessionType: { type: String, required: true, default: 'Technical' },
    focusArea: { type: String, required: true, default: 'General Practice' },
    maxParticipants: { type: Number },
    sessionDescription: { type: String },
    requiredEquipment: { type: String },
    additionalNotes: { type: String },

    presentCount: { type: Number, default: 0 },
    lateCount: { type: Number, default: 0 },
    absentCount: { type: Number, default: 0 },
    unmarkedCount: { type: Number, default: 0 },
    totalPlayers: { type: Number, default: 0 },
    attendancePercentage: { type: Number, default: 0 },
    isAttendanceCompleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

TrainingSessionSchema.index({ academyId: 1, sessionDate: -1 });
TrainingSessionSchema.index({ teamId: 1, sessionDate: -1 });

const TrainingAttendanceSchema = new Schema<ITrainingAttendanceDocument>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'TrainingSession', required: true, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, index: true },
    childPlayerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile' },
    status: {
      type: String,
      enum: ['PRESENT', 'LATE', 'ABSENT', 'UNMARKED', 'EXCUSED'],
      default: 'UNMARKED',
    },
    attendanceStatus: {
      type: String,
      enum: ['PRESENT', 'LATE', 'ABSENT', 'UNMARKED', 'EXCUSED'],
    },
    rsvpStatus: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'DECLINED'],
      default: 'PENDING',
    },
    notes: { type: String },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    signInTime: { type: String },
    signOutTime: { type: String },
  },
  { timestamps: true },
);

TrainingAttendanceSchema.index({ sessionId: 1, playerId: 1 }, { unique: true });

export const TrainingSession = model<ITrainingSessionDocument>(
  'TrainingSession',
  TrainingSessionSchema,
);
export const TrainingAttendance = model<ITrainingAttendanceDocument>(
  'TrainingAttendance',
  TrainingAttendanceSchema,
);
