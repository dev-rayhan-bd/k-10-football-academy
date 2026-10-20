import { AppError } from '@/utils/AppError';
import { IAcademyInvoice } from './invoice.interface';
import { AcademyInvoice } from './invoice.model';

export class InvoiceService {
  async createInvoice(payload: Partial<IAcademyInvoice>) {
    const count = await AcademyInvoice.countDocuments();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
    return AcademyInvoice.create({ ...payload, invoiceNumber });
  }

  async getInvoiceById(id: string) {
    const invoice = await AcademyInvoice.findById(id)
      .populate('parentId')
      .populate('childPlayerId')
      .populate('academyId');
    if (!invoice) {
      throw new AppError(404, 'Invoice not found');
    }
    return invoice;
  }

  async getInvoicesByAcademy(academyId: string) {
    return AcademyInvoice.find({ academyId })
      .populate('childPlayerId', 'fullName position')
      .sort({ createdAt: -1 });
  }

  async updateInvoiceStatus(id: string, status: 'UNPAID' | 'PAID' | 'OVERDUE') {
    const update: Record<string, unknown> = { status };
    if (status === 'PAID') {
      update.paidAt = new Date();
    }
    const invoice = await AcademyInvoice.findByIdAndUpdate(id, update, { new: true });
    if (!invoice) {
      throw new AppError(404, 'Invoice not found');
    }
    return invoice;
  }
}

export const invoiceService = new InvoiceService();
