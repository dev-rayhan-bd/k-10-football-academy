import { getRevalidationStatus, isCoachValidationActive } from './cv-validation-rules';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe('cv-validation-rules', () => {
  it('never validated → NOT_VALIDATED, can request with payment', () => {
    const r = getRevalidationStatus({});
    expect(r.state).toBe('NOT_VALIDATED');
    expect(r.action).toBe('REQUEST');
    expect(r.canRequestRevalidation).toBe(true);
    expect(r.requiresPayment).toBe(true);
  });

  it('checkout created but not paid → PAYMENT_PENDING', () => {
    const r = getRevalidationStatus({
      coachVerification: { validationPaymentStatus: 'UNPAID', transactionId: 'cs_1', coachId: 'c' },
    });
    expect(r.state).toBe('PAYMENT_PENDING');
    expect(r.action).toBe('COMPLETE_PAYMENT');
  });

  it('paid and coach assigned → AWAITING_COACH, button disabled', () => {
    const r = getRevalidationStatus({
      coachVerification: { validationPaymentStatus: 'PAID', coachId: 'c', transactionId: 'cs_1' },
    });
    expect(r.state).toBe('AWAITING_COACH');
    expect(r.canRequestRevalidation).toBe(false);
  });

  it('paid but coach released → CHOOSE_NEW_COACH without payment', () => {
    const r = getRevalidationStatus({
      coachVerification: { validationPaymentStatus: 'PAID', transactionId: 'cs_1' },
    });
    expect(r.state).toBe('CHOOSE_NEW_COACH');
    expect(r.requiresPayment).toBe(false);
  });

  it('validated within a year → VALID and active', () => {
    const p = {
      coachVerification: {
        isVerified: true,
        verifiedAt: daysAgo(30),
        validationPaymentStatus: 'USED',
      },
    };
    expect(getRevalidationStatus(p).state).toBe('VALID');
    expect(isCoachValidationActive(p)).toBe(true);
  });

  it('validated more than a year ago → EXPIRED and not active for the tier', () => {
    const p = {
      coachVerification: {
        isVerified: true,
        verifiedAt: daysAgo(400),
        validationPaymentStatus: 'USED',
      },
    };
    expect(getRevalidationStatus(p).state).toBe('EXPIRED');
    expect(isCoachValidationActive(p)).toBe(false);
  });

  it('new paid request after an old validation → AWAITING_COACH (payment state wins)', () => {
    const r = getRevalidationStatus({
      coachVerification: {
        isVerified: true,
        verifiedAt: daysAgo(400),
        validationPaymentStatus: 'PAID',
        coachId: 'c',
      },
    });
    expect(r.state).toBe('AWAITING_COACH');
  });
});
