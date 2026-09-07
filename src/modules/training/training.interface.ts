import { Document, Types } from 'mongoose';

export type RsvpStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED';

export interface ITrainingSession {
  academyId: Types.ObjectId;
  teamId?: Types.ObjectId;
  coachId?: Types.ObjectId;
  sessionTitle: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  locationField: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITrainingSessionDocument extends ITrainingSession, Document {}

export interface ITrainingAttendance {
  sessionId: Types.ObjectId;
  childPlayerId: Types.ObjectId;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;
  createdAt?: Date;
}

export interface ITrainingAttendanceDocument extends ITrainingAttendance, Document {}
