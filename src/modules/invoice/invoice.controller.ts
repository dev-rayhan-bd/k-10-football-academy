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

/**
 * Parent Portal: Fees & Payments (Event Entry Fees Only)
 */
export const getParentEventFees = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await invoiceService.getParentEventInvoices(user, req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Event fee invoices fetched successfully',
    data: result,
  });
});

/**
 * Parent Portal: Pay Event Entry Fee (Stripe Checkout)
 */
export const payEventFee = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const invoiceId = req.params.id || req.params.invoiceId;
  const result = await invoiceService.payEventFeeInvoice(user, invoiceId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.alreadyPaid ? result.message : 'Stripe checkout session created successfully',
    data: result,
  });
});

/**
 * Parent Portal: Verify Event Fee Payment
 */
export const verifyEventFeePayment = catchAsync(async (req: Request, res: Response) => {
  const sessionId = (req.query.session_id || req.query.sessionId) as string | undefined;
  const invoiceId = (req.query.invoiceId || req.query.invoice_id) as string | undefined;
  const result = await invoiceService.verifyEventFeePayment(sessionId, invoiceId);
  sendResponse(res, {
    statusCode: result.success ? 200 : 400,
    success: result.success,
    message: result.message,
    data: (result as any).invoice || null,
  });
});

/**
 * Parent / Academy / User: Download Official PDF Invoice
 */
export const downloadInvoicePdf = catchAsync(async (req: Request, res: Response) => {
  const invoiceId = req.params.id || req.params.invoiceId;
  const { buffer, filename } = await invoiceService.generateInvoicePdf(invoiceId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
});
