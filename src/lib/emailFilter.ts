/**
 * Advanced Email & Gmail Quality Validation and Filtering Engine
 * Filters out image assets (e.g. .png, .jpg, @2x), malformed strings, junk domains, and invalid addresses.
 */

const ASSET_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.tif',
  '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.mov', '.avi', '.css', '.js', '.ts',
  '.json', '.xml', '.woff', '.woff2', '.ttf', '.eot', '.map'
];

const ASSET_KEYWORDS = [
  '2x.png', '3x.png', 'logo', 'icon', 'banner', 'avatar', 'sprite', 'asset', 'image', 'button',
  'gravatar', 'webpack', 'favicon', 'placeholder', 'dummy'
];

const JUNK_DOMAINS = [
  'example.com', 'example.org', 'example.net', 'domain.com', 'email.com', 'test.com',
  'sentry.io', 'wixpress.com', 'cloudflare.com', 'github.com', 'mysite.com', 'localhost'
];

const JUNK_LOCAL_PARTS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'sentry', 'test', 'user', 'null', 'undefined'
];

export interface EmailValidationResult {
  isValid: boolean;
  email: string;
  reason?: string;
  category: 'valid' | 'asset_file' | 'malformed' | 'junk_domain' | 'missing_tld';
}

/**
 * Validates whether an email string is a genuine, high-quality email address.
 * Rejects image files (.png, .jpg), retina image markers (@2x.png), malformed strings, and spam traps.
 */
