import { Document, Types } from 'mongoose';

export type RsvpStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'UNMARKED' | 'EXCUSED';

export interface ITrainingSession {
  academyId: Types.ObjectId;
  teamId: Types.ObjectId;
  coachId?: Types.ObjectId;
  sessionName: string;
  sessionTitle?: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  trainingLocation: string;
  locationField?: string;
  sessionType: string;
  focusArea: string;
  maxParticipants?: number;
  sessionDescription?: string;
  requiredEquipment?: string;
  additionalNotes?: string;

  // Real-time attendance metrics
  presentCount?: number;
  lateCount?: number;
  absentCount?: number;
  unmarkedCount?: number;
  totalPlayers?: number;
  attendancePercentage?: number;
  isAttendanceCompleted?: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITrainingSessionDocument extends ITrainingSession, Document {}

export interface ITrainingAttendance {
  sessionId: Types.ObjectId;
  playerId: Types.ObjectId;
  childPlayerId?: Types.ObjectId;
  status: AttendanceStatus;
  attendanceStatus?: AttendanceStatus;
  rsvpStatus?: RsvpStatus;
  notes?: string;
  markedBy?: Types.ObjectId;
  signInTime?: string;
  signOutTime?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITrainingAttendanceDocument extends ITrainingAttendance, Document {}
