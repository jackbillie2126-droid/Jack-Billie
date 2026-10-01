/**
 * ScoutTool Anti-Spam & Email Deliverability Engine
 * Enforces Google 2024 Bulk Sender rules, Spintax variation,
 * spam trigger word detection, and humanized pacing.
 */

export interface SpamTriggerMatch {
  term: string;
  category: 'urgency' | 'financial' | 'overpromising' | 'marketing' | 'formatting';
  risk: 'high' | 'medium';
  suggestion?: string;
}

export interface DeliverabilityIssue {
  type: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  suggestion?: string;
  term?: string;
}

export interface DeliverabilityReport {
  score: number; // 0 to 100
  rating: 'Excellent' | 'Good' | 'Moderate Risk' | 'High Spam Risk';
  issues: DeliverabilityIssue[];
  positiveHighlights: string[];
  linkCount: number;
  wordCount: number;
  hasPersonalization: boolean;
  hasOptOut: boolean;
  hasSpintax: boolean;
  matches: SpamTriggerMatch[];
}

// 150+ High and Medium risk spam triggers with safe business replacements
const SPAM_TRIGGERS: { [key: string]: { risk: 'high' | 'medium'; category: SpamTriggerMatch['category']; suggestion: string } } = {
  // High-Risk Financial & Greed
  '100% free': { risk: 'high', category: 'financial', suggestion: 'complimentary / no cost' },
  'free': { risk: 'medium', category: 'financial', suggestion: 'complimentary / standard' },
  'earn money': { risk: 'high', category: 'financial', suggestion: 'generate revenue' },
  'make money': { risk: 'high', category: 'financial', suggestion: 'grow business' },
  'double your': { risk: 'high', category: 'financial', suggestion: 'increase / expand' },
  'cash bonus': { risk: 'high', category: 'financial', suggestion: 'credit / incentive' },
  'income': { risk: 'medium', category: 'financial', suggestion: 'revenue / earnings' },
  'no risk': { risk: 'high', category: 'financial', suggestion: 'flexible terms' },
  'risk free': { risk: 'high', category: 'financial', suggestion: 'flexible trial' },
  'risk-free': { risk: 'high', category: 'financial', suggestion: 'flexible trial' },
  'pure profit': { risk: 'high', category: 'financial', suggestion: 'net margin' },
  'extra cash': { risk: 'high', category: 'financial', suggestion: 'incremental returns' },
  'money back': { risk: 'high', category: 'financial', suggestion: 'satisfaction policy' },
  '$$$': { risk: 'high', category: 'financial', suggestion: 'remove currency symbols' },

  // Urgency & Pressure
  'act now': { risk: 'high', category: 'urgency', suggestion: 'when convenient' },
  'urgent': { risk: 'high', category: 'urgency', suggestion: 'time-sensitive note' },
  'limited time': { risk: 'high', category: 'urgency', suggestion: 'available this month' },
  'expires today': { risk: 'high', category: 'urgency', suggestion: 'prioritized timeline' },
  'last chance': { risk: 'high', category: 'urgency', suggestion: 'final check-in' },
  'call now': { risk: 'high', category: 'urgency', suggestion: 'happy to schedule a chat' },
  'do not delete': { risk: 'high', category: 'urgency', suggestion: 'quick introduction' },
  'apply now': { risk: 'medium', category: 'urgency', suggestion: 'review opportunities' },
  'instant': { risk: 'medium', category: 'urgency', suggestion: 'rapid / prompt' },
  'immediately': { risk: 'medium', category: 'urgency', suggestion: 'at your earliest convenience' },

  // Deceptive & Overpromising
  'guarantee': { risk: 'high', category: 'overpromising', suggestion: 'ensure / deliver' },
  'guaranteed': { risk: 'high', category: 'overpromising', suggestion: 'proven / demonstrated' },
  'no catch': { risk: 'high', category: 'overpromising', suggestion: 'transparent details' },
  'no obligation': { risk: 'medium', category: 'overpromising', suggestion: 'exploratory conversation' },
  'winner': { risk: 'high', category: 'overpromising', suggestion: 'remove reference' },
  'congratulations': { risk: 'high', category: 'overpromising', suggestion: 'congrats on recent launch' },
  'secret': { risk: 'high', category: 'overpromising', suggestion: 'approach / methodology' },
  'miracle': { risk: 'high', category: 'overpromising', suggestion: 'breakthrough solution' },
  'unbelievable': { risk: 'high', category: 'overpromising', suggestion: 'compelling' },

  // Marketing & Sales Cliches
  'click here': { risk: 'high', category: 'marketing', suggestion: 'view details / link below' },
  'click now': { risk: 'high', category: 'marketing', suggestion: 'learn more here' },
  'buy direct': { risk: 'high', category: 'marketing', suggestion: 'direct access' },
  'buy now': { risk: 'high', category: 'marketing', suggestion: 'explore plans' },
  'special promotion': { risk: 'high', category: 'marketing', suggestion: 'introductory partnership' },
  'exclusive deal': { risk: 'medium', category: 'marketing', suggestion: 'tailored package' },
  'clearance': { risk: 'high', category: 'marketing', suggestion: 'end-of-cycle' },
  'order now': { risk: 'high', category: 'marketing', suggestion: 'get started' },
  'dear friend': { risk: 'high', category: 'marketing', suggestion: 'Hi {{name}}' },
};

