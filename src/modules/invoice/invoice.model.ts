import { Schema, model } from 'mongoose';
import { IAcademyInvoiceDocument } from './invoice.interface';

const AcademyInvoiceSchema = new Schema<IAcademyInvoiceDocument>(
  {
    parentId: { type: Schema.Types.ObjectId, ref: 'ParentProfile' },
    childPlayerId: {
      type: Schema.Types.ObjectId,
      ref: 'PlayerProfile',
      required: true,
      index: true,
    },
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'ExtraEvent', index: true },
    feeType: { type: String, default: 'EVENT_ENTRY_FEE' },
    title: { type: String, required: true },
    invoiceNumber: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['UNPAID', 'PAID', 'OVERDUE'],
      default: 'UNPAID',
      index: true,
    },
    paidAt: { type: Date },
    paymentMethod: { type: String },
    transactionId: { type: String },
    receiptUrl: { type: String },
  },
  { timestamps: true },
);

AcademyInvoiceSchema.index({ parentId: 1, status: 1 });
AcademyInvoiceSchema.index({ childPlayerId: 1, eventId: 1 });

export const AcademyInvoice = model<IAcademyInvoiceDocument>(
  'AcademyInvoice',
  AcademyInvoiceSchema,
);
