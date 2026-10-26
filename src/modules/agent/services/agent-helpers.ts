export function calculateAge(dateOfBirth?: Date | string | null): number | undefined {
  if (!dateOfBirth) return undefined;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : undefined;
}

export function calculateProfileCompletion(profile: any, user: any): number {
  const fields = [
    profile?.fullName || profile?.name || user?.name,
    profile?.nationality || profile?.country || user?.country,
    profile?.licenseId || profile?.fifaLicenseNumber || user?.fifaLicenseNumber,
    profile?.dateOfBirth || user?.dateOfBirth,
    profile?.contact || profile?.phone || user?.phone,
    user?.email || profile?.email,
    profile?.coverPhoto || user?.coverPhoto,
    profile?.yearsOfExperience !== undefined &&
      profile?.yearsOfExperience !== null &&
      profile?.yearsOfExperience !== '',
    profile?.certifications,
    profile?.achievements,
    profile?.bio || profile?.professionalBio,
  ];
  const filledCount = fields.filter((f) => Boolean(f)).length;
  return Math.round((filledCount / fields.length) * 100);
}

export function formatAgentProfileResponse(rawDoc: any) {
  if (!rawDoc) return rawDoc;
  const profile = rawDoc.toObject ? rawDoc.toObject() : { ...rawDoc };
  const user = profile.userId && typeof profile.userId === 'object' ? profile.userId : null;

  const age = calculateAge(profile.dateOfBirth || user?.dateOfBirth);
  const profileCompletion = calculateProfileCompletion(profile, user);

  const fullName = profile.fullName || profile.name || user?.name || '';
  const nationality = profile.nationality || profile.country || user?.country || '';
  const licenseId = profile.licenseId || profile.fifaLicenseNumber || user?.fifaLicenseNumber || '';
  const contact = profile.contact || profile.phone || user?.phone || '';
  const email = user?.email || profile.email || '';
  const avatar = profile.avatar || user?.avatar || '';
  const coverPhoto = profile.coverPhoto || user?.coverPhoto || '';
  const certifications = profile.certifications || 'FIFA Licensed Agent';
  const bio = profile.bio || profile.professionalBio || '';

  return {
    ...profile,
    fullName,
    name: fullName,
    nationality,
    country: nationality,
    licenseId,
    fifaLicenseNumber: licenseId,
    dateOfBirth: profile.dateOfBirth || user?.dateOfBirth || null,
    age,
    contact,
    phone: contact,
    email,
    avatar,
    coverPhoto,
    certifications,
    achievements: profile.achievements || '',
    bio,
    professionalBio: bio,
    agencyName: profile.agencyName || user?.agencyName || '',
    officialWebsite: profile.officialWebsite || user?.officialWebsite || '',
    countryOfOperation: profile.countryOfOperation || user?.countryOfOperation || '',
    profileCompletion,
    tier: 'ACTIVE AGENT',
    currentTier: 'ACTIVE AGENT',
    isVerified: profile.verificationStatus === 'APPROVED' || Boolean(user?.isVerified),
    personalInformation: {
      fullName,
      nationality,
      licenseId,
      dateOfBirth: profile.dateOfBirth || user?.dateOfBirth || null,
      age,
      contact,
      email,
      coverPhoto,
      avatar,
    },
    professionalDetails: {
      yearsOfExperience: profile.yearsOfExperience ?? null,
      certifications,
      achievements: profile.achievements || '',
      agencyName: profile.agencyName || user?.agencyName || '',
      officialWebsite: profile.officialWebsite || user?.officialWebsite || '',
      countryOfOperation: profile.countryOfOperation || user?.countryOfOperation || '',
    },
    biography: {
      bio,
      professionalBio: bio,
    },
    headerCard: {
      fullName,
      tagline: `PREMIUM AGENT • ${age ? `${age} YEARS OLD • ` : ''}${nationality.toUpperCase() || 'BRAZIL'}`,
      licenseId,
      certifications,
      contact,
      email,
      coverPhoto,
      avatar,
      profileCompletion,
      tier: 'ACTIVE AGENT',
    },
    licensedVerification: {
      status: profile.verificationStatus || user?.verificationStatus || 'PENDING',
      statusLabel:
        (profile.verificationStatus || user?.verificationStatus) === 'APPROVED'
          ? 'Approved'
          : (profile.verificationStatus || user?.verificationStatus) === 'REJECTED'
            ? 'Rejected'
            : 'Pending',
      isVerified: profile.verificationStatus === 'APPROVED' || Boolean(user?.isVerified),
      message:
        profile.verificationStatus === 'APPROVED' || user?.isVerified
          ? 'Your account is currently verified'
          : profile.verificationStatus === 'REJECTED'
            ? 'Your verification request was rejected. Please upload valid documents.'
            : 'Your verification documents are currently under review',
      documents: [
        {
          documentType: 'LICENSE_CERTIFICATE',
          title: 'License Certificate',
          status: profile.verificationStatus || 'PENDING',
          statusLabel:
            profile.verificationStatus === 'APPROVED'
              ? 'Approved'
              : profile.verificationStatus === 'REJECTED'
                ? 'Rejected'
                : 'Pending',
          fileUrl: profile.licenseCertificateDocument || user?.licenseCertificateDocument || null,
          isUploaded: Boolean(
            profile.licenseCertificateDocument || user?.licenseCertificateDocument,
          ),
        },
        {
          documentType: 'NATIONAL_ID_PASSPORT',
          title: 'National ID / Passport',
          status: profile.verificationStatus || 'PENDING',
          statusLabel:
            profile.verificationStatus === 'APPROVED'
              ? 'Approved'
              : profile.verificationStatus === 'REJECTED'
                ? 'Rejected'
                : 'Pending',
          fileUrl: profile.identityDocument || user?.identityDocument || null,
          isUploaded: Boolean(profile.identityDocument || user?.identityDocument),
        },
        {
          documentType: 'ASSOCIATION_MEMBERSHIP',
          title: 'Association Membership',
          status: profile.verificationStatus || 'PENDING',
          statusLabel:
            profile.verificationStatus === 'APPROVED'
              ? 'Approved'
              : profile.verificationStatus === 'REJECTED'
                ? 'Rejected'
                : 'Pending',
          fileUrl: profile.associationMembershipDocument || null,
          isUploaded: Boolean(profile.associationMembershipDocument),
        },
      ],
    },
  };
}