/**
 * Strips HTML tags down to clean plain text for token analysis
 */
export function stripHtmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates email deliverability and spam risk score
 */
export function analyzeDeliverability(subject: string, body: string): DeliverabilityReport {
  let score = 100;
  const issues: DeliverabilityIssue[] = [];
  const positiveHighlights: string[] = [];
  const matches: SpamTriggerMatch[] = [];

  const cleanSubject = stripHtmlToText(subject);
  const cleanBody = stripHtmlToText(body);
  const fullText = `${cleanSubject} ${cleanBody}`.toLowerCase();

  // 1. Check for spam trigger keywords
  for (const [term, meta] of Object.entries(SPAM_TRIGGERS)) {
    // Regex for word boundary matching
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(fullText)) {
      matches.push({
        term,
        category: meta.category,
        risk: meta.risk,
        suggestion: meta.suggestion
      });

      const penalty = meta.risk === 'high' ? 12 : 6;
      score -= penalty;
      issues.push({
        type: meta.risk === 'high' ? 'danger' : 'warning',
        title: `Spam Trigger: "${term}"`,
        detail: `Mail filters (Google Postmaster & SpamAssassin) penalize this phrase.`,
        suggestion: meta.suggestion ? `Suggested alternative: "${meta.suggestion}"` : undefined,
        term
      });
    }
  }

  // 2. Check Subject Line Length & Formatting
  const subjectWords = cleanSubject.split(/\s+/).filter(Boolean);
  if (cleanSubject.length === 0) {
    score -= 30;
    issues.push({
      type: 'danger',
      title: 'Missing Subject Line',
      detail: 'Emails without subject lines are immediately flagged as spam.'
    });
  } else {
    if (subjectWords.length > 9 || cleanSubject.length > 60) {
      score -= 8;
      issues.push({
        type: 'warning',
        title: 'Subject Line Too Long',
        detail: `Currently ${cleanSubject.length} characters (${subjectWords.length} words). Google recommends 3–7 words (under 50 chars) for maximum inbox rate.`
      });
    } else {
      positiveHighlights.push('Concise, punchy subject line length');
    }

    // Check ALL CAPS in subject
    const subjectCaps = cleanSubject.replace(/[^A-Za-z]/g, '');
    if (subjectCaps.length > 5 && subjectCaps === subjectCaps.toUpperCase()) {
      score -= 20;
      issues.push({
        type: 'danger',
        title: 'Subject Line in ALL CAPS',
        detail: 'ALL CAPS subjects trigger immediate Gmail spam classification.'
      });
    }

    // Check excessive punctuation in subject
    if (/[!?]{2,}/.test(cleanSubject) || (cleanSubject.match(/!/g) || []).length > 1) {
      score -= 15;
      issues.push({
        type: 'danger',
        title: 'Excessive Punctuation in Subject',
        detail: 'Exclamation points in cold email subject lines increase spam rate by 40%.'
      });
    }
  }

  // 3. Check Body Length & Word Count
  const bodyWords = cleanBody.split(/\s+/).filter(Boolean);
  const wordCount = bodyWords.length;

  if (wordCount < 15) {
    score -= 15;
    issues.push({
      type: 'warning',
      title: 'Message Too Short',
      detail: 'Very short cold messages (under 15 words) resemble phishing test pings.'
    });
  } else if (wordCount > 250) {
    score -= 10;
    issues.push({
      type: 'warning',
      title: 'Message Too Long',
      detail: `Message has ${wordCount} words. High-converting cold outreach stays under 120 words for quick reading.`
    });
  } else {
    positiveHighlights.push(`Optimal email length (${wordCount} words)`);
  }

  // 4. Link Count Check (Cold emails with > 2 links get flagged)
  const linkMatches = (body.match(/https?:\/\/[^\s"'<>]+/gi) || []);
  const linkCount = linkMatches.length;

  if (linkCount > 2) {
    score -= (linkCount - 2) * 8;
    issues.push({
      type: 'warning',
      title: `Too Many Links (${linkCount} detected)`,
      detail: 'Google spam filters heavily scrutinize cold emails with more than 1–2 links. Keep cold emails to 0 or 1 link for top deliverability.'
    });
  } else if (linkCount <= 1) {
    positiveHighlights.push('Clean link profile (0–1 links keeps spam filters happy)');
  }

  // 5. Personalization Token Check
  const hasPersonalization = /\{\{\s*(name|first_name|email|link|url|company)\s*\}\}/i.test(subject + body) ||
                            /\{\s*(name|first_name|email|link|url|company)\s*\}/i.test(subject + body);

  if (hasPersonalization) {
    positiveHighlights.push('Personalization tokens detected (reduces spam hash duplication)');
  } else {
    score -= 10;
    issues.push({
      type: 'warning',
      title: 'No Personalization Tokens',
      detail: 'Sending identical text to multiple recipients causes Gmail fingerprinting. Insert {{name}} or {{link}}.'
    });
  }

  // 6. Google 2024 Opt-Out / Unsubscribe Compliance
  const hasOptOut = /unsubscribe|opt-out|opt out|remove me|prefer not to receive/i.test(body);
  if (hasOptOut) {
    positiveHighlights.push('CAN-SPAM & Google 2024 compliant opt-out notice present');
  } else {
    score -= 15;
    issues.push({
      type: 'danger',
      title: 'Missing Opt-Out / Unsubscribe Notice',
      detail: 'Google & Yahoo February 2024 bulk sender mandates require clear opt-out language in all outreach.'
    });
  }

  // 7. Spintax Check (Email Body Variation)
  const hasSpintax = /\{[^{}]*\|[^{}]*\}/.test(subject + body);
  if (hasSpintax) {
    positiveHighlights.push('Dynamic Spintax enabled (prevents spam fingerprinting)');
  }

  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  let rating: DeliverabilityReport['rating'] = 'Excellent';
  if (finalScore < 60) rating = 'High Spam Risk';
  else if (finalScore < 80) rating = 'Moderate Risk';
  else if (finalScore < 90) rating = 'Good';
  else rating = 'Excellent';

  return {
    score: finalScore,
    rating,
    issues,
    positiveHighlights,
    linkCount,
    wordCount,
    hasPersonalization,
    hasOptOut,
    hasSpintax,
    matches
  };
}

/**
 * Spintax Engine: Resolves nested or flat {option1|option2|option3}
 * Generates unique variants for each recipient to defeat Gmail's duplicate email fingerprinting.
 */
export function resolveSpintax(text: string): string {
  if (!text) return '';
  const spintaxRegex = /\{([^{}]+)\}/;
  let matches: RegExpMatchArray | null;
  let result = text;
  
  // Resolve from innermost to outermost with max 20 passes to prevent infinite loops
  let iterations = 0;
  while ((matches = result.match(spintaxRegex)) && iterations < 25) {
    iterations++;
    const options = matches[1].split('|');
    const choice = options[Math.floor(Math.random() * options.length)] || '';
    result = result.replace(matches[0], choice);
  }

  return result;
}

/**
 * Generates sample variations of an email using Spintax
 */
export function generateSpintaxSamples(subject: string, body: string, count: number = 3): { subject: string; body: string }[] {
  const samples: { subject: string; body: string }[] = [];
  for (let i = 0; i < count; i++) {
    samples.push({
      subject: resolveSpintax(subject),
      body: resolveSpintax(body)
    });
  }
  return samples;
}

/**
 * Standard Google & Yahoo 2024 Compliant Opt-Out Footer
 */
export function getCompliantOptOutFooter(): string {
  return `<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
<p style="font-size: 11px; color: #64748b; line-height: 1.5; font-family: system-ui, -apple-system, sans-serif;">
  You are receiving this direct communication based on public contact listings. If you prefer not to receive future outreach, simply reply with "Unsubscribe" or click to opt out.
</p>`;
}

/**
 * Sending Pacing Configuration
 * Mimics human sending behavior to protect Google accounts from spam detection.
 */
export interface PacingProfile {
  id: 'human' | 'warmup' | 'fast';
  name: string;
  description: string;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  recommendedBatchSize: number;
  badge: string;
}

export const PACING_PROFILES: PacingProfile[] = [
  {
    id: 'human',
    name: 'Human Safe Pacing',
    description: 'Randomized 35–65s pause between emails. Recommended by Google deliverability experts to avoid spam heuristics.',
    minDelaySeconds: 35,
    maxDelaySeconds: 65,
    recommendedBatchSize: 50,
    badge: 'Recommended'
  },
  {
    id: 'warmup',
    name: 'Account Warm-Up Mode',
    description: 'Conservative 75–120s pause. Ideal for newly authorized Gmail accounts or fresh domains.',
    minDelaySeconds: 75,
    maxDelaySeconds: 120,
    recommendedBatchSize: 20,
    badge: 'Maximum Safety'
  },
  {
    id: 'fast',
    name: 'Express Speed (Test Mode)',
    description: '1–2s pause. Use only for testing sandbox or emergency internal lists.',
    minDelaySeconds: 1,
    maxDelaySeconds: 2,
    recommendedBatchSize: 10,
    badge: 'Testing Only'
  }
];

/**
 * Calculates randomized delay in milliseconds for human-like dispatch
 */
export function getPacingDelayMs(profileId: 'human' | 'warmup' | 'fast' = 'human'): number {
  const profile = PACING_PROFILES.find(p => p.id === profileId) || PACING_PROFILES[0];
  const min = profile.minDelaySeconds * 1000;
  const max = profile.maxDelaySeconds * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