export function validateEmailQuality(rawEmail: string): EmailValidationResult {
  if (!rawEmail || typeof rawEmail !== 'string') {
    return {
      isValid: false,
      email: '',
      reason: 'Empty email value',
      category: 'malformed'
    };
  }

  const email = rawEmail.trim().toLowerCase().replace(/^["'<(\[]+|["'>)\]]+$/g, '');

  if (!email) {
    return {
      isValid: false,
      email: '',
      reason: 'Empty email value',
      category: 'malformed'
    };
  }

  // 1. Detect file asset extensions (.png, .jpg, etc.)
  for (const ext of ASSET_EXTENSIONS) {
    if (email.endsWith(ext) || email.includes(`${ext}@`) || email.includes(`@${ext}`) || email.includes(`${ext}.`)) {
      return {
        isValid: false,
        email,
        reason: `Contains media/asset file extension (${ext})`,
        category: 'asset_file'
      };
    }
  }

  // 2. Detect retina / image markers in string
  for (const keyword of ASSET_KEYWORDS) {
    if (email.includes(`@${keyword}`) || email.includes(`${keyword}.png`) || email.includes(`${keyword}.jpg`)) {
      return {
        isValid: false,
        email,
        reason: `Resembles an image/graphic asset token (${keyword})`,
        category: 'asset_file'
      };
    }
  }

  // 3. Must contain exactly one '@' character
  const atParts = email.split('@');
  if (atParts.length !== 2) {
    return {
      isValid: false,
      email,
      reason: atParts.length < 2 ? 'Missing @ symbol' : 'Contains multiple @ symbols',
      category: 'malformed'
    };
  }

  const [localPart, domainPart] = atParts;

  // 4. Validate local part
  if (!localPart || localPart.length > 64) {
    return {
      isValid: false,
      email,
      reason: 'Invalid username/local part length',
      category: 'malformed'
    };
  }

  if (JUNK_LOCAL_PARTS.includes(localPart)) {
    return {
      isValid: false,
      email,
      reason: `Automated/No-reply address (${localPart}@)`,
      category: 'junk_domain'
    };
  }

  // 5. Validate domain part
  if (!domainPart || domainPart.length > 255 || !domainPart.includes('.')) {
    return {
      isValid: false,
      email,
      reason: 'Invalid domain structure (missing dot)',
      category: 'missing_tld'
    };
  }

  if (JUNK_DOMAINS.includes(domainPart)) {
    return {
      isValid: false,
      email,
      reason: `Blacklisted placeholder/test domain (${domainPart})`,
      category: 'junk_domain'
    };
  }

  // 6. Check Top-Level Domain (TLD)
  const domainDots = domainPart.split('.');
  const tld = domainDots[domainDots.length - 1];
  if (!tld || tld.length < 2 || !/^[a-z]{2,63}$/i.test(tld)) {
    return {
      isValid: false,
      email,
      reason: `Invalid top-level domain (.${tld || 'unknown'})`,
      category: 'missing_tld'
    };
  }

  // 7. Strict RFC 5322 Standard Email Regex Check
  const rfcRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!rfcRegex.test(email)) {
    return {
      isValid: false,
      email,
      reason: 'Does not match valid email address format',
      category: 'malformed'
    };
  }

  return {
    isValid: true,
    email,
    category: 'valid'
  };
}

export interface CategorizedRecipients<T> {
  good: (T & { validation: EmailValidationResult })[];
  bad: (T & { validation: EmailValidationResult })[];
  total: number;
}

export function filterAndCategorizeRecipients<T extends { email: string }>(
  items: T[]
): CategorizedRecipients<T> {
  const good: (T & { validation: EmailValidationResult })[] = [];
  const bad: (T & { validation: EmailValidationResult })[] = [];

  for (const item of items) {
    const val = validateEmailQuality(item.email);
    if (val.isValid) {
      good.push({ ...item, email: val.email, validation: val });
    } else {
      bad.push({ ...item, validation: val });
    }
  }

  return {
    good,
    bad,
    total: items.length
  };
}

export type EmailProviderType = 'gmail' | 'outlook' | 'yahoo' | 'hotmail' | 'webmail' | 'corporate';

export interface EmailClassification {
  provider: EmailProviderType;
  providerName: string;
  isWebmail: boolean;
  isGmail: boolean;
}

/**
 * Classifies an email address into its inbox provider:
 * Supports Gmail, Outlook, Hotmail, Yahoo, iCloud, Proton, etc.
 * Any address that is not one of these is categorized as corporate/custom domain.
 */
export function classifyEmailProvider(rawEmail: string): EmailClassification {
  const lower = (rawEmail || '').toLowerCase().trim();
  const domain = lower.split('@')[1] || '';

  if (!domain) {
    return { provider: 'corporate', providerName: 'Unknown', isWebmail: false, isGmail: false };
  }

  // 1. Gmail / Googlemail
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return { provider: 'gmail', providerName: 'Gmail', isWebmail: true, isGmail: true };
  }

  // 2. Hotmail (.com, .co.uk, .uk, .fr, .es, etc.)
  if (domain.startsWith('hotmail.') || domain.endsWith('.hotmail.com')) {
    return { provider: 'hotmail', providerName: 'Hotmail', isWebmail: true, isGmail: false };
  }

  // 3. Outlook & Microsoft live/msn
  if (
    domain.startsWith('outlook.') ||
    domain.startsWith('live.') ||
    domain === 'msn.com'
  ) {
    return { provider: 'outlook', providerName: 'Outlook', isWebmail: true, isGmail: false };
  }

  // 4. Yahoo & Ymail
  if (domain.startsWith('yahoo.') || domain === 'ymail.com' || domain.startsWith('rocketmail.')) {
    return { provider: 'yahoo', providerName: 'Yahoo', isWebmail: true, isGmail: false };
  }

  // 5. Other established consumer webmail services
  if (
    domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com' ||
    domain === 'aol.com' || domain.startsWith('proton.') || domain === 'protonmail.com' ||
    domain === 'zoho.com' || domain === 'gmx.com' || domain === 'mail.com'
  ) {
    return { provider: 'webmail', providerName: 'Webmail', isWebmail: true, isGmail: false };
  }

  return { provider: 'corporate', providerName: 'Custom Domain', isWebmail: false, isGmail: false };
}

/**
 * Determines whether an email belongs to a recognized webmail or Gmail service
 * (Gmail, Outlook, Yahoo, Hotmail, Live, iCloud, Proton, etc.)
 */
export function isWebmailOrGmail(email: string): boolean {
  return classifyEmailProvider(email).isWebmail;
}
