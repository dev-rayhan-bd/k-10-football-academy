export interface IAdminListQuery {
  search?: string;
  searchTerm?: string;
  status?: string;
  position?: string;
  country?: string;
  ageRange?: string;
  minAge?: string | number;
  maxAge?: string | number;
  gender?: string;
  cvType?: string;
  cvTier?: string;
  license?: string;
  verificationStatus?: string;
  verification?: string;
  role?: string;
  category?: string;
  targetRole?: string;
  onlyCategoryGrants?: string;
  page?: string | number;
  limit?: string | number;
}

export interface IAdminPaymentQuery {
  search?: string;
  searchTerm?: string;
  status?: string;
  paymentStatus?: string;
  type?: string;
  paymentType?: string;
  category?: string;
  role?: string;
  entityRole?: string;
  entityType?: string;
  userId?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: string | number;
  maxAmount?: string | number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc' | 'ASC' | 'DESC';
  includeFreeGrants?: string;
  page?: string | number;
  limit?: string | number;
}

export interface IAdminDashboardQuery {
  year?: string | number;
  page?: string | number;
  limit?: string | number;
}

export interface IAdminAnalyticsQuery {
  year?: string | number;
  role?: string;
  startDate?: string;
  endDate?: string;
}

export const isIgnoredFilter = (val?: string | number): boolean => {
  if (val === undefined || val === null) return true;
  const s = String(val).trim().toUpperCase();
  return (
    s === '' ||
    s === 'ALL' ||
    s === 'ALL STATUS' ||
    s === 'ALL TYPES' ||
    s === 'ALL ROLES' ||
    s === 'ALL POSITIONS' ||
    s === 'COUNTRY' ||
    s === 'AGE RANGE' ||
    s === 'ALL VERIFICATION'
  );
};

export const matchesStatusFilter = (userStatus: string, filterStatus?: string): boolean => {
  if (isIgnoredFilter(filterStatus)) return true;
  const target = String(filterStatus).trim().toUpperCase();
  const current = (userStatus || 'ACTIVE').toUpperCase();
  if (target === 'ACTIVE') return current === 'ACTIVE';
  if (target === 'INACTIVE' || target === 'BLOCKED') {
    return current === 'INACTIVE' || current === 'BLOCKED';
  }
  return current === target;
};

export const calculateAge = (age?: number, dateOfBirth?: Date | string): number | null => {
  if (typeof age === 'number' && !isNaN(age) && age > 0) return age;
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const today = new Date();
      let calc = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        calc--;
      }
      return Math.max(0, calc);
    }
  }
  return null;
};

export const parseAgeRange = (
  ageRange?: string,
  minAgeParam?: string | number,
  maxAgeParam?: string | number,
): { min?: number; max?: number } => {
  const result: { min?: number; max?: number } = {};
  if (minAgeParam !== undefined && minAgeParam !== '') {
    const n = Number(minAgeParam);
    if (!isNaN(n)) result.min = n;
  }
  if (maxAgeParam !== undefined && maxAgeParam !== '') {
    const n = Number(maxAgeParam);
    if (!isNaN(n)) result.max = n;
  }
  if (!isIgnoredFilter(ageRange)) {
    const raw = String(ageRange).trim();
    const rangeMatch = raw.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      result.min = Number(rangeMatch[1]);
      result.max = Number(rangeMatch[2]);
    } else if (raw.endsWith('+')) {
      const n = parseInt(raw, 10);
      if (!isNaN(n)) result.min = n;
    } else if (/^u-?(\d+)$/i.test(raw)) {
      const m = raw.match(/^u-?(\d+)$/i);
      if (m) result.max = Number(m[1]);
    } else {
      const exact = Number(raw);
      if (!isNaN(exact)) {
        result.min = exact;
        result.max = exact;
      }
    }
  }
  return result;
};

export const parseFlexibleDate = (input?: string | Date | null): Date | undefined => {
  if (!input) return undefined;
  if (input instanceof Date) return !isNaN(input.getTime()) ? input : undefined;
  const raw = String(input).trim();
  if (!raw) return undefined;

  const slashParts = raw.split('/');
  if (slashParts.length === 3) {
    const p0 = Number(slashParts[0]);
    const p1 = Number(slashParts[1]);
    const year = Number(slashParts[2]);
    if (!isNaN(p0) && !isNaN(p1) && !isNaN(year)) {
      const day = p0;
      const month = p1 - 1;
      const d = new Date(Date.UTC(year, month, day));
      if (!isNaN(d.getTime())) return d;
    }
  }

  const parsed = new Date(raw);
  return !isNaN(parsed.getTime()) ? parsed : undefined;
};

export const formatDateYMD = (date?: Date | string | null): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

export const inferTargetRole = (input?: string): string => {
  if (!input) return 'PLAYER';
  const s = input.trim().toUpperCase();
  if (['PLAYER', 'COACH', 'AGENT', 'CLUB', 'ACADEMY', 'PARENT'].includes(s)) return s;
  if (s.includes('PLAYER') || s.includes('ATHLETE')) return 'PLAYER';
  if (s.includes('COACH')) return 'COACH';
  if (s.includes('AGENT')) return 'AGENT';
  if (s.includes('GRASSROOT') || s.includes('ACADEMY')) return 'ACADEMY';
  if (s.includes('CLUB')) return 'CLUB';
  if (s.includes('PARENT') || s.includes('GUARDIAN')) return 'PARENT';
  return s;
};

export const parseDurationInput = (
  rawDuration?: string | number,
): { months: number; label: string } => {
  if (rawDuration === undefined || rawDuration === null || rawDuration === '') {
    return { months: 12, label: '1 Year' };
  }
  const s = String(rawDuration).trim().toUpperCase();
  if (s === '3' || s.includes('3 MONTH') || s === '3_MONTHS' || s === '3M') {
    return { months: 3, label: '3 Months' };
  }
  if (s === '6' || s.includes('6 MONTH') || s === '6_MONTHS' || s === '6M') {
    return { months: 6, label: '6 Months' };
  }
  if (
    s === '12' ||
    s === '1' ||
    s.includes('1 YEAR') ||
    s === '1_YEAR' ||
    s.includes('12 MONTH') ||
    s === '12_MONTHS' ||
    s === '1Y'
  ) {
    return { months: 12, label: '1 Year' };
  }
  const num = parseInt(s, 10);
  if (!isNaN(num) && num > 0) {
    return {
      months: num,
      label: num === 12 ? '1 Year' : `${num} Months`,
    };
  }
  return { months: 12, label: '1 Year' };
};

export const formatTimeAgo = (date?: Date | string | null): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `mo ago`;
  return `y ago`;
};
