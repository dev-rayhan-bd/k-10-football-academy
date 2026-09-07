import { Document, Types } from 'mongoose';

export type InvoiceStatus = 'UNPAID' | 'PAID' | 'OVERDUE';

export interface IAcademyInvoice {
  parentId?: Types.ObjectId;
  childPlayerId: Types.ObjectId;
  academyId: Types.ObjectId;
  title: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  status: InvoiceStatus;
  paidAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyInvoiceDocument extends IAcademyInvoice, Document {}
