import { LegalPolicy } from '@/modules/cms/cms.model';
import { logger } from '@/utils/logger';

export const seedLegalPolicies = async (): Promise<void> => {
  try {
    const defaultPolicies = [
      {
        type: 'TERMS_AND_CONDITIONS',
        title:
          'K10 Football Platform Terms & Conditions, Data Protection and Media Consent Agreement',
        slug: 'terms-and-conditions',
        version: '1.0',
        isMajorUpdate: false,
        isCurrent: true,
        isPublished: true,
        effectiveDate: new Date('2026-11-01'),
        summaryOfChanges: 'Initial baseline draft 1.0 for legal review and platform operation',
        content: `<h2>K10 FOOTBALL CV ANALYSIS</h2>
<h3>PLATFORM TERMS & CONDITIONS, DATA PROTECTION AND MEDIA CONSENT AGREEMENT</h3>
<p><strong>Document Version:</strong> 1.0 - Baseline</p>
<p><strong>Effective Date:</strong> November 1, 2026</p>

<h4>1. INTRODUCTION AND PURPOSE</h4>
<p>Welcome to K10 Football CV Analysis ("K10", "the Platform", "we", "us", or "our"). K10 is a digital football development, performance analysis and professional networking platform designed to help football players, coaches, academies and clubs organise and present football-related information.</p>
<p>The Platform enables eligible users to create football CVs, upload photographs and videos, document playing or coaching experience, receive performance evaluations, and make approved information available to authorised football professionals:</p>
<ul>
  <li>Licensed football agents and intermediaries</li>
  <li>Professional football clubs and authorised recruitment personnel</li>
  <li>Verified football scouts and talent identification professionals</li>
  <li>Registered football academies and authorised coaches</li>
  <li>Other appropriately verified football development professionals approved by K10</li>
</ul>
<p>By creating an account, users agree to comply with these Terms and Conditions. Where consent is required for particular data processing activities, K10 will request that consent separately. Registration and acceptance of these Terms do not automatically authorise public disclosure of personal information, photographs, videos or children's profiles.</p>

<h4>2. USER CATEGORIES AND ACCOUNT ELIGIBILITY</h4>
<h5>2.1 Players</h5>
<p>Players may create or maintain football profiles containing personal and sporting information, photographs, videos and performance records, subject to applicable age requirements and permissions.</p>
<h5>2.2 Parents and Legal Guardians</h5>
<p>Parents or legal guardians may register and manage profiles on behalf of children, provide required authorisations, manage visibility permissions and monitor use of their child's information.</p>
<h5>2.3 Coaches</h5>
<p>Coaches may create professional profiles containing qualifications, coaching licences, employment history, professional experience, photographs, videos and other relevant information. Coaches must provide accurate information.</p>`,
      },
      {
        type: 'PRIVACY_POLICY',
        title: 'K10 Football Platform Privacy and Data Protection Policy',
        slug: 'privacy-policy',
        version: '1.0',
        isMajorUpdate: false,
        isCurrent: true,
        isPublished: true,
        effectiveDate: new Date('2026-11-01'),
        summaryOfChanges: 'Initial GDPR and local data protection compliance baseline',
        content: `<h2>K10 FOOTBALL PLATFORM PRIVACY POLICY</h2>
<p><strong>Version:</strong> 1.0</p>
<p><strong>Effective Date:</strong> November 1, 2026</p>
<h4>1. DATA COLLECTION & PROCESSING</h4>
<p>We process personal data, athletic attributes, match videos, and scouting reports solely for football identification and verification purposes.</p>
<h4>2. MINOR PROTECTION</h4>
<p>Players under 16 years of age require parental or legal guardian consent before public visibility or scout interaction.</p>`,
      },
      {
        type: 'MEDIA_CONSENT',
        title: 'K10 Football Media Consent Agreement',
        slug: 'media-consent',
        version: '1.0',
        isMajorUpdate: false,
        isCurrent: true,
        isPublished: true,
        effectiveDate: new Date('2026-11-01'),
        summaryOfChanges: 'Initial media and video analysis authorization baseline',
        content: `<h2>K10 FOOTBALL MEDIA CONSENT AGREEMENT</h2>
<p><strong>Version:</strong> 1.0</p>
<p><strong>Effective Date:</strong> November 1, 2026</p>
<p>Authorizes recording, uploading, technical analysis, and authorized scouting transmission of match footage and training highlights.</p>`,
      },
    ];

    for (const policyData of defaultPolicies) {
      const existing = await LegalPolicy.findOne({
        type: policyData.type,
        version: policyData.version,
      });

      if (!existing) {
        await LegalPolicy.create(policyData);
        logger.info(`📄 Legal Policy seeded: ${policyData.type} (v${policyData.version})`);
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to seed legal policies');
  }
};
