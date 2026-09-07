import { Schema, model } from 'mongoose';
import { IAcademyInvoiceDocument } from './invoice.interface';

const AcademyInvoiceSchema = new Schema<IAcademyInvoiceDocument>(
  {
    parentId: { type: Schema.Types.ObjectId, ref: 'ParentProfile' },
    childPlayerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true },
    title: { type: String, required: true },
    invoiceNumber: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['UNPAID', 'PAID', 'OVERDUE'],
      default: 'UNPAID',
    },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

export const AcademyInvoice = model<IAcademyInvoiceDocument>(
  'AcademyInvoice',
  AcademyInvoiceSchema,
);
