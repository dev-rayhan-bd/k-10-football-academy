import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import { auth } from '@/middlewares/auth.middleware';
import { createInvoiceZodSchema, updateInvoiceStatusZodSchema } from './invoice.validation';
import {
  createInvoice,
  getInvoice,
  getInvoicesByAcademy,
  updateInvoiceStatus,
} from './invoice.controller';

const router = Router();

router.post(
  '/',
  auth('SUPER_ADMIN', 'ACADEMY'),
  validateRequest(createInvoiceZodSchema),
  createInvoice,
);
router.get('/:id', auth(), getInvoice);
router.get('/academy/:academyId', auth('SUPER_ADMIN', 'ACADEMY'), getInvoicesByAcademy);
router.patch(
  '/:id/status',
  auth('SUPER_ADMIN', 'ACADEMY'),
  validateRequest(updateInvoiceStatusZodSchema),
  updateInvoiceStatus,
);

export const InvoiceRoutes = router;
