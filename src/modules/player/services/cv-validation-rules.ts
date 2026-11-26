/**
 * Shared CV validation rules (coach verification of a player CV).
 * One place for the validity period and the player's re-validation button state.
 */

/** A coach validation is valid for 1 year after `verifiedAt`. */
export const CV_VALIDATION_VALIDITY_DAYS = 365;
const VALIDITY_MS = CV_VALIDATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

type CvLike = {
  isVerifiedByCoach?: boolean;
  coachVerification?: {
    isVerified?: boolean;
    verifiedAt?: Date | string | null;
    coachId?: unknown;
    validationPaymentStatus?: 'UNPAID' | 'PAID' | 'USED' | string | null;
    transactionId?: string | null;
    requestedAt?: Date | string | null;
    paidAt?: Date | string | null;
  } | null;
};

const isVerifiedFlag = (p: CvLike) =>
  Boolean(p?.isVerifiedByCoach || p?.coachVerification?.isVerified);

/** Validity end date, or null when never validated / no verifiedAt recorded. */
export const getCvValidationValidUntil = (p: CvLike): Date | null => {
  const at = p?.coachVerification?.verifiedAt;
  if (!isVerifiedFlag(p) || !at) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() + VALIDITY_MS);
};

/**
 * Is the coach validation currently active? A validation older than 1 year has expired and
 * no longer counts for the card tier. (A legacy validation without verifiedAt counts as active,
 * matching the coach dashboard.)
 */
export const isCoachValidationActive = (p: CvLike, now = new Date()): boolean => {
  if (!isVerifiedFlag(p)) return false;
  const until = getCvValidationValidUntil(p);
  return until ? until.getTime() >= now.getTime() : true;
};

export type RevalidationState =
  | 'NOT_VALIDATED' // never validated → can request
  | 'PAYMENT_PENDING' // request created, Stripe payment not completed → can request again (new checkout)
  | 'AWAITING_COACH' // paid, the chosen coach has to validate → button disabled
  | 'CHOOSE_NEW_COACH' // paid, but the coach left their academy → pick a new coach (no charge)
  | 'VALID' // validated and within 1 year → can request a re-validation (new payment)
  | 'EXPIRED'; // validated more than 1 year ago → can request (new payment)

export type RevalidationAction = 'REQUEST' | 'COMPLETE_PAYMENT' | 'CHOOSE_NEW_COACH' | 'NONE';

export const getRevalidationStatus = (p: CvLike, now = new Date()) => {
  const cv = p?.coachVerification || {};
  const payment = cv.validationPaymentStatus || null;

  let state: RevalidationState;
  if (payment === 'PAID') {
    state = cv.coachId ? 'AWAITING_COACH' : 'CHOOSE_NEW_COACH';
  } else if (payment === 'UNPAID' && cv.transactionId) {
    state = 'PAYMENT_PENDING';
  } else if (isVerifiedFlag(p)) {
    state = isCoachValidationActive(p, now) ? 'VALID' : 'EXPIRED';
  } else {
    state = 'NOT_VALIDATED';
  }

  const action: RevalidationAction =
    state === 'AWAITING_COACH'
      ? 'NONE'
      : state === 'CHOOSE_NEW_COACH'
        ? 'CHOOSE_NEW_COACH'
        : state === 'PAYMENT_PENDING'
          ? 'COMPLETE_PAYMENT'
          : 'REQUEST';

  return {
    state,
    action,
    canRequestRevalidation: action !== 'NONE',
    requiresPayment: action === 'REQUEST' || action === 'COMPLETE_PAYMENT',
    isValidationActive: isCoachValidationActive(p, now),
    validUntil: getCvValidationValidUntil(p),
    paymentStatus: payment,
  };
};
