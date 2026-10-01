import React from 'react';
import { 
  User, 
  googleSignIn, 
  signInSandbox, 
  logout, 
  requestGmailSendScope,
  getAppPasswordSender,
  saveAppPasswordSender,
  removeAppPasswordSender,
  AppPasswordSenderConfig
} from '../lib/firebase.js';
import { 
  X, Check, Shield, AlertTriangle, ExternalLink, Mail, 
  Terminal, Sparkles, LogOut, ArrowRight, Loader2, CheckCircle2, 
  Info, Key, HelpCircle, Lock
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onAuthSuccess: (user: User, token: string) => void;
  onLogoutSuccess: () => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
  onLogoutSuccess
}: AuthModalProps) {
  const [activeTab, setActiveTab] = React.useState<'oauth' | 'app_password' | 'sandbox'>('oauth');
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);
  const [authError, setAuthError] = React.useState<{ code?: string; message: string; isDomainError?: boolean; isAccessBlocked?: boolean; isPopupBlocked?: boolean } | null>(null);
  const [sandboxEmail, setSandboxEmail] = React.useState('jackbillie.2126@gmail.com');
  const [isIframe, setIsIframe] = React.useState(false);

  // App Password state
  const [appEmail, setAppEmail] = React.useState('');
  const [appPassword, setAppPassword] = React.useState('');
  const [appSenderName, setAppSenderName] = React.useState('');
  const [currentAppConfig, setCurrentAppConfig] = React.useState<AppPasswordSenderConfig | null>(null);
  const [appPasswordSuccess, setAppPasswordSuccess] = React.useState(false);

  // Diagnostic expansion
  const [showAccessBlockedGuide, setShowAccessBlockedGuide] = React.useState(false);

  React.useEffect(() => {
    let iframeDetected = false;
    try {
      iframeDetected = window.self !== window.top;
    } catch {
      iframeDetected = true;
    }
    setIsIframe(iframeDetected);
    
    // Check if App Password configured
    const saved = getAppPasswordSender();
    if (saved) {
      setCurrentAppConfig(saved);
      setAppEmail(saved.email);
      setAppSenderName(saved.senderName || '');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  /**
   * Standard Google Sign-In: Requests standard identity scopes (email, profile).
   * Decoupled from restricted scopes so user NEVER sees "Access Blocked" when entering the app!
   */
  const handleStandardGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn(false);
      if (result) {
        onAuthSuccess(result.user, result.accessToken);
        onClose();
      }
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      const code = err?.code || '';
      const msg = err?.message || 'Authentication failed.';

      const isDomainError = code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain');
      const isPopupBlocked = code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || msg.includes('popup');
      const isAccessBlocked = msg.includes('access_denied') || msg.includes('blocked') || msg.includes('verification');

      let userMsg = msg;
      if (isDomainError) {
        userMsg = `Domain "${currentHost}" is not on your Firebase project's Authorized Domains list.`;
      } else if (isPopupBlocked && isIframe) {
        userMsg = 'Browser blocked popup communication because ScoutTool is currently embedded in an iframe preview.';
      }

      setAuthError({
        code,
        message: userMsg,
        isDomainError,
        isPopupBlocked,
        isAccessBlocked
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Request Gmail Dispatch Scope
   */
  const handleAuthorizeGmailScope = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const res = await requestGmailSendScope();
      if (res.success && res.accessToken) {
        if (currentUser) {
          currentUser.hasGmailSendScope = true;
          onAuthSuccess(currentUser, res.accessToken);
        }
        onClose();
      } else {
        setAuthError({
          message: res.error || 'Failed to authorize Gmail outreach sending.',
          isAccessBlocked: true
        });
        setShowAccessBlockedGuide(true);
      }
    } catch (err: any) {
      setAuthError({
        message: err?.message || 'Failed to authorize Gmail send scope',
        isAccessBlocked: true
      });
      setShowAccessBlockedGuide(true);
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Save Google App Password configuration
   * 100% bypasses Google OAuth verification and never triggers "Access Blocked"!
   */
  const handleSaveAppPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appEmail.includes('@') || !appPassword.trim()) {
      return;
    }

    const cleanPass = appPassword.replace(/\s+/g, '');
    const config: AppPasswordSenderConfig = {
      email: appEmail.trim(),
      appPassword: cleanPass,
      senderName: appSenderName.trim() || appEmail.split('@')[0],
      isActive: true
    };

    saveAppPasswordSender(config);
    setCurrentAppConfig(config);
    setAppPasswordSuccess(true);

    // If no user currently signed in, also create session
    if (!currentUser) {
      const syntheticUser: User = {
        uid: 'apppass_' + Math.random().toString(36).substring(2, 9),
        displayName: config.senderName || config.email.split('@')[0],
        email: config.email,
        photoURL: null,
        hasGmailSendScope: true
      };
      onAuthSuccess(syntheticUser, 'app_pass_session');
    }

    setTimeout(() => {
      setAppPasswordSuccess(false);
      onClose();
    }, 1200);
  };

  const handleRemoveAppPassword = () => {
    removeAppPasswordSender();
    setCurrentAppConfig(null);
    setAppPassword('');
  };

  const handleSandboxConnect = () => {
    const cleanEmail = sandboxEmail.trim() || 'jackbillie.2126@gmail.com';
    const cleanName = cleanEmail.split('@')[0];
    const session = signInSandbox(cleanEmail, cleanName);
    onAuthSuccess(session.user, session.accessToken);
    onClose();
  };

  const handleDisconnect = async () => {
    await logout();
    removeAppPasswordSender();
    onLogoutSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-xl bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800/80">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
              Sender Account &amp; Authorization
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Configure dispatch credentials for email sequences with zero "Access Blocked" roadblocks
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-neutral-100 dark:border-neutral-800 px-6 gap-2 bg-neutral-50/50 dark:bg-neutral-900/30">
          <button
            type="button"
            onClick={() => setActiveTab('oauth')}
            className={`py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'oauth'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Google Sign-In &amp; OAuth
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('app_password')}
            className={`py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'app_password'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Key className="h-3.5 w-3.5 text-amber-500" />
            <span>Gmail App Password (100% Reliable)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sandbox')}
            className={`py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'sandbox'
                ? 'border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Instant Sandbox
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Active User Card if Logged In */}
          {currentUser && (
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/80 dark:border-neutral-800 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                    {currentUser.displayName?.[0] || 'U'}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                      <span>{currentUser.displayName || 'Connected Account'}</span>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                      {currentUser.email}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 font-medium pt-1 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-neutral-200/60 dark:border-neutral-800 text-xs">
                <span className="text-neutral-500">Dispatch Status:</span>
                {currentUser.hasGmailSendScope ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Gmail Dispatch Scope Active
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleAuthorizeGmailScope}
                    disabled={isLoggingIn}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>Click to Authorize Gmail Send Scope</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: Google OAuth */}
          {activeTab === 'oauth' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Google Sign-In (Unrestricted)
                  </span>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    Never Blocked
                  </span>
                </div>

                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  Sign into ScoutTool with standard Google identity scopes. Access your saved campaigns, target lists, and email discovery tools with zero verification barriers.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleStandardGoogleSignIn}
                    disabled={isLoggingIn}
                    className="flex-1 py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.64l3.88 3.01c2.26-2.09 3.66-5.17 3.66-9.09z"/>
                          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.01c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93L1.25 17.4C3.25 21.37 7.34 24 12 24z"/>
                          <path fill="#FBBC05" d="M5.28 14.31c-.25-.72-.38-1.49-.38-2.31s.14-1.59.38-2.31L1.25 6.68C.45 8.28 0 10.08 0 12s.45 3.72 1.25 5.32l4.03-3.01z"/>
                          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.63 1.25 6.68l4.03 3.01c.95-2.83 3.6-4.94 6.72-4.94z"/>
                        </svg>
                        <span>Sign in with Google</span>
                      </>
                    )}
                  </button>

                  {isIframe && (
                    <a
                      href={currentOrigin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2.5 px-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <span>Open Full Tab</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* Access Blocked Troubleshooter Link */}
              <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-neutral-500" />
                  <span className="text-xs text-neutral-700 dark:text-neutral-300">
                    Seeing <strong>"Access Blocked"</strong> on Gmail sending?
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAccessBlockedGuide(!showAccessBlockedGuide)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                >
                  {showAccessBlockedGuide ? 'Hide Guide' : '60-Second Fix'}
                </button>
              </div>

              {showAccessBlockedGuide && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs space-y-3">
                  <div className="font-semibold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span>How to Fix "Access Blocked: ScoutTool has not completed verification"</span>
                  </div>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Google displays "Access blocked" when requesting Gmail send access if your Google Cloud project is in <strong>Testing mode</strong> and your email is not listed as a test user. Here are the 2 ways to resolve it:
                  </p>
                  <div className="space-y-2 text-neutral-800 dark:text-neutral-200">
                    <div className="p-2.5 bg-white dark:bg-neutral-900 rounded-lg border border-amber-200/80 dark:border-amber-900/40 space-y-1">
                      <strong className="block text-neutral-900 dark:text-white">Fix A (Recommended): Add Test User in Google Cloud</strong>
                      <ol className="list-decimal pl-4 space-y-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                        <li>
                          Open <a href="https://console.cloud.google.com/apis/credentials/consent?project=scout-tool-dcb40" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">OAuth Consent Screen (scout-tool-dcb40)</a>.
                        </li>
                        <li>Scroll down to <strong>"Test users"</strong> and click <strong>"+ ADD USERS"</strong>.</li>
                        <li>Add your Gmail address (e.g. <code>jackbillie.2126@gmail.com</code>). Google will immediately allow sending!</li>
                      </ol>
                    </div>

                    <div className="p-2.5 bg-white dark:bg-neutral-900 rounded-lg border border-amber-200/80 dark:border-amber-900/40 space-y-1">
                      <strong className="block text-neutral-900 dark:text-white">Fix B (Instant Alternative): Use a Google App Password</strong>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                        Switch to the <strong>"Gmail App Password"</strong> tab above. App Passwords work forever with zero OAuth consent screen setup, zero verification wait, and zero "Access Blocked" errors.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Google App Password (Zero OAuth verification needed) */}
          {activeTab === 'app_password' && (
            <form onSubmit={handleSaveAppPassword} className="space-y-4">
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Google App Password Sender
                  </span>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                    100% Reliable · Zero OAuth Blocks
                  </span>
                </div>

                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  Generate a dedicated 16-character Google App Password for ScoutTool. It completely bypasses Google Cloud Console restrictions, never expires after 1 hour, and avoids "Access Blocked" errors.
                </p>

                <div className="space-y-3 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                      Your Gmail Address
                    </label>
                    <input
                      type="email"
                      required
                      value={appEmail}
                      onChange={e => setAppEmail(e.target.value)}
                      placeholder="e.g. founder@gmail.com"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-neutral-900 dark:text-white outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                        16-Character Google App Password
                      </label>
                      <a
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        <span>Generate at google.com/apppasswords</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <input
                      type="text"
                      required
                      value={appPassword}
                      onChange={e => setAppPassword(e.target.value)}
                      placeholder="xxxx xxxx xxxx xxxx"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono tracking-wider text-neutral-900 dark:text-white outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                      Sender Display Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={appSenderName}
                      onChange={e => setAppSenderName(e.target.value)}
                      placeholder="e.g. Jack Billie"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white outline-hidden focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  {currentAppConfig && (
                    <button
                      type="button"
                      onClick={handleRemoveAppPassword}
                      className="text-xs text-rose-600 hover:underline font-medium cursor-pointer"
                    >
                      Remove Password
                    </button>
                  )}
                  <button
                    type="submit"
                    className="ml-auto py-2 px-4 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
                  >
                    {appPasswordSuccess ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Saved Successfully!</span>
                      </>
                    ) : (
                      <span>Save App Password Dispatcher</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TAB 3: Instant Sandbox */}
          {activeTab === 'sandbox' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Instant Workspace Mode (No Whitelist Needed)
                  </span>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    Zero Setup
                  </span>
                </div>

                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  Instantly activate an authenticated session to test lead scraping, build Send Lists, configure merge tags, and simulate campaigns without OAuth domain roadblocks.
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={sandboxEmail}
                    onChange={e => setSandboxEmail(e.target.value)}
                    placeholder="your-email@gmail.com"
                    className="flex-1 text-xs px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-neutral-900 dark:text-white outline-hidden focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleSandboxConnect}
                    className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0"
                  >
                    Activate Session
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Diagnostics Box */}
          {authError && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-amber-900 dark:text-amber-100">
                    {authError.isDomainError ? 'Domain Authorization Required' : 'Authentication Notice'}
                  </div>
                  <p className="leading-relaxed">{authError.message}</p>
                </div>
              </div>

              {authError.isDomainError && (
                <div className="p-2.5 bg-white dark:bg-neutral-900 rounded-lg border border-amber-200/80 dark:border-amber-900/50 space-y-1.5 text-[11px] text-neutral-600 dark:text-neutral-300">
                  <span className="font-semibold text-neutral-900 dark:text-white block">
                    How to authorize your current host:
                  </span>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Open <strong>Firebase Console</strong> for project <code>scout-tool-dcb40</code>.</li>
                    <li>Navigate to <strong>Authentication → Settings → Authorized Domains</strong>.</li>
                    <li>Click <strong>Add Domain</strong> and paste: <code className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">{currentHost}</code></li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Quick Technical Architecture Note */}
          <div className="flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500 border-t border-neutral-100 dark:border-neutral-800/80 pt-4">
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-neutral-400" />
              <span>Anti-Spam Paced Dispatch · 2024 Bulk Compliant</span>
            </span>
            <span className="font-mono">scout-tool-dcb40</span>
          </div>
        </div>
      </div>
    </div>
  );
}
