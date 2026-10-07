import React from 'react';
import { 
  Send, Trash2, Mail, AlertTriangle, Check, ExternalLink, 
  Upload, CheckCircle2, Plus, Eye, Sparkles, Clock, 
  HelpCircle, ArrowRight, UserPlus
} from 'lucide-react';
import { Recipient } from '../types.js';
import { createCampaign } from '../lib/api.ts';
import { validateEmailQuality, EmailValidationResult } from '../lib/emailFilter.ts';
import { 
  analyzeDeliverability, 
  generateSpintaxSamples, 
  getCompliantOptOutFooter 
} from '../lib/antiSpam.ts';

export interface CampaignPreset {
  id: string;
  name: string;
  subject: string;
  body: string;
}

const TEMPLATES: CampaignPreset[] = [
  {
    id: 'partnership',
    name: 'Quick Partnership Note',
    subject: 'Question regarding {{link}}',
    body: `<p>Hi {{name}},</p>
<p>I came across your work at {{link}} and wanted to reach out. I really liked what you and the team are building.</p>
<p>We work with teams in your space to help streamline workflows and connect with more customers. Would you be open to a quick 5-minute chat next week?</p>
<p>Best regards,<br/><strong>Team</strong></p>`
  },
  {
    id: 'feedback',
    name: 'Helpful Feedback',
    subject: 'Quick question about {{link}}',
    body: `<p>Hi {{name}},</p>
<p>I was exploring {{link}} earlier today and put together two quick suggestions that might help improve user signups.</p>
<p>Would it be helpful if I sent those over for you to take a look?</p>
<p>Warm regards,<br/><strong>Outreach Team</strong></p>`
  },
  {
    id: 'connect',
    name: 'Simple Introduction',
    subject: 'Quick question for {{name}}',
    body: `<p>Hi {{name}},</p>
<p>I noticed your site {{link}} and wanted to say hello directly.</p>
<p>Are you currently looking for ways to reach more qualified leads this month? Happy to share some quick ideas that worked well for similar teams.</p>
<p>Sincerely,<br/><strong>Growth Team</strong></p>`
  }
];

interface NewCampaignProps {
  onCampaignCreated: (campaign: any) => void;
  userEmail: string;
  initialRecipients?: { email: string; link?: string; name?: string }[];
}

function formatUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function parseRecipients(input: string): { 
  email: string; 
  name: string; 
  link?: string; 
  error?: string; 
  validation: EmailValidationResult 
}[] {
  const lines = input.split(/\r?\n/);
  const results: { 
    email: string; 
    name: string; 
    link?: string; 
    error?: string; 
    validation: EmailValidationResult 
  }[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    let email = '';
    let name = '';
    let link = '';

    const rfcMatch = line.match(/^([^<]+)<([^>]+)>(.*)$/);
    if (rfcMatch) {
      name = rfcMatch[1].trim().replace(/^["']|["']$/g, '');
      email = rfcMatch[2].trim();
      const rest = rfcMatch[3].replace(/^[\s,]+/, '').trim();
      if (rest) link = rest.replace(/^["']|["']$/g, '');
      const val = validateEmailQuality(email);
      results.push({
        email: val.isValid ? val.email : email,
        name,
        link: formatUrl(link),
        error: val.isValid ? undefined : val.reason,
        validation: val
      });
      continue;
    }

    if (line.includes(',') || line.includes('\t')) {
      const parts = line.split(/,|\t/).map(p => p.trim()).filter(Boolean);
      let foundEmail = '';
      let foundLink = '';
      let foundName = '';

      for (const part of parts) {
        const valTest = validateEmailQuality(part);
        if (!foundEmail && (valTest.isValid || (part.includes('@') && !part.startsWith('http')))) {
          foundEmail = part;
        } else if (!foundLink && (part.startsWith('http') || part.includes('.'))) {
          foundLink = part;
        } else {
          foundName = foundName ? `${foundName} ${part}` : part;
        }
      }

      if (foundEmail) {
        const val = validateEmailQuality(foundEmail);
        results.push({
          email: val.isValid ? val.email : foundEmail,
          name: foundName.replace(/^["']|["']$/g, ''),
          link: formatUrl(foundLink),
          error: val.isValid ? undefined : val.reason,
          validation: val
        });
      }
      continue;
    }

    const val = validateEmailQuality(line);
    results.push({
      email: val.isValid ? val.email : line,
      name: '',
      link: '',
      error: val.isValid ? undefined : val.reason,
      validation: val
    });
  }

  return results;
}

export default function NewCampaign({ onCampaignCreated, userEmail, initialRecipients }: NewCampaignProps) {
  const [title, setTitle] = React.useState(() => {
    if (initialRecipients && initialRecipients.length > 0) {
      return `Email Outreach (${initialRecipients.length} contacts)`;
    }
    return 'New Outreach Campaign';
  });

  const [subject, setSubject] = React.useState(TEMPLATES[0].subject);
  const [body, setBody] = React.useState(TEMPLATES[0].body);
  const [inputMode, setInputMode] = React.useState<'table' | 'paste' | 'csv'>('table');
  const [previewTab, setPreviewTab] = React.useState<'write' | 'preview'>('write');

  // Human pacing: 'human' = safe 35-60s pause, 'fast' = test mode
  const [pacing, setPacing] = React.useState<'human' | 'fast'>('human');
  const [includeUnsubscribe, setIncludeUnsubscribe] = React.useState(true);

  // Recipient table starts empty by default
  const [rows, setRows] = React.useState<{ email: string; link: string; name: string }[]>(() => {
    if (initialRecipients && initialRecipients.length > 0) {
      return initialRecipients.map(r => ({
        email: r.email || '',
        link: r.link || '',
        name: r.name || ''
      }));
    }
    return [];
  });

  const [rawText, setRawText] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Sync if initialRecipients changes
  React.useEffect(() => {
    if (initialRecipients && initialRecipients.length > 0) {
      setTitle(`Email Outreach (${initialRecipients.length} contacts)`);
      setRows(initialRecipients.map(r => ({
        email: r.email || '',
        link: r.link || '',
        name: r.name || ''
      })));
    }
  }, [initialRecipients]);

  // Real-time deliverability & spam check
  const spamReport = React.useMemo(() => {
    return analyzeDeliverability(subject, body);
  }, [subject, body]);

  const handleRowChange = (index: number, field: 'email' | 'link' | 'name', value: string) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  const handleAddRow = () => {
    setRows(prev => [...prev, { email: '', link: '', name: '' }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAllRows = () => {
    setRows([]);
    setRawText('');
  };

  // Real-time parsed list
  const parsedRecipients = React.useMemo(() => {
    if (inputMode === 'paste') {
      return parseRecipients(rawText);
    }
    return rows
      .filter(r => r.email.trim() || r.link.trim() || r.name.trim())
      .map(r => {
        const val = validateEmailQuality(r.email.trim());
        return {
          email: val.isValid ? val.email : r.email.trim(),
          name: r.name.trim(),
          link: formatUrl(r.link.trim()),
          error: val.isValid ? undefined : (r.email.trim() ? val.reason : 'Enter email'),
          validation: val
        };
      });
  }, [inputMode, rawText, rows]);

  const validList = React.useMemo(() => {
    const list = parsedRecipients.filter(item => !item.error && item.email && item.validation?.isValid);
    const seen = new Set<string>();
    return list.filter(item => {
      const lower = item.email.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
  }, [parsedRecipients]);

  const invalidList = React.useMemo(() => {
    return parsedRecipients.filter(item => item.error || !item.validation?.isValid);
  }, [parsedRecipients]);

  const handleRemoveInvalid = () => {
    const clean = validList.map(r => ({
      email: r.email,
      link: r.link || '',
      name: r.name || ''
    }));
    setRows(clean);
    if (inputMode === 'paste') {
      setRawText(clean.map(r => `${r.email}, ${r.link}`).join('\n'));
    }
  };

  const handleCsvUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const parsed = parseRecipients(text);
        if (parsed.length > 0) {
          setRows(parsed.map(p => ({
            email: p.email || '',
            link: p.link || '',
            name: p.name || ''
          })));
          setInputMode('table');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleInsertTag = (tag: string) => {
    setBody(prev => `${prev} ${tag}`);
  };

  // Replace spam trigger with natural alternative
  const handleFixSpamWord = (term: string, suggestion?: string) => {
    if (!suggestion) return;
    const replacement = suggestion.split('/')[0].trim();
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    setSubject(prev => prev.replace(regex, replacement));
    setBody(prev => prev.replace(regex, replacement));
  };

  // Friendly greeting variation: "Hi / Hello / Hey"
  const handleToggleGreetingVariation = () => {
    if (body.includes('{Hi|Hello|Hey}')) {
      setBody(prev => prev.replace('{Hi|Hello|Hey}', 'Hi'));
    } else if (body.includes('Hi {{name}}') || body.includes('Hi there')) {
      setBody(prev => prev.replace(/Hi\s+(\{\{name\}\}|there)/i, '{Hi|Hello|Hey} $1'));
    } else {
      setBody(prev => `<p>{Hi|Hello|Hey} {{name}},</p>\n` + prev);
    }
  };

  const hasGreetingVariation = body.includes('{Hi|Hello|Hey}');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage('Please give your campaign a name.');
      return;
    }
    if (!subject.trim()) {
      setErrorMessage('Please enter an email subject line.');
      return;
    }
    if (!body.trim()) {
      setErrorMessage('Please write your email message.');
      return;
    }
    if (validList.length === 0) {
      setErrorMessage('Please add at least one recipient email address.');
      return;
    }

    let finalBody = body;
    if (includeUnsubscribe) {
      finalBody += `\n` + getCompliantOptOutFooter();
    }

    setIsSubmitting(true);
    try {
      const campaign = await createCampaign(
        title.trim(),
        subject.trim(),
        finalBody,
        validList,
        pacing,
        spamReport.score
      );
      onCampaignCreated(campaign);
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not start campaign.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewPerson = validList[0] || {
    name: 'Alex Rivera',
    email: 'alex@example.com',
    link: 'https://example.com'
  };

  const renderEmailPreview = () => {
    let text = body
      .replace(/\{\{\s*name\s*\}\}/gi, previewPerson.name || 'there')
      .replace(/\{\{\s*email\s*\}\}/gi, previewPerson.email)
      .replace(/\{\{\s*(link|url)\s*\}\}/gi, previewPerson.link || 'https://example.com');

    // Show first option for preview
    text = text.replace(/\{([^{}]+)\}/g, (_, opts) => opts.split('|')[0]);

    if (includeUnsubscribe) {
      text += getCompliantOptOutFooter();
    }
    return text;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-6xl mx-auto">
      {/* Friendly Top Bar */}
      <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">
            Campaign Name
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Outreach to Agency Founders"
            className="text-lg font-semibold text-neutral-900 dark:text-white bg-transparent border-none outline-hidden p-0 w-full placeholder:text-neutral-400 focus:ring-0"
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="submit"
            disabled={isSubmitting || validList.length === 0}
            className="py-2.5 px-5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" />
            <span>
              {isSubmitting ? 'Saving...' : validList.length > 0 ? `Send to ${validList.length} ${validList.length === 1 ? 'person' : 'people'}` : 'Add recipients to send'}
            </span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Two Column Layout: Recipients on Left, Email Composer on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Who are you sending to? (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Send List
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {validList.length} {validList.length === 1 ? 'person ready' : 'people on this list'}
                </p>
              </div>

              {/* View switch */}
              <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setInputMode('table')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    inputMode === 'table'
                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-medium shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('paste')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    inputMode === 'paste'
                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-medium shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  Paste text
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer flex items-center gap-1"
                >
                  <Upload className="h-3 w-3" />
                  <span>CSV</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleCsvUpload(f);
                  }}
                />
              </div>
            </div>

            {/* Quick Actions (Clear all, Remove invalid) */}
            {(rows.length > 0 || rawText.length > 0) && (
              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-800 dark:text-neutral-200 font-medium">
                    {validList.length} ready to send
                  </span>
                  {invalidList.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-rose-600 dark:text-rose-400">
                        {invalidList.length} invalid email{invalidList.length === 1 ? '' : 's'}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {invalidList.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRemoveInvalid}
                      className="text-rose-600 hover:underline cursor-pointer"
                    >
                      Remove invalid
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClearAllRows}
                    className="text-neutral-500 hover:text-rose-600 cursor-pointer"
                  >
                    Clear list
                  </button>
                </div>
              </div>
            )}

            {/* List Mode */}
            {inputMode === 'table' ? (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {rows.length === 0 ? (
                  <div className="text-center py-10 px-4 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl space-y-3">
                    <Mail className="h-8 w-8 mx-auto text-neutral-300 dark:text-neutral-700" />
                    <div>
                      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                        Your send list is empty
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        Add a person or paste emails to get started.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddRow}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add person</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 px-1">
                      <span className="flex-1">Email address</span>
                      <span className="w-24">First name</span>
                      <span className="w-28">Website / link</span>
                      <span className="w-6"></span>
                    </div>

                    {rows.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="email"
                          placeholder="e.g. sarah@company.com"
                          value={row.email}
                          onChange={e => handleRowChange(idx, 'email', e.target.value)}
                          className="flex-1 bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 focus:border-neutral-400 text-xs px-3 py-2 rounded-lg text-neutral-900 dark:text-neutral-100 outline-hidden"
                        />
                        <input
                          type="text"
                          placeholder="Sarah"
                          value={row.name}
                          onChange={e => handleRowChange(idx, 'name', e.target.value)}
                          className="w-24 bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 focus:border-neutral-400 text-xs px-2.5 py-2 rounded-lg text-neutral-800 dark:text-neutral-200 outline-hidden"
                        />
                        <input
                          type="text"
                          placeholder="company.com"
                          value={row.link}
                          onChange={e => handleRowChange(idx, 'link', e.target.value)}
                          className="w-28 bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 focus:border-neutral-400 text-xs px-2.5 py-2 rounded-lg text-neutral-600 dark:text-neutral-400 outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 cursor-pointer transition-colors"
                          title="Remove person"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={handleAddRow}
                      className="w-full py-2 border border-dashed border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-600 dark:text-neutral-400 text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-medium"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add another person</span>
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* Paste mode */
              <div className="space-y-2">
                <textarea
                  rows={9}
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder="Paste emails here (one per line, or separated by commas):&#10;sarah@company.com, Sarah, https://company.com&#10;david@startup.io, David"
                  className="w-full bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 focus:border-neutral-400 text-xs p-3 rounded-lg outline-hidden text-neutral-900 dark:text-neutral-100"
                />
                <p className="text-[11px] text-neutral-500">
                  Tip: You can paste a list copied from Excel, Google Sheets, or a text file.
                </p>
              </div>
            )}
          </div>

          {/* Clean Delivery Timing Setting */}
          <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-neutral-600" />
              <span>Sending timing</span>
            </h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Spacing out emails ensures they land safely in the inbox instead of spam.
            </p>

            <div className="space-y-2 pt-1">
              <label
                onClick={() => setPacing('human')}
                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  pacing === 'human'
                    ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-900/60'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <input
                  type="radio"
                  name="send_pace"
                  checked={pacing === 'human'}
                  onChange={() => setPacing('human')}
                  className="mt-0.5 text-neutral-900"
                />
                <div className="space-y-0.5 text-xs">
                  <div className="font-semibold text-neutral-900 dark:text-white">
                    Natural pace (Recommended)
                  </div>
                  <div className="text-neutral-500 dark:text-neutral-400 text-[11px]">
                    Waits ~40 seconds between each email. Best for high delivery rates.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setPacing('fast')}
                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  pacing === 'fast'
                    ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-900/60'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <input
                  type="radio"
                  name="send_pace"
                  checked={pacing === 'fast'}
                  onChange={() => setPacing('fast')}
                  className="mt-0.5 text-neutral-900"
                />
                <div className="space-y-0.5 text-xs">
                  <div className="font-semibold text-neutral-900 dark:text-white">
                    Send right away
                  </div>
                  <div className="text-neutral-500 dark:text-neutral-400 text-[11px]">
                    Sends immediately without delays. Great for 1 or 2 test emails.
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Email Composer (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Email Message
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Write the message that each person will receive
                </p>
              </div>

              {/* Write vs Preview */}
              <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewTab('write')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    previewTab === 'write'
                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-medium shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('preview')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    previewTab === 'preview'
                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-medium shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Eye className="h-3 w-3" />
                  <span>Preview</span>
                </button>
              </div>
            </div>

            {/* Starter Templates */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <span className="text-neutral-400 text-xs shrink-0">Example templates:</span>
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSubject(t.subject);
                    setBody(t.body);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors shrink-0 cursor-pointer text-xs"
                >
                  {t.name}
                </button>
              ))}
            </div>

            {previewTab === 'write' ? (
              <div className="space-y-4">
                {/* Subject Line */}
                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. Quick question about {{link}}"
                    className="w-full bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 focus:border-neutral-400 rounded-lg text-xs font-medium px-3.5 py-2 text-neutral-900 dark:text-white outline-hidden"
                  />
                </div>

                {/* Personalize helper tools */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-500 pt-0.5">
                  <span className="text-xs">Insert personalization:</span>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{{name}}')}
                    className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs cursor-pointer font-medium"
                    title="Inserts the recipient's first name"
                  >
                    + First name
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertTag('{{link}}')}
                    className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs cursor-pointer font-medium"
                    title="Inserts the recipient's company website"
                  >
                    + Website
                  </button>

                  <span className="text-neutral-300 dark:text-neutral-700">·</span>

                  <button
                    type="button"
                    onClick={handleToggleGreetingVariation}
                    className={`px-2.5 py-0.5 rounded text-xs transition-colors flex items-center gap-1 cursor-pointer ${
                      hasGreetingVariation
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                        : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-neutral-700 dark:text-neutral-300'
                    }`}
                    title="Alternates between Hi, Hello, and Hey so every email does not start with the exact same word"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>{hasGreetingVariation ? 'Hi/Hello/Hey active' : 'Vary greetings'}</span>
                  </button>
                </div>

                {/* Message Body */}
                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                    Email Body
                  </label>
                  <textarea
                    rows={8}
                    required
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 focus:border-neutral-400 rounded-lg text-xs p-3 leading-relaxed text-neutral-900 dark:text-neutral-100 outline-hidden resize-y font-sans"
                  />
                </div>

                {/* Friendly Spam Check / Deliverability Note */}
                <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                      {spamReport.matches.length === 0 ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span>Spam check: Looks great and natural</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <span>Spam check: {spamReport.matches.length} word might get flagged</span>
                        </>
                      )}
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      {subject.split(/\s+/).filter(Boolean).length} words in subject
                    </span>
                  </div>

                  {spamReport.matches.length > 0 && (
                    <div className="text-[11px] text-neutral-600 dark:text-neutral-400 flex items-center gap-2 flex-wrap pt-0.5">
                      <span>Suggestions:</span>
                      {spamReport.matches.map((m, idx) => (
                        <div key={idx} className="inline-flex items-center gap-1 bg-white dark:bg-neutral-900 px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700">
                          <span className="text-rose-600 line-through">"{m.term}"</span>
                          {m.suggestion && (
                            <button
                              type="button"
                              onClick={() => handleFixSpamWord(m.term, m.suggestion)}
                              className="text-blue-600 hover:underline font-medium cursor-pointer"
                            >
                              use "{m.suggestion.split('/')[0].trim()}"
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unsubscribe Option */}
                <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 pt-1">
                  <input
                    type="checkbox"
                    id="unsub_opt"
                    checked={includeUnsubscribe}
                    onChange={e => setIncludeUnsubscribe(e.target.checked)}
                    className="rounded border-neutral-300 text-neutral-900 cursor-pointer"
                  />
                  <label htmlFor="unsub_opt" className="cursor-pointer">
                    Include a friendly unsubscribe sentence at the bottom
                  </label>
                </div>
              </div>
            ) : (
              /* Friendly Preview Screen */
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden bg-white dark:bg-neutral-900">
                <div className="p-3 bg-neutral-50 dark:bg-neutral-950/60 border-b border-neutral-200 dark:border-neutral-800 text-xs space-y-1">
                  <div className="flex items-center gap-2 text-neutral-500">
                    <span className="w-12 text-neutral-400">From:</span>
                    <span className="text-neutral-800 dark:text-neutral-200 font-mono text-[11px]">{userEmail}</span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-500">
                    <span className="w-12 text-neutral-400">To:</span>
                    <span className="text-blue-600 dark:text-blue-400">
                      {previewPerson.name ? `"${previewPerson.name}" ` : ''}&lt;{previewPerson.email}&gt;
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-500 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60">
                    <span className="w-12 text-neutral-400 font-semibold">Subject:</span>
                    <span className="text-neutral-900 dark:text-white font-medium">
                      {subject.replace(/\{\{\s*link\s*\}\}/gi, previewPerson.link || 'your website')}
                    </span>
                  </div>
                </div>

                <div 
                  className="p-5 text-xs text-neutral-800 dark:text-neutral-200 leading-relaxed min-h-[220px]"
                  dangerouslySetInnerHTML={{ __html: renderEmailPreview() }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
