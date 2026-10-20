import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { sendResponse } from '@/utils/sendResponse';
import { invoiceService } from './invoice.service';

export const createInvoice = catchAsync(async (req: Request, res: Response) => {
  const result = await invoiceService.createInvoice(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Invoice created successfully',
    data: result,
  });
});

export const getInvoice = catchAsync(async (req: Request, res: Response) => {
  const result = await invoiceService.getInvoiceById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Invoice fetched successfully',
    data: result,
  });
});

export const getInvoicesByAcademy = catchAsync(async (req: Request, res: Response) => {
  const result = await invoiceService.getInvoicesByAcademy(req.params.academyId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Invoices fetched successfully',
    data: result,
  });
});

export const updateInvoiceStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await invoiceService.updateInvoiceStatus(req.params.id, req.body.status);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Invoice status updated successfully',
    data: result,
  });
});
