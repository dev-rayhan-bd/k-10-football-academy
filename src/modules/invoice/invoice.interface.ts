import { Document, Types } from 'mongoose';

export type InvoiceStatus = 'UNPAID' | 'PAID' | 'OVERDUE';

export interface IAcademyInvoice {
  parentId?: Types.ObjectId;
  childPlayerId: Types.ObjectId;
  academyId: Types.ObjectId;
  eventId?: Types.ObjectId;
  feeType?: string;
  title: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  status: InvoiceStatus;
  paidAt?: Date;
  paymentMethod?: string;
  transactionId?: string;
  receiptUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyInvoiceDocument extends IAcademyInvoice, Document {}
