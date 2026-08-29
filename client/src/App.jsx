import React, { useState, useEffect, useRef } from 'react';
import { Mail, FileText, Settings, Sparkles, Send, Plus, Trash2, CheckCircle, XCircle, LogOut, Loader2, ArrowRight, History, Download, Eye, Search, UploadCloud, Globe, Clock, Bookmark, User, UserCheck, Shield, ShieldCheck, AlertCircle, Sun, Moon, TrendingUp, Lock, RefreshCw, Check } from 'lucide-react';

const BACKEND_URL = window.location.port === '5174' || window.location.port === '5173' ? 'http://localhost:5001' : '';

// Helper to make authenticated, per-user sandbox API calls with 30-Day JWT & Cookies
export const apiFetch = (endpoint, options = {}) => {
  let userKey = '';
  let jwtToken = '';
  try {
    const stored = JSON.parse(localStorage.getItem('cold_email_user') || '{}');
    userKey = stored.userKey || '';
    jwtToken = localStorage.getItem('cold_email_jwt') || '';
  } catch (e) {}

  const headers = {
    ...options.headers,
    'x-user-key': userKey,
    ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {})
  };

  return fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Send and receive 30-day JWT cookies
    headers
  });
};

export default function App() {
  const [activeTab, setActiveTab] = useState('single');
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cold_email_user') || 'null');
    } catch (e) {
      return null;
    }
  });
  const [isAuthorized, setIsAuthorized] = useState(() => {
    return !!localStorage.getItem('cold_email_jwt') || !!localStorage.getItem('cold_email_user');
  });
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [toast, setToast] = useState(null);

  // Dark / Light Mode State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('cold_email_theme');
      if (saved) return saved === 'dark';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('cold_email_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('cold_email_theme', 'light');
    }
  }, [isDarkMode]);

  // Check auth status on load for the active user
  const checkAuthStatus = async (user = currentUser) => {
    try {
      const res = await apiFetch('/api/auth/status', {
        headers: { 'x-user-key': user?.userKey || '' }
      });
      const data = await res.json();
      setIsAuthorized(Boolean(data.authorized));
      if (data.user) {
        const updated = { ...user, ...data.user, userKey: data.userKey || user?.userKey };
        setCurrentUser(updated);
        localStorage.setItem('cold_email_user', JSON.stringify(updated));
      }
    } catch (e) {
      console.error('Failed to check auth status', e);
      setIsAuthorized(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    // Check if redirect contains auth=success
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      const userKey = params.get('userKey');
      const email = params.get('email');
      const name = params.get('name');
      const picture = params.get('picture');
      const jwtToken = params.get('jwt');

      if (jwtToken) {
        localStorage.setItem('cold_email_jwt', jwtToken);
      }

      const userObj = {
        userKey: userKey || (email ? email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() : 'default_user'),
        email: email || '',
        name: name || 'Candidate',
        picture: picture || ''
      };

      setCurrentUser(userObj);
      localStorage.setItem('cold_email_user', JSON.stringify(userObj));
      setIsAuthorized(true);
      showToast(`Welcome ${userObj.name}! Gmail connected successfully.`, 'success');

      // Clean query parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      checkAuthStatus(userObj);
    } else if (params.get('auth') === 'error') {
      const msg = params.get('msg') || 'Sign-in session expired. Please click Connect Gmail to retry.';
      showToast(msg, 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
      checkAuthStatus();
    } else {
      checkAuthStatus();
    }
  }, []);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleConnectGmail = async () => {
    try {
      const res = await apiFetch('/api/auth/url');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      showToast('Failed to fetch auth URL', 'error');
    }
  };

  const handleDisconnectGmail = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    setIsAuthorized(false);
    setCurrentUser(null);
    localStorage.removeItem('cold_email_user');
    localStorage.removeItem('cold_email_jwt');
    showToast('Account disconnected & workspace locked.', 'success');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border flex items-center gap-2 transition-all ${
          toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' :
          toast.type === 'error' ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800' :
          'bg-blue-50 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600" /> :
           toast.type === 'error' ? <XCircle className="w-5 h-5 text-rose-600" /> : null}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between shadow-xs sticky top-0 z-30 transition-colors">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-indigo-600 text-white p-1.5 sm:p-2 rounded-xl shadow-md shrink-0">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-sm sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-tight">Cold Reach AI</h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                <ShieldCheck className="w-3 h-3 text-indigo-600 dark:text-indigo-400" /> ISOLATED SANDBOX
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 hidden xs:block">Google OAuth & NVIDIA NIM Automated Outreach</p>
          </div>
        </div>

        {/* Right Section: Dark Mode Toggle + Gmail User Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Dark / Light Mode Toggle Button */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-1.5 sm:p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-amber-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shrink-0"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {checkingAuth && !currentUser ? (
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> <span className="hidden sm:inline">Checking...</span>
            </div>
          ) : currentUser ? (
            isAuthorized ? (
              <div className="flex items-center gap-2 sm:gap-3 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-full pl-1.5 sm:pl-2 pr-2 sm:pr-3 py-1 sm:py-1.5 shadow-sm max-w-[180px] sm:max-w-none">
                {currentUser.picture ? (
                  <img src={currentUser.picture} alt={currentUser.name} className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-emerald-300 dark:border-emerald-700 shrink-0" />
                ) : (
                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {(currentUser.name || 'C').charAt(0)}
                  </div>
                )}
                <div className="flex flex-col text-left leading-none min-w-0">
                  <span className="text-emerald-900 dark:text-emerald-300 text-[11px] sm:text-xs font-bold truncate">{currentUser.name || 'Candidate'}</span>
                  <span className="text-emerald-700 dark:text-emerald-400 text-[9px] sm:text-[10px] font-medium hidden sm:block truncate">{currentUser.email}</span>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5 shrink-0" title="Gmail Sandbox Connected"></div>
                <button 
                  onClick={handleDisconnectGmail}
                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-full hover:bg-white dark:hover:bg-slate-800 transition-colors shrink-0"
                  title="Switch / Disconnect Account"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-full pl-2.5 pr-1.5 py-1 shadow-sm">
                <span className="text-amber-900 dark:text-amber-300 text-xs font-bold truncate max-w-[100px] sm:max-w-none">{currentUser.name || 'Candidate'}</span>
                <button
                  onClick={handleConnectGmail}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1 transition-all shadow-xs"
                  title="Connect Gmail permissions to send emails and save drafts"
                >
                  <Mail className="w-3 h-3" /> Connect Gmail
                </button>
              </div>
            )
          ) : (
            <button
              onClick={handleConnectGmail}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>Sign in with Google</span>
            </button>
          )}
        </div>
      </header>

      {/* Navigation tabs with Horizontal Touch Scrolling */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2 sm:px-6 flex gap-1 sm:gap-6 overflow-x-auto no-scrollbar touch-scroll whitespace-nowrap shadow-xs transition-colors">
        <button
          onClick={() => setActiveTab('single')}
          className={`py-2.5 sm:py-3 px-2 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
            activeTab === 'single' ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>Single Email</span>
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`py-2.5 sm:py-3 px-2 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
            activeTab === 'bulk' ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>Bulk Campaign</span>
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`py-2.5 sm:py-3 px-2 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
            activeTab === 'logs' ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>Outreach Logs</span>
        </button>
        <button
          onClick={() => setActiveTab('jdtailor')}
          className={`py-2.5 sm:py-3 px-2 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
            activeTab === 'jdtailor' ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>JD Resume Tailor</span>
        </button>
        <button
          onClick={() => setActiveTab('linkedin')}
          className={`py-2.5 sm:py-3 px-2 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
            activeTab === 'linkedin' ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-500" /> <span>LinkedIn Auto-Pilot</span>
        </button>
        <button
          onClick={() => setActiveTab('naukri')}
          className={`py-2.5 sm:py-3 px-2 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
            activeTab === 'naukri' ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" /> <span>Naukri Auto-Uploader</span>
        </button>
        <button
          onClick={() => setActiveTab('resume')}
          className={`py-2.5 sm:py-3 px-2 sm:px-1 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
            activeTab === 'resume' ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>Base Template</span>
        </button>
      </div>

      {/* Main Content (Preserved in Memory) */}
      <main className="flex-1 p-3 sm:p-6 overflow-y-auto max-w-7xl w-full mx-auto touch-scroll">
        <div className={activeTab === 'single' ? 'block' : 'hidden'}>
          <SingleSender isAuthorized={isAuthorized} showToast={showToast} />
        </div>
        <div className={activeTab === 'bulk' ? 'block' : 'hidden'}>
          <BulkSender isAuthorized={isAuthorized} showToast={showToast} />
        </div>
        <div className={activeTab === 'logs' ? 'block' : 'hidden'}>
          <LogsViewer showToast={showToast} isActive={activeTab === 'logs'} />
        </div>
        <div className={activeTab === 'jdtailor' ? 'block' : 'hidden'}>
          <JdResumeTailor showToast={showToast} />
        </div>
        <div className={activeTab === 'linkedin' ? 'block' : 'hidden'}>
          <LinkedInAutoPilot isAuthorized={isAuthorized} showToast={showToast} isActive={activeTab === 'linkedin'} />
        </div>
        <div className={activeTab === 'naukri' ? 'block' : 'hidden'}>
          <NaukriAutoUploader showToast={showToast} isActive={activeTab === 'naukri'} />
        </div>
        <div className={activeTab === 'resume' ? 'block' : 'hidden'}>
          <ResumeEditor showToast={showToast} />
        </div>
      </main>
    </div>
  );
}

/* =========================================================================
   SINGLE SENDER MODULE
   ========================================================================= */
function SingleSender({ isAuthorized, showToast }) {
  const [hrEmail, setHrEmail] = useState('');
  const [jd, setJd] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  // Generated results
  const [parsedName, setParsedName] = useState('');
  const [parsedCompany, setParsedCompany] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [tailoredResume, setTailoredResume] = useState(null);
  const [companyIntel, setCompanyIntel] = useState(null);

  // Auto-parse instantly as the user types or pastes
  const handleEmailChange = (val) => {
    setHrEmail(val);
    if (val.includes('@')) {
      const [local, domain] = val.split('@');
      
      // Parse HR Name
      const cleanLocal = (local || '').replace(/\d+/g, '').replace(/[._\-+]/g, ' ').trim();
      let name = cleanLocal
        .split(' ')
        .filter(w => w.length > 0)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      const genericKeywords = ['hr', 'recruitment', 'jobs', 'careers', 'talent', 'hiring', 'admin', 'contact', 'info', 'support', 'team', 'apply', 'recruiting'];
      if (!name || genericKeywords.includes(name.toLowerCase())) {
        name = 'Hiring Team';
      }
      setParsedName(name || 'Hiring Manager');

      // Parse Target Company from Domain
      if (domain) {
        const personalDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'protonmail.com', 'mail.com'];
        const cleanDomain = domain.toLowerCase().trim();
        if (!personalDomains.includes(cleanDomain)) {
          const domainParts = cleanDomain.split('.');
          const subdomains = ['mail', 'email', 'careers', 'jobs', 'recruitment', 'hr', 'www'];
          let compPart = domainParts[0];
          if (subdomains.includes(compPart) && domainParts.length > 1) {
            compPart = domainParts[1];
          }
          if (compPart && compPart.length > 0) {
            // Capitalize company name
            const compName = compPart.charAt(0).toUpperCase() + compPart.slice(1);
            setParsedCompany(compName);
          }
        } else {
          setParsedCompany('');
        }
      }
    }
  };

  const handleGenerate = async () => {
    if (!hrEmail) return showToast('Please enter an HR email address.', 'error');
    setGenerating(true);
    try {
      const res = await apiFetch(`/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hrEmail: hrEmail.trim(),
          email: hrEmail.trim(),
          hrName: parsedName,
          name: parsedName,
          company: parsedCompany,
          jd
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setParsedName(data.name || data.hrName || parsedName);
      setParsedCompany(data.company || parsedCompany);
      setEmailSubject(data.subject || data.email?.subject || '');
      setEmailBody(data.body || data.email?.body || '');
      setTailoredResume(data.tailoredResume || data.resume);
      setCompanyIntel(data.companyIntel || null);
      showToast('Generated cold email & tailored templates successfully!', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to generate tailored items', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!isAuthorized) return showToast('Please connect your Gmail account via OAuth first.', 'error');
    if (!emailSubject || !emailBody || !tailoredResume) {
      return showToast('Please generate the tailored templates first.', 'error');
    }

    setSending(true);
    try {
      const res = await apiFetch(`/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: hrEmail,
          subject: emailSubject,
          body: emailBody,
          resume: tailoredResume,
          hrName: parsedName,
          company: parsedCompany,
          resumeType: jd && jd.trim().length > 0 ? 'Tailored' : 'Standard',
          jdSnippet: jd
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showToast(`Email successfully sent and logged for ${hrEmail}!`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to send email', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!isAuthorized) return showToast('Please connect your Gmail account via OAuth first.', 'error');
    if (!emailSubject || !emailBody || !tailoredResume) {
      return showToast('Please generate the tailored templates first.', 'error');
    }

    setSending(true);
    try {
      const res = await apiFetch(`/api/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: hrEmail,
          subject: emailSubject,
          body: emailBody,
          resume: tailoredResume,
          hrName: parsedName,
          company: parsedCompany,
          resumeType: jd && jd.trim().length > 0 ? 'Tailored' : 'Standard',
          jdSnippet: jd
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showToast(`Draft created in Gmail with 1-page PDF attached! You can open your Gmail app to schedule or send anytime.`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to create Gmail draft', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleScheduleMorning = async () => {
    if (!isAuthorized) return showToast('Please connect your Gmail account via OAuth first.', 'error');
    if (!emailSubject || !emailBody || !tailoredResume) {
      return showToast('Please generate the tailored templates first.', 'error');
    }

    // Schedule for next available 10:00 AM morning dispatch (skips weekends if scheduling on Fri/Sat)
    const scheduledDate = new Date();
    scheduledDate.setHours(10, 0, 0, 0);
    if (scheduledDate <= new Date()) {
      scheduledDate.setDate(scheduledDate.getDate() + 1);
    }
    // Skip weekend
    if (scheduledDate.getDay() === 6) scheduledDate.setDate(scheduledDate.getDate() + 2);
    if (scheduledDate.getDay() === 0) scheduledDate.setDate(scheduledDate.getDate() + 1);

    try {
      const res = await apiFetch(`/api/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: hrEmail.trim(),
          subject: emailSubject,
          body: emailBody,
          resume: tailoredResume,
          hrName: parsedName,
          company: parsedCompany,
          scheduledAt: scheduledDate.toISOString(),
          resumeType: jd && jd.trim().length > 0 ? 'Tailored' : 'Standard'
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showToast(`Email scheduled for ${scheduledDate.toLocaleDateString()} at 10:00 AM!`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to schedule email', 'error');
    }
  };

  const handleTailorAndSendInstantly = async () => {
    if (!hrEmail) return showToast('Please enter an HR email address.', 'error');
    if (!isAuthorized) return showToast('Please connect your Gmail account via OAuth first.', 'error');

    setGenerating(true);
    setSending(true);
    try {
      // Step 1: Generate Tailored Email & Resume
      const res = await apiFetch(`/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: hrEmail, jd })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setParsedName(data.name);
      setParsedCompany(data.company);
      setEmailSubject(data.email.subject);
      setEmailBody(data.email.body);
      setTailoredResume(data.resume);
      setCompanyIntel(data.companyIntel || null);

      // Step 2: Send Email Immediately
      const sendRes = await apiFetch(`/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: hrEmail,
          subject: data.email.subject,
          body: data.email.body,
          resume: data.resume,
          hrName: data.name,
          company: data.company,
          resumeType: jd && jd.trim().length > 0 ? 'Tailored' : 'Standard',
          jdSnippet: jd
        })
      });
      const sendData = await sendRes.json();
      if (sendData.error) throw new Error(sendData.error);

      showToast(`Tailored email & resume successfully sent directly to ${hrEmail}!`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to tailor and send', 'error');
    } finally {
      setGenerating(false);
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
      {/* Inputs Column */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 sm:gap-5 transition-colors">
        <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400 shrink-0" /> <span>Target Outreach Details</span>
        </h2>

        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 sm:mb-2">HR Email Address</label>
          <input
            type="email"
            value={hrEmail}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="e.g. santhosh@indi.co"
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Parsed Fields (Editable) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4 rounded-lg border border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Parsed HR Name</label>
            <input
              type="text"
              value={parsedName}
              onChange={(e) => setParsedName(e.target.value)}
              placeholder="Hiring Manager"
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Parsed Company</label>
            <input
              type="text"
              value={parsedCompany}
              onChange={(e) => setParsedCompany(e.target.value)}
              placeholder="Target Company"
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Scraped Company Intelligence Card */}
        {companyIntel && (
          <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-lg p-3 text-xs text-indigo-950 dark:text-indigo-200 flex flex-col gap-1">
            <span className="font-bold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400">
              <Globe className="w-3.5 h-3.5" /> Scraped Company Intelligence ({companyIntel.source || 'Online'})
            </span>
            <p className="leading-relaxed text-slate-700 dark:text-slate-300 italic">{companyIntel.summary}</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Job Description (JD) <span className="text-slate-400 font-normal">(Optional)</span></label>
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job description here to tailor your resume & email to this specific role..."
            rows={5}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono text-xs"
          />
          <p className="text-slate-400 text-xs mt-1">If left blank, a standard cold email template and default resume PDF will be used.</p>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating || sending || !hrEmail}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {generating && !sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Preview & Tailor
            </button>
            
            <button
              onClick={handleTailorAndSendInstantly}
              disabled={generating || sending || !hrEmail}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              title="Tailors the email and resume and sends it directly in 1 click"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              ⚡ Tailor & Send Now
            </button>
          </div>
        </div>
      </div>

      {/* Previews Column */}
      <div className="flex flex-col gap-6">
        {/* Email Preview */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Customized Cold Email
            </h3>
            {emailBody && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Subject: ${emailSubject}\n\n${emailBody}`);
                  showToast('Copied to clipboard!', 'success');
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 font-semibold"
              >
                Copy Content
              </button>
            )}
          </div>

          <div className="border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden text-sm">
            <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
              <span className="text-slate-400 font-semibold">Subject:</span>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject line will generate here..."
                className="bg-transparent border-none focus:outline-none w-full text-slate-800 dark:text-slate-100 font-semibold"
              />
            </div>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Email body will generate here..."
              rows={10}
              className="w-full p-4 bg-white dark:bg-slate-900 border-none focus:outline-none font-sans text-slate-700 dark:text-slate-200 resize-none whitespace-pre-wrap text-sm leading-relaxed"
            />
          </div>

          {/* Action Buttons inside Email Card */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSendEmail}
              disabled={sending || !emailBody}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:shadow-none"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Email Now to {parsedName || 'HR'}
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={handleScheduleMorning}
                disabled={sending || !emailBody}
                className="bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold py-2.5 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Schedules email dispatch for the next business morning at 10:00 AM (peak HR inbox opening time)"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                🌅 Schedule (10:00 AM)
              </button>

              <button
                onClick={handleCreateDraft}
                disabled={sending || !emailBody}
                className="bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold py-2.5 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Creates a ready draft in your Gmail app with the 1-page PDF attached so you can schedule send in Gmail"
              >
                <Bookmark className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                📝 Save Draft in Gmail App
              </button>
            </div>
          </div>
        </div>

        {/* Resume Preview */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Tailored Resume Highlights
          </h3>

          {tailoredResume ? (
            <div className="flex flex-col gap-4">
              <div className="bg-slate-50 dark:bg-slate-800/70 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block mb-1">Tailored Summary</span>
                <p className="text-xs text-slate-600 dark:text-slate-300 italic leading-relaxed">"{tailoredResume.summary}"</p>
              </div>

              <div className="border border-slate-100 dark:border-slate-800 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-800/40">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">Technical Skill Alignment</span>
                <div className="flex flex-wrap gap-1">
                  {Object.values(tailoredResume.skills || {}).flat().slice(0, 10).map((skill, i) => (
                    <span key={i} className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[10px] px-2 py-0.5 rounded font-semibold border border-slate-200 dark:border-slate-700">
                      {skill}
                    </span>
                  ))}
                  <span className="text-[10px] text-slate-400 py-0.5">...and others</span>
                </div>
              </div>

              <div className="bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 p-4 rounded-lg flex items-center gap-3 text-xs text-indigo-800 dark:text-indigo-300">
                <CheckCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div>
                  <p className="font-semibold">Tailored PDF Attached Automatically</p>
                  <p className="text-indigo-600 dark:text-indigo-400">The resume experience bullet points have been aligned to target JD keywords.</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-xs py-6 text-center italic">Generate templates to preview customized resume tweaks.</p>
          )}

          <button
            onClick={handleSendEmail}
            disabled={sending || !emailBody}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:shadow-none"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Cold Email to {parsedName || 'HR'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   BULK SENDER MODULE
   ========================================================================= */
function BulkSender({ isAuthorized, showToast }) {
  const [emailsText, setEmailsText] = useState('');
  const [jd, setJd] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [campaignState, setCampaignState] = useState('idle'); // idle, sending, complete
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleParseEmails = async () => {
    if (!emailsText) return;
    const rawEmails = emailsText
      .split('\n')
      .map(e => e.trim())
      .filter(e => e.includes('@'));

    try {
      const res = await apiFetch(`/api/bulk-parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: rawEmails })
      });
      const data = await res.json();
      
      const items = data.parsed.map(item => ({
        ...item,
        status: 'pending',
        errorMsg: ''
      }));
      setParsedItems(items);
      showToast(`Parsed ${items.length} email addresses.`, 'success');
    } catch (e) {
      showToast('Failed to parse email addresses', 'error');
    }
  };

  const handleRunCampaign = async () => {
    if (!isAuthorized) return showToast('Please connect your Gmail account via OAuth first.', 'error');
    if (parsedItems.length === 0) return showToast('Please add and parse email addresses first.', 'error');
    
    setCampaignState('sending');
    
    for (let i = 0; i < parsedItems.length; i++) {
      setCurrentIndex(i);
      updateItemStatus(i, 'generating');
      
      try {
        // Step 1: Generate Email and Resume
        const genRes = await apiFetch(`/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: parsedItems[i].email, jd })
        });
        const genData = await genRes.json();
        if (genData.error) throw new Error(genData.error);
        
        updateItemStatus(i, 'sending');

        // Step 2: Send Email with tailored resume PDF
        const sendRes = await apiFetch(`/api/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: parsedItems[i].email,
            subject: genData.email.subject,
            body: genData.email.body,
            resume: genData.resume,
            hrName: parsedItems[i].name,
            company: parsedItems[i].company,
            resumeType: jd && jd.trim().length > 0 ? 'Tailored' : 'Standard',
            jdSnippet: jd
          })
        });
        const sendData = await sendRes.json();
        if (sendData.error) throw new Error(sendData.error);

        updateItemStatus(i, 'success');
      } catch (err) {
        console.error(`Error sending to ${parsedItems[i].email}:`, err);
        updateItemStatus(i, 'error', err.message);
      }
    }
    
    setCampaignState('complete');
    showToast('Bulk campaign completed and logged!', 'success');
  };

  const handleExportHrExcel = () => {
    if (parsedItems.length === 0) {
      if (!emailsText.trim()) return showToast('Please enter recipient emails first.', 'error');
      const rawEmails = emailsText
        .split('\n')
        .map(e => e.trim())
        .filter(e => e.includes('@'));
      if (rawEmails.length === 0) return showToast('No valid email addresses found.', 'error');
      
      const headers = ['HR Name', 'Company Name', 'HR Email Address'];
      const rows = rawEmails.map(email => {
        const [local, domain] = email.split('@');
        let name = local.replace(/[._\-+]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        if (['hr', 'recruitment', 'jobs', 'careers'].includes(name.toLowerCase())) name = 'Hiring Team';
        const company = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1).toLowerCase();
        return [`"${name}"`, `"${company}"`, `"${email}"`];
      });

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `HR_Contacts_List_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Downloaded HR Emails list as Excel CSV!', 'success');
      return;
    }

    const headers = ['HR Name', 'Company Name', 'HR Email Address', 'Campaign Status'];
    const rows = parsedItems.map(item => [
      `"${item.name || 'Hiring Manager'}"`,
      `"${item.company || 'Unknown'}"`,
      `"${item.email}"`,
      `"${item.status || 'Pending'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `HR_Emails_Directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloaded HR Emails list as Excel CSV!', 'success');
  };

  const updateItemStatus = (index, status, errorMsg = '') => {
    setParsedItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], status, errorMsg };
      return updated;
    });
  };

  const handleReset = () => {
    setParsedItems([]);
    setEmailsText('');
    setCampaignState('idle');
    setCurrentIndex(0);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 sm:gap-6 transition-colors">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400 shrink-0" /> <span>Bulk Outreach Campaign</span>
        </h2>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <button
            onClick={handleExportHrExcel}
            disabled={!emailsText && parsedItems.length === 0}
            className="flex-1 sm:flex-none bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold px-3 py-1.5 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 disabled:opacity-50"
            title="Download HR names, company names, and emails as an Excel CSV file"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> <span>Download HR Emails</span>
          </button>
          {parsedItems.length > 0 && (
            <button onClick={handleReset} className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1">
              Reset List
            </button>
          )}
        </div>
      </div>

      {campaignState === 'idle' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 sm:mb-2">Recipient Emails <span className="text-slate-400 font-normal">(One per line)</span></label>
              <textarea
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                placeholder="santhosh@indi.co&#10;hr.manager@google.com&#10;recruitment@amazon.in"
                rows={10}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleParseEmails}
                disabled={!emailsText}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-all disabled:opacity-50"
              >
                Parse Email Addresses
              </button>
              <button
                onClick={handleExportHrExcel}
                disabled={!emailsText}
                className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold px-4 py-2.5 rounded-lg text-xs transition-all border border-slate-200 dark:border-slate-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Export Excel
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Common Job Description (JD)</label>
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the job description here. Every outgoing resume and cold email in the campaign will be tailored dynamically using this JD as context..."
              rows={10}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono text-xs resize-y"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center text-sm font-semibold text-slate-600 dark:text-slate-300">
            <span>Campaign progress ({currentIndex + 1} / {parsedItems.length})</span>
            <span>{campaignState === 'sending' ? 'Sending...' : 'Campaign Complete!'}</span>
          </div>
          
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
            <div 
              className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / parsedItems.length) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {parsedItems.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto touch-scroll mt-2">
          <table className="w-full text-left border-collapse text-xs min-w-[500px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                <th className="p-3">Email Address</th>
                <th className="p-3">HR Name</th>
                <th className="p-3">Company</th>
                <th className="p-3">Campaign Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {parsedItems.map((item, index) => (
                <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                  <td className="p-3 font-mono text-slate-700 dark:text-slate-300">{item.email}</td>
                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-100">{item.name}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{item.company}</td>
                  <td className="p-3 flex items-center gap-2">
                    {item.status === 'pending' && <span className="text-slate-400">Waiting</span>}
                    {item.status === 'generating' && <span className="text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Tailoring...</span>}
                    {item.status === 'sending' && <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Emailing...</span>}
                    {item.status === 'success' && <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Sent</span>}
                    {item.status === 'error' && (
                      <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1" title={item.errorMsg}>
                        <XCircle className="w-3.5 h-3.5 text-rose-500" /> Error
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {campaignState === 'idle' && parsedItems.length > 0 && (
        <button
          onClick={handleRunCampaign}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" /> Start Bulk Email Campaign
        </button>
      )}
    </div>
  );
}

/* =========================================================================
   OUTREACH LOGS / HISTORY MODULE
   ========================================================================= */
function LogsViewer({ showToast, isActive }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const getCachedLogs = () => {
    try {
      const user = JSON.parse(localStorage.getItem('cold_email_user') || '{}');
      const key = `cold_email_logs_${user.userKey || 'default'}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  };

  const setCachedLogs = (data) => {
    try {
      const user = JSON.parse(localStorage.getItem('cold_email_user') || '{}');
      const key = `cold_email_logs_${user.userKey || 'default'}`;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
  };

  const fetchLogs = async () => {
    const cached = getCachedLogs();
    if (cached.length > 0) {
      setLogs(cached);
    }
    try {
      const res = await apiFetch(`/api/logs/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: cached })
      });
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
        setCachedLogs(data.logs);
      }
    } catch (e) {
      if (cached.length === 0) {
        showToast('Failed to load outreach history', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [isActive]);

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all outreach logs?')) return;
    try {
      const res = await apiFetch(`/api/logs`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
        setCachedLogs([]);
        showToast('All outreach logs cleared.', 'success');
      }
    } catch (e) {
      showToast('Failed to clear logs', 'error');
    }
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return showToast('No logs to export.', 'info');
    
    const headers = ['Date', 'Company', 'HR Name', 'HR Email', 'Resume Type', 'Status', 'Subject'];
    const rows = logs.map(l => [
      `"${new Date(l.timestamp).toLocaleString()}"`,
      `"${l.company || ''}"`,
      `"${l.hrName || ''}"`,
      `"${l.hrEmail || l.email || ''}"`,
      `"${l.resumeType || ''}"`,
      `"${l.status || ''}"`,
      `"${(l.subject || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `outreach_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLogs = logs.filter(l => {
    const q = searchQuery.toLowerCase();
    const email = (l.hrEmail || l.email || '').toLowerCase();
    return (
      (l.company && l.company.toLowerCase().includes(q)) ||
      (l.hrName && l.hrName.toLowerCase().includes(q)) ||
      email.includes(q) ||
      (l.subject && l.subject.toLowerCase().includes(q))
    );
  });

  const totalSent = logs.filter(l => l.status === 'Sent' || l.status === 'Sent Successfully' || l.status?.includes('Sent')).length;
  const tailoredCount = logs.filter(l => (l.resumeType || '').includes('Tailored')).length;
  const uniqueCompanies = new Set(logs.map(l => l.company).filter(Boolean)).size;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" /> Loading outreach history...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between transition-colors">
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Total Sent</p>
            <p className="text-lg sm:text-2xl font-black text-slate-800 dark:text-slate-100 mt-0.5 sm:mt-1">{totalSent}</p>
          </div>
          <div className="p-2 sm:p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0">
            <Mail className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between transition-colors">
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Tailored</p>
            <p className="text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 sm:mt-1">{tailoredCount}</p>
          </div>
          <div className="p-2 sm:p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg shrink-0">
            <Sparkles className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between transition-colors">
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Standard</p>
            <p className="text-lg sm:text-2xl font-black text-slate-700 dark:text-slate-300 mt-0.5 sm:mt-1">{totalSent - tailoredCount}</p>
          </div>
          <div className="p-2 sm:p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg shrink-0">
            <FileText className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between transition-colors">
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Companies</p>
            <p className="text-lg sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5 sm:mt-1">{uniqueCompanies}</p>
          </div>
          <div className="p-2 sm:p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0">
            <History className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* Main Logs Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">Outreach Records & History Log</h2>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search logs..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleExportCSV}
              disabled={logs.length === 0}
              className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0 border border-slate-200 dark:border-slate-700"
              title="Download outreach history as an Excel CSV file"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> <span className="hidden sm:inline">Export</span> CSV
            </button>

            <a
              href="/api/logs/download"
              download
              className={`bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 shrink-0 border border-indigo-200 dark:border-indigo-800 ${logs.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
              title="Download full compressed gzip backup file stored permanently on the server"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> <span className="hidden sm:inline">Compressed</span> .gz
            </a>

            {logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1.5 rounded transition-colors shrink-0"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {filteredLogs.length === 0 ? (
          <div className="py-12 sm:py-16 text-center text-slate-400 text-xs italic border border-slate-100 dark:border-slate-800 rounded-lg">
            {logs.length === 0 ? 'No emails sent yet. Sent emails will be automatically tracked here!' : 'No records match your search query.'}
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto touch-scroll">
            <table className="w-full text-left border-collapse text-xs min-w-[620px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                  <th className="p-3">Date & Time</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">HR Name & Email</th>
                  <th className="p-3">Resume Attachment Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="p-3 text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                        {log.company || 'Unknown'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{log.hrName || 'Hiring Manager'}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{log.hrEmail || log.email}</div>
                    </td>
                    <td className="p-3">
                      {(log.resumeType || '').includes('Tailored') ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded font-semibold text-[11px]">
                          <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Tailored with JD
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded font-medium text-[11px]">
                          <FileText className="w-3 h-3" /> Standard Master
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {log.status === 'Sent' || log.status === 'Sent Successfully' || log.status?.includes('Sent') ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                          <CheckCircle className="w-3.5 h-3.5" /> Sent
                        </span>
                      ) : log.status === 'Draft Saved' ? (
                        <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold">
                          <Bookmark className="w-3.5 h-3.5" /> Draft Saved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                          <XCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 ml-auto"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto transition-colors">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Outreach Record Details</h3>
                <p className="text-xs text-slate-500">Sent to {selectedLog.hrName} ({selectedLog.hrEmail}) at {selectedLog.company}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Subject Line</span>
                <p className="p-2.5 bg-slate-50 rounded border border-slate-100 text-slate-800 font-semibold">{selectedLog.subject}</p>
              </div>

              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Cold Email Body Sent</span>
                <pre className="p-3 bg-slate-50 rounded border border-slate-100 text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {selectedLog.body}
                </pre>
              </div>

              {selectedLog.tailoredSummary && (
                <div>
                  <span className="font-bold text-indigo-600 uppercase tracking-wider block mb-1">Tailored Resume Summary</span>
                  <p className="p-2.5 bg-indigo-50/50 rounded border border-indigo-100 text-indigo-900 italic">
                    "{selectedLog.tailoredSummary}"
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedLog(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   RESUME EDITOR MODULE
   ========================================================================= */
function ResumeEditor({ showToast }) {
  const [resumeData, setResumeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fetchResume = async () => {
    try {
      const res = await apiFetch(`/api/resume`);
      const data = await res.json();
      setResumeData(data);
    } catch (e) {
      showToast('Failed to load resume baseline details', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResume();
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return showToast('Please upload a valid PDF resume file.', 'error');
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result;
        const res = await apiFetch(`/api/resume/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64 })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setResumeData(data.resume);
        showToast('Resume PDF parsed and baseline updated with AI!', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to parse resume PDF', 'error');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resumeData)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Baseline resume template updated!', 'success');
      }
    } catch (e) {
      showToast('Failed to update resume details', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNestedChange = (field, key, val) => {
    setResumeData(prev => ({
      ...prev,
      [field]: {
        ...prev[field],
        [key]: val
      }
    }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" /> Loading resume baseline details...
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 sm:gap-6 transition-colors">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400 shrink-0" /> <span>Base Resume Template Editor</span>
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">Upload a new PDF resume or edit your baseline template details manually below.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 sm:flex-none bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" /> : <UploadCloud className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
            <span>{uploading ? 'Parsing...' : 'Upload PDF'}</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg text-xs shadow transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      {/* Upload Banner */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-xl p-4 sm:p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center"
      >
        <div className="p-3 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-full shadow-sm">
          {uploading ? <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" /> : <UploadCloud className="w-6 h-6" />}
        </div>
        <div>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {uploading ? 'Extracting text and parsing details using AI...' : 'Click to Upload your Updated Resume PDF'}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">The system will automatically extract your experience, skills, projects, and education into your baseline template.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-4 border border-slate-100 dark:border-slate-800 p-4 rounded-lg bg-white dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-1">Personal Details</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">Full Name</label>
              <input
                type="text"
                value={resumeData.personalInfo?.name || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'name', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">Job Title</label>
              <input
                type="text"
                value={resumeData.personalInfo?.title || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'title', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">Email</label>
              <input
                type="text"
                value={resumeData.personalInfo?.email || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'email', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">Phone</label>
              <input
                type="text"
                value={resumeData.personalInfo?.phone || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'phone', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-slate-500 dark:text-slate-400 mb-1">Location</label>
              <input
                type="text"
                value={resumeData.personalInfo?.location || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'location', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">GitHub URL</label>
              <input
                type="text"
                value={resumeData.personalInfo?.github || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'github', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">LinkedIn URL</label>
              <input
                type="text"
                value={resumeData.personalInfo?.linkedin || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'linkedin', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded p-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border border-slate-100 dark:border-slate-800 p-4 rounded-lg bg-white dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-1">Professional Summary</h3>
          <textarea
            value={resumeData.summary || ''}
            onChange={(e) => setResumeData(prev => ({ ...prev, summary: e.target.value }))}
            rows={8}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded p-3 text-xs leading-relaxed focus:outline-none resize-none"
          />
        </div>
      </div>

      <div className="border border-slate-100 dark:border-slate-800 p-4 rounded-lg flex flex-col gap-3 bg-white dark:bg-slate-900 transition-colors">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-1 flex items-center justify-between">
          <span>Full Resume Schema (JSON)</span>
          <span className="text-[10px] text-slate-400 font-normal">Edit here for education, skills categories, experience entries, and projects</span>
        </h3>
        <textarea
          value={JSON.stringify(resumeData, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              setResumeData(parsed);
            } catch (err) {}
          }}
          rows={15}
          className="w-full bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded p-3 text-[11px] font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
        />
      </div>
    </div>
  );
}

/* =========================================================================
   DEDICATED JD RESUME TAILOR & APPLICATION LOG MODULE
   ========================================================================= */
function JdResumeTailor({ showToast }) {
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [jd, setJd] = useState('');
  const [tailoring, setTailoring] = useState(false);
  const [currentTailored, setCurrentTailored] = useState(null);

  // Application logs
  const [applications, setApplications] = useState([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [viewingApp, setViewingApp] = useState(null);
  const [previewTab, setPreviewTab] = useState('visual'); // 'visual' | 'json'

  const getCachedApps = () => {
    try {
      const user = JSON.parse(localStorage.getItem('cold_email_user') || '{}');
      const key = `cold_email_apps_${user.userKey || 'default'}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  };

  const setCachedApps = (data) => {
    try {
      const user = JSON.parse(localStorage.getItem('cold_email_user') || '{}');
      const key = `cold_email_apps_${user.userKey || 'default'}`;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
  };

  const fetchApplications = async () => {
    setLoadingApps(true);
    const cached = getCachedApps();
    if (cached.length > 0) {
      setApplications(cached);
    }
    try {
      const res = await apiFetch(`/api/applications/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applications: cached })
      });
      const data = await res.json();
      if (data.applications) {
        setApplications(data.applications);
        setCachedApps(data.applications);
      }
    } catch (e) {
      console.error('Failed to fetch applications', e);
    } finally {
      setLoadingApps(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setJd(text);
        showToast('Pasted Job Description from clipboard!', 'success');
      }
    } catch (err) {
      showToast('Please paste manually into the box', 'info');
    }
  };

  const handleTailor = async () => {
    if (!jd || jd.trim().length === 0) {
      showToast('Please paste a Job Description (JD) to tailor your resume.', 'error');
      return;
    }

    setTailoring(true);
    try {
      const res = await apiFetch(`/api/applications/tailor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: role.trim() || 'Software Development Engineer',
          company: company.trim() || 'Target Company',
          jd: jd.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to tailor resume');
      }

      setCurrentTailored(data.application);
      showToast(`Resume tailored successfully for ${data.application.role} at ${data.application.company}!`, 'success');
      fetchApplications();
    } catch (e) {
      showToast(`Tailoring failed: ${e.message}`, 'error');
    } finally {
      setTailoring(false);
    }
  };

  const handleDeleteApp = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this tailored resume and application log?')) return;

    try {
      const res = await apiFetch(`/api/applications/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setApplications(prev => {
          const updated = prev.filter(a => a.id !== id);
          setCachedApps(updated);
          return updated;
        });
        if (currentTailored?.id === id) setCurrentTailored(null);
        if (viewingApp?.id === id) setViewingApp(null);
        showToast('Application record removed.', 'success');
      }
    } catch (e) {
      showToast('Failed to delete application', 'error');
    }
  };

  const handleDownloadPdf = (id, comp, rol) => {
    const downloadUrl = `${BACKEND_URL}/api/applications/${id}/pdf`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'santhosh_t_k.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloading santhosh_t_k.pdf...', 'success');
  };

  const handleExportJson = (resumeData, comp, rol) => {
    const blob = new Blob([JSON.stringify(resumeData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Santhosh_TK_${(comp || 'Company').replace(/\s+/g, '_')}_Tailored_Resume.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Tailored Resume JSON exported.', 'success');
  };

  const filteredApps = applications.filter(app => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (app.role || '').toLowerCase().includes(q) ||
           (app.company || '').toLowerCase().includes(q) ||
           (app.jd || '').toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-lg border border-indigo-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-500/30 text-indigo-200 text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full font-semibold border border-indigo-400/30">
              AI Job-Matched Resume Compiler
            </span>
          </div>
          <h2 className="text-lg sm:text-2xl font-black tracking-tight">Dedicated JD Resume Tailor & Log</h2>
          <p className="text-xs sm:text-sm text-indigo-200/90 mt-1 max-w-2xl leading-relaxed">
            Paste any target Job Description (JD). Our AI engine intelligently aligns your real technical stack, projects, and achievements to match the job requirements, compiles an executive 1-page PDF, and stores the application in your persistent history log.
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md px-3 sm:px-4 py-2 sm:py-3 rounded-xl border border-white/10 text-center min-w-[110px] sm:min-w-[140px] shrink-0">
          <div className="text-xl sm:text-2xl font-black text-white">{applications.length}</div>
          <div className="text-[10px] sm:text-xs text-indigo-200 font-medium">Logged Resumes</div>
        </div>
      </div>

      {/* Input Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Left: Input Form (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col gap-3.5 sm:gap-4 transition-colors">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-2.5 sm:pb-3 flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Target Role & Job Description</span>
            </h3>
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="text-[11px] sm:text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 px-2 sm:px-2.5 py-1 rounded transition-colors"
            >
              📋 Paste JD
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Target Company</label>
              <input
                type="text"
                placeholder="e.g. Amazon, Google, Uber"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Target Role / Title</label>
              <input
                type="text"
                placeholder="e.g. Software Development Engineer / Full Stack Developer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Paste Job Description (JD) *</label>
              <span className="text-[11px] text-slate-400">{jd.length} chars</span>
            </div>
            <textarea
              rows={10}
              placeholder="Paste the complete Job Description here (key skills, responsibilities, required backend/frontend stack)..."
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs leading-relaxed text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-sans"
            />
          </div>

          <button
            onClick={handleTailor}
            disabled={tailoring || !jd.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm"
          >
            {tailoring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Tailoring Resume & Compiling 1-Page PDF...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>✨ Tailor Resume for this JD</span>
              </>
            )}
          </button>
        </div>

        {/* Right: Active Tailored Preview (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col gap-4 transition-colors">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Tailored Resume Result</span>
            </h3>
            {currentTailored && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewTab('visual')}
                  className={`text-xs px-2.5 py-1 rounded font-semibold transition-all ${
                    previewTab === 'visual' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Visual Preview
                </button>
                <button
                  onClick={() => setPreviewTab('json')}
                  className={`text-xs px-2.5 py-1 rounded font-semibold transition-all ${
                    previewTab === 'json' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  JSON Schema
                </button>
              </div>
            )}
          </div>

          {!currentTailored ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
              <div className="bg-slate-100 p-4 rounded-full mb-3 text-slate-400">
                <FileText className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-slate-600 mb-1">No Tailored Resume Generated Yet</h4>
              <p className="text-xs max-w-sm">
                Paste a Job Description on the left and click "Tailor Resume". The job-aligned 1-page PDF and JSON will appear here with one-click download buttons.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4">
              {/* Application Details Header */}
              <div className="bg-indigo-50/70 border border-indigo-100 p-3.5 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded font-bold">
                      {currentTailored.company}
                    </span>
                    <span className="bg-white border border-indigo-200 text-indigo-900 text-xs px-2 py-0.5 rounded font-semibold">
                      {currentTailored.role}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {new Date(currentTailored.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="text-[11px] font-bold text-slate-600">Top Matched Skills:</span>
                    {currentTailored.matchedSkills?.map((skill, idx) => (
                      <span key={idx} className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => handleDownloadPdf(currentTailored.id, currentTailored.company, currentTailored.role)}
                    className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    onClick={() => handleExportJson(currentTailored.tailoredResume, currentTailored.company, currentTailored.role)}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold px-2.5 py-2 rounded-lg transition-colors flex items-center justify-center"
                    title="Export JSON"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Preview Body */}
              {previewTab === 'visual' ? (
                <div className="flex-1 max-h-[420px] overflow-y-auto bg-slate-50 dark:bg-slate-800/80 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 flex flex-col gap-3.5 text-xs transition-colors">
                  {/* Summary */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-1 mb-1">
                      Tailored Professional Summary
                    </h5>
                    <p className="leading-relaxed text-slate-700 dark:text-slate-300">
                      {currentTailored.tailoredResume?.summary}
                    </p>
                  </div>

                  {/* Skills */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-1 mb-1.5">
                      Prioritized Technical Skills
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(currentTailored.tailoredResume?.skills || {}).map(([cat, list]) => (
                        <div key={cat} className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                          <span className="font-bold text-slate-800 dark:text-slate-100">{cat}: </span>
                          <span className="text-slate-600 dark:text-slate-300">{Array.isArray(list) ? list.join(', ') : list}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Experience */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-1 mb-1.5">
                      Tailored Project Highlights & Experience
                    </h5>
                    <div className="flex flex-col gap-2">
                      {currentTailored.tailoredResume?.experience?.map((job, idx) => (
                        <div key={idx} className="bg-white dark:bg-slate-800 p-2.5 rounded border border-slate-100 dark:border-slate-700">
                          <div className="flex justify-between items-center font-bold text-slate-900 dark:text-slate-100 mb-1">
                            <span>{job.role} - {job.company}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">{job.duration}</span>
                          </div>
                          {job.highlights && (
                            <ul className="list-disc list-inside text-[11px] text-slate-600 dark:text-slate-300 flex flex-col gap-0.5">
                              {job.highlights.map((hl, hIdx) => (
                                <li key={hIdx}>{hl}</li>
                              ))}
                            </ul>
                          )}
                          {job.projects && job.projects.map((proj, pIdx) => (
                            <div key={pIdx} className="mt-1 pl-2 border-l-2 border-indigo-200 dark:border-indigo-700">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">{proj.name}</span>
                              <ul className="list-disc list-inside text-[11px] text-slate-600 dark:text-slate-400">
                                {proj.highlights?.map((hl, hIdx) => (
                                  <li key={hIdx}>{hl}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <textarea
                  readOnly
                  rows={14}
                  value={JSON.stringify(currentTailored.tailoredResume, null, 2)}
                  className="w-full bg-slate-900 text-emerald-400 p-3 rounded-lg font-mono text-[11px] leading-relaxed resize-none focus:outline-none"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Applications Log Table */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col gap-4 transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Application History & Tailored Resumes Log</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Every job description you tailor is logged here with full metadata, matched skills, and an instant 1-page PDF download link.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search role or company..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg text-xs w-full sm:w-48 focus:outline-none focus:bg-white dark:focus:bg-slate-800"
              />
            </div>
            <button
              onClick={fetchApplications}
              className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors border border-slate-200 dark:border-slate-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {loadingApps ? (
          <div className="flex items-center justify-center p-8 text-slate-400 text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading application logs...
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            No application records found. Tailor a resume using the form above to build your history log.
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto touch-scroll">
            <table className="w-full text-left text-xs border-collapse min-w-[620px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 uppercase font-bold text-[10px] tracking-wider">
                  <th className="p-3">Applied Company & Role</th>
                  <th className="p-3">Matched Skills</th>
                  <th className="p-3">Job Description Preview</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredApps.map(app => (
                  <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{app.company}</div>
                      <div className="text-indigo-600 dark:text-indigo-400 font-semibold text-[11px]">{app.role}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {app.matchedSkills?.slice(0, 4).map((skill, sIdx) => (
                          <span key={sIdx} className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            {skill}
                          </span>
                        ))}
                        {(app.matchedSkills?.length || 0) > 4 && (
                          <span className="text-[10px] text-slate-400 font-medium">+{app.matchedSkills.length - 4} more</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <p className="text-slate-600 dark:text-slate-400 text-[11px] line-clamp-2 max-w-md">
                        {app.jdSnippet}
                      </p>
                    </td>
                    <td className="p-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-[11px]">
                      {new Date(app.timestamp).toLocaleDateString()} {new Date(app.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDownloadPdf(app.id, app.company, app.role)}
                          className="bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1"
                          title="Download 1-Page Tailored PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                        <button
                          onClick={() => {
                            setCurrentTailored(app);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1.5 rounded text-xs font-semibold transition-all flex items-center gap-1"
                          title="View Tailored Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={(e) => handleDeleteApp(app.id, e)}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}



/* =========================================================================
   LINKEDIN RECRUITER AUTO-PILOT MODULE
   ========================================================================= */
function LinkedInAutoPilot({ isAuthorized, showToast, isActive }) {
  const [leads, setLeads] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [pastedPostText, setPastedPostText] = useState('');
  const [parsingPasted, setParsingPasted] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentCompany: '', currentEmail: '' });
  const [batchStatusMap, setBatchStatusMap] = useState({}); // { [leadId]: 'queued' | 'tailoring' | 'sending' | 'success' | 'error' }
  const [searchQuery, setSearchQuery] = useState('site:linkedin.com/posts "we are hiring" "MERN" "3 years" "email"');
  const [config, setConfig] = useState({
    enabled: true,
    intervalHours: 3,
    timeWindowDays: 7,
    mode: 'send',
    targetPerRun: 10,
    lastRunAt: null,
    nextRunAt: null
  });
  const [selectedLead, setSelectedLead] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [tailoredPreview, setTailoredPreview] = useState(null);

  const fetchConfig = async () => {
    try {
      const res = await apiFetch('/api/linkedin/config');
      const data = await res.json();
      if (data.config) setConfig(data.config);
    } catch (e) {}
  };

  const handleParsePastedPost = async () => {
    if (!pastedPostText.trim()) return;
    setParsingPasted(true);
    try {
      const res = await apiFetch('/api/linkedin/parse-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedPostText.trim() })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setLeads(prev => [data.lead, ...prev.filter(l => l.email.toLowerCase() !== data.lead.email.toLowerCase())]);
      setPastedPostText('');
      showToast(`Added verified lead: ${data.lead.email} (${data.lead.company}) to queue!`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to parse post', 'error');
    } finally {
      setParsingPasted(false);
    }
  };

  const handleScanLeads = async () => {
    setScanning(true);
    try {
      const res = await apiFetch('/api/linkedin/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, count: 12 })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLeads(data.leads || []);
      showToast(`Discovered ${data.leads?.length || 0} recruiter hiring posts from past 1 week!`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to scan LinkedIn posts', 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleToggleAutoPilot = async () => {
    const updated = { ...config, enabled: !config.enabled };
    setConfig(updated);
    try {
      await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast(updated.enabled ? '3-Hour LinkedIn Auto-Pilot is now ACTIVE!' : 'Auto-Pilot paused.', 'info');
    } catch (e) {
      showToast('Failed to update config', 'error');
    }
  };

  const handleModeChange = async (newMode) => {
    const updated = { ...config, mode: newMode };
    setConfig(updated);
    try {
      await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast(`Outreach mode set to ${newMode === 'send' ? 'Instant Send' : 'Save Drafts'}`, 'info');
    } catch (e) {
      showToast('Failed to update mode', 'error');
    }
  };

  const handleIntervalChange = async (newMinutes) => {
    const mins = parseInt(newMinutes, 10);
    const updated = {
      ...config,
      intervalMinutes: mins,
      intervalHours: mins / 60,
      nextRunAt: new Date(Date.now() + mins * 60 * 1000).toISOString()
    };
    setConfig(updated);
    try {
      await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast(`Auto-Pilot will run every ${mins} minutes!`, 'success');
    } catch (e) {
      showToast('Failed to update interval', 'error');
    }
  };

  // Continuous sequential one-after-one batch dispatcher
  const handleRunBatchOutreach = async () => {
    if (!isAuthorized) return showToast('Please connect your Gmail account via OAuth first.', 'error');
    
    const uncontacted = leads.filter(l => !l.alreadyContacted).slice(0, config.targetPerRun || 10);
    if (uncontacted.length === 0) {
      return showToast('No fresh uncontacted leads available in this batch.', 'info');
    }

    setDispatching(true);
    const initialStatus = {};
    uncontacted.forEach(l => { initialStatus[l.id] = 'queued'; });
    setBatchStatusMap(initialStatus);

    let successCount = 0;

    for (let i = 0; i < uncontacted.length; i++) {
      const lead = uncontacted[i];
      setBatchProgress({
        current: i + 1,
        total: uncontacted.length,
        currentCompany: lead.company,
        currentEmail: lead.email
      });

      // 1. Step 1: Tailor Resume
      setBatchStatusMap(prev => ({ ...prev, [lead.id]: 'tailoring' }));
      try {
        const jdContext = `Role: ${lead.role}\nCompany: ${lead.company}\nJob Description (Posted ${lead.postedDaysAgo || 1}d ago):\n${lead.postSnippet}`;
        const genRes = await apiFetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: lead.email, jd: jdContext, company: lead.company, hrName: lead.recruiterName })
        });
        const genData = await genRes.json();
        if (genData.error) throw new Error(genData.error);

        // 2. Step 2: Send Email via Gmail API (or Draft)
        setBatchStatusMap(prev => ({ ...prev, [lead.id]: 'sending' }));
        const endpoint = config.mode === 'draft' ? '/api/draft' : '/api/send';
        const sendRes = await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: lead.email,
            subject: genData.email.subject,
            body: genData.email.body,
            resume: genData.resume,
            hrName: lead.recruiterName,
            company: lead.company,
            resumeType: 'Tailored (LinkedIn 1-Week Post)',
            jdSnippet: lead.postSnippet
          })
        });
        const sendData = await sendRes.json();
        if (sendData.error) throw new Error(sendData.error);

        setBatchStatusMap(prev => ({ ...prev, [lead.id]: 'success' }));
        successCount++;
        
        // 3. Step 3: Gentle 2-second rate-limit pause between consecutive dispatches
        if (i < uncontacted.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        console.error(`Failed sending to ${lead.email}:`, err);
        setBatchStatusMap(prev => ({ ...prev, [lead.id]: 'error' }));
      }
    }

    setDispatching(false);
    showToast(`Continuous dispatch complete! Successfully processed ${successCount}/${uncontacted.length} emails.`, 'success');
    handleScanLeads();
    fetchConfig();
  };

  const handlePreviewLead = async (lead) => {
    setSelectedLead(lead);
    setPreviewing(true);
    setTailoredPreview(null);
    try {
      const jdContext = `Role: ${lead.role}\nCompany: ${lead.company}\nJob Description (Posted ${lead.postedDaysAgo || 1}d ago):\n${lead.postSnippet}`;
      const res = await apiFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lead.email, jd: jdContext, company: lead.company, hrName: lead.recruiterName })
      });
      const data = await res.json();
      setTailoredPreview(data);
    } catch (e) {
      showToast('Failed to generate preview for lead', 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSendSingleLead = async (lead) => {
    if (!isAuthorized) return showToast('Please connect your Gmail account via OAuth first.', 'error');
    try {
      const jdContext = `Role: ${lead.role}\nCompany: ${lead.company}\nJob Description (Posted ${lead.postedDaysAgo || 1}d ago):\n${lead.postSnippet}`;
      const genRes = await apiFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lead.email, jd: jdContext, company: lead.company, hrName: lead.recruiterName })
      });
      const genData = await genRes.json();

      const sendRes = await apiFetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: lead.email,
          subject: genData.email.subject,
          body: genData.email.body,
          resume: genData.resume,
          hrName: lead.recruiterName,
          company: lead.company,
          resumeType: 'Tailored (LinkedIn 1-Week Post)',
          jdSnippet: lead.postSnippet
        })
      });
      const sendData = await sendRes.json();
      if (sendData.error) throw new Error(sendData.error);

      showToast(`Sent tailored 1-page resume to ${lead.email} (${lead.company})!`, 'success');
      handleScanLeads();
      setSelectedLead(null);
    } catch (e) {
      showToast(e.message || 'Failed to dispatch email', 'error');
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchConfig();
      if (leads.length === 0) {
        handleScanLeads();
      }
    }
  }, [isActive]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Auto-Pilot Control Center Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Globe className="w-5 h-5 text-sky-500" />
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">LinkedIn Recruiter Job Hunter & Auto-Pilot</h2>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                config.enabled 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
              }`}>
                {config.enabled ? `● AUTO-PILOT ACTIVE (EVERY ${config.intervalMinutes || 30} MINS)` : '○ PAUSED'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Discovers fresh recruiter hiring posts strictly from the past 1 week, and automatically dispatches tailored 1-page resumes continuously one-after-another every half hour (30 mins).
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleToggleAutoPilot}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs border ${
                config.enabled
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent'
              }`}
            >
              {config.enabled ? 'Pause Scheduler' : '▶ Activate Scheduler'}
            </button>

            <select
              value={config.intervalMinutes || 30}
              onChange={(e) => handleIntervalChange(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:border-indigo-500"
              title="Scheduler Execution Frequency"
            >
              <option value="30">⏱️ Every 30 Mins (Half-Hour)</option>
              <option value="60">⏱️ Every 1 Hour</option>
              <option value="120">⏱️ Every 2 Hours</option>
              <option value="180">⏱️ Every 3 Hours</option>
            </select>

            <select
              value={config.mode}
              onChange={(e) => handleModeChange(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-3 py-1.5 font-semibold focus:outline-none focus:border-indigo-500"
            >
              <option value="send">⚡ Auto-Send via Gmail</option>
              <option value="draft">📝 Save Drafts in Gmail</option>
            </select>
          </div>
        </div>

        {/* Search Query Filter & Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                LinkedIn Search Dork / Target Stack Filter
              </label>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                <Clock className="w-3 h-3" /> Past 1 Week Only (Max 7 Days)
              </span>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. site:linkedin.com/posts 'we are hiring' 'MERN' '3 years'"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handleScanLeads}
              disabled={scanning || dispatching}
              className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 text-sky-500" />}
              <span>Scan 1-Week Posts</span>
            </button>

            <button
              onClick={handleRunBatchOutreach}
              disabled={dispatching || scanning || leads.length === 0}
              className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              title="Tailors 1-page resumes and sends emails continuously one after another"
            >
              {dispatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Continuous Dispatch (10)</span>
            </button>
          </div>
        </div>

        {/* Quick Paste Recruiter Post Card */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Paste Custom LinkedIn Recruiter Post / Hiring JD</span>
            </span>
            <span className="text-[10px] text-slate-400 hidden sm:inline">Auto-extracts verified HR email & queues for continuous sending</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={pastedPostText}
              onChange={(e) => setPastedPostText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleParsePastedPost(); }}
              placeholder='e.g. "We are hiring Senior MERN Stack Developer at Swiggy. Please drop your resume to careers@swiggy.in"'
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleParsePastedPost}
              disabled={parsingPasted || !pastedPostText.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1 shrink-0 disabled:opacity-50"
            >
              {parsingPasted ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Add to Queue</span>
            </button>
          </div>
        </div>

        {/* Live Continuous Progress Bar Banner */}
        {dispatching && (
          <div className="mt-2 p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl flex flex-col gap-2 animate-pulse">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-sky-900 dark:text-sky-200 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-sky-600 dark:text-sky-400" />
                <span>Sending email {batchProgress.current} of {batchProgress.total}: <strong>{batchProgress.currentCompany}</strong> ({batchProgress.currentEmail})</span>
              </span>
              <span className="font-mono text-sky-700 dark:text-sky-300 font-bold">
                {Math.round((batchProgress.current / (batchProgress.total || 1)) * 100)}%
              </span>
            </div>
            <div className="w-full bg-sky-200 dark:bg-sky-900 h-2 rounded-full overflow-hidden">
              <div
                className="bg-sky-600 dark:bg-sky-400 h-2 transition-all duration-500 rounded-full"
                style={{ width: `${(batchProgress.current / (batchProgress.total || 1)) * 100}%` }}
              ></div>
            </div>
            <p className="text-[11px] text-sky-700 dark:text-sky-400 italic">
              ✨ Tailoring 1-page resume, generating PDF & sending continuously one-after-another with safe pacing...
            </p>
          </div>
        )}
      </div>

      {/* Discovered Recruiter Leads Feed */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
        <div className="flex justify-between items-center">
          <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-500" />
            <span>Discovered Hiring Posts & Extracted HR Emails ({leads.length})</span>
          </h3>
          <span className="text-xs text-slate-400">
            {leads.filter(l => !l.alreadyContacted).length} fresh uncontacted leads in past 1 week
          </span>
        </div>

        {leads.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs italic border border-slate-100 dark:border-slate-800 rounded-lg">
            {scanning ? 'Scanning public LinkedIn recruiter posts from past 7 days...' : 'No leads discovered yet. Click "Scan 1-Week Posts" above to find fresh hiring posts!'}
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto touch-scroll">
            <table className="w-full text-left text-xs border-collapse min-w-[750px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                  <th className="p-3">Company & Recruiter</th>
                  <th className="p-3">Extracted Contact Email</th>
                  <th className="p-3">Posted Window</th>
                  <th className="p-3">Post Hiring Snippet</th>
                  <th className="p-3">Outreach Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {leads.map((lead) => {
                  const currentStatus = batchStatusMap[lead.id];
                  return (
                    <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{lead.company}</div>
                        <div className="text-slate-500 text-[11px] font-medium">{lead.recruiterName || 'Hiring Lead'}</div>
                      </td>
                      <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                        {lead.email}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-semibold px-2 py-0.5 rounded text-[11px] border border-sky-200 dark:border-sky-800">
                          <Clock className="w-3 h-3 text-sky-500" />
                          {lead.postedDaysAgo ? `${lead.postedDaysAgo}d ago` : 'Within 1w'}
                        </span>
                      </td>
                      <td className="p-3 max-w-md">
                        <p className="text-slate-600 dark:text-slate-300 text-[11px] line-clamp-2 leading-relaxed">
                          {lead.postSnippet}
                        </p>
                      </td>
                      <td className="p-3">
                        {currentStatus === 'tailoring' ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded font-bold text-[10px] border border-amber-200 dark:border-amber-800 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" /> Tailoring PDF...
                          </span>
                        ) : currentStatus === 'sending' ? (
                          <span className="inline-flex items-center gap-1 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded font-bold text-[10px] border border-sky-200 dark:border-sky-800 animate-pulse">
                            <Send className="w-3 h-3" /> Sending Mail...
                          </span>
                        ) : currentStatus === 'success' ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded font-bold text-[10px] border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle className="w-3 h-3 text-emerald-500" /> Sent Just Now
                          </span>
                        ) : currentStatus === 'queued' ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-medium text-[10px] border border-slate-200 dark:border-slate-700">
                            <Clock className="w-3 h-3" /> In Dispatch Queue
                          </span>
                        ) : lead.alreadyContacted ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-semibold text-[10px] border border-slate-200 dark:border-slate-700">
                            <ShieldCheck className="w-3 h-3 text-slate-400" /> Already Contacted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded font-semibold text-[10px] border border-emerald-200 dark:border-emerald-800">
                            <Sparkles className="w-3 h-3 text-emerald-500" /> Fresh Lead
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePreviewLead(lead)}
                            className="bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1"
                            title="Preview tailored email & resume"
                          >
                            <Eye className="w-3.5 h-3.5" /> <span>Preview</span>
                          </button>
                          <button
                            onClick={() => handleSendSingleLead(lead)}
                            disabled={dispatching || lead.alreadyContacted}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-bold transition-all shadow-xs flex items-center gap-1 disabled:opacity-40"
                            title="Tailor and send 1-page PDF instantly"
                          >
                            <Send className="w-3 h-3" /> <span>Send</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lead Preview Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto transition-colors">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedLead.company} • {selectedLead.recruiterName || 'Hiring Lead'}
                </h3>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">{selectedLead.email}</p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Recruiter Post Context</span>
                <p className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 leading-relaxed italic">
                  "{selectedLead.postSnippet}"
                </p>
              </div>

              {previewing ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-xs font-semibold">Tailoring 1-page resume and cold email with AI...</span>
                </div>
              ) : tailoredPreview ? (
                <>
                  <div>
                    <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Tailored Cold Email Subject</span>
                    <p className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100">
                      {tailoredPreview.subject}
                    </p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Tailored Cold Email Body</span>
                    <pre className="p-3 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed text-xs">
                      {tailoredPreview.body}
                    </pre>
                  </div>
                  {tailoredPreview.tailoredResume?.summary && (
                    <div>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">Tailored 1-Page Resume Summary</span>
                      <p className="p-2.5 bg-emerald-50/50 dark:bg-emerald-950/30 rounded border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 italic">
                        "{tailoredPreview.tailoredResume.summary}"
                      </p>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setSelectedLead(null)}
                className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              >
                Close
              </button>
              <button
                onClick={() => handleSendSingleLead(selectedLead)}
                disabled={dispatching}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Tailored Resume Now</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   NAUKRI AUTO-UPLOADER & QUARTER-DAY (10 AM / 4 PM / 10 PM / 4 AM) BOOSTER
   ========================================================================= */
function NaukriAutoUploader({ showToast, isActive }) {
  const [config, setConfig] = useState({
    enabled: true,
    scheduleMode: 'quarter_day',
    slots: ['10:00 AM', '04:00 PM', '10:00 PM', '04:00 AM'],
    intervalHours: 6,
    intervalMinutes: 360,
    username: '',
    password: '',
    headless: true,
    lastUploadAt: null,
    nextUploadAt: null,
    lastStatus: null,
    lastError: null
  });
  const [history, setHistory] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });

  const fetchConfigAndHistory = async () => {
    try {
      const [confRes, histRes] = await Promise.all([
        apiFetch('/api/naukri/config'),
        apiFetch('/api/naukri/history')
      ]);
      const confData = await confRes.json();
      const histData = await histRes.json();

      if (confData.config) {
        setConfig(confData.config);
        setFormData({
          username: confData.config.username || '',
          password: confData.config.password || ''
        });
      }
      if (histData.history) {
        setHistory(histData.history);
      }
    } catch (e) {
      console.error('Failed fetching Naukri data', e);
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchConfigAndHistory();
    }
  }, [isActive]);

  const handleSaveCredentials = async (e) => {
    e?.preventDefault();
    setSavingCreds(true);
    try {
      const updated = {
        ...config,
        username: formData.username.trim(),
        password: formData.password
      };
      const res = await apiFetch('/api/naukri/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConfig(data.config);
      showToast('Naukri credentials saved securely!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save credentials', 'error');
    } finally {
      setSavingCreds(false);
    }
  };

  const handleToggleAutoUploader = async () => {
    const updated = { ...config, enabled: !config.enabled };
    setConfig(updated);
    try {
      await apiFetch('/api/naukri/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast(updated.enabled ? 'Naukri Auto-Uploader is now ACTIVE!' : 'Naukri Auto-Uploader paused.', 'info');
    } catch (e) {
      showToast('Failed to update config', 'error');
    }
  };

  const handleScheduleModeChange = async (mode) => {
    const updated = { ...config, scheduleMode: mode };
    setConfig(updated);
    try {
      await apiFetch('/api/naukri/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast(`Schedule set to ${mode === 'quarter_day' ? 'Quarter-Day (10 AM, 4 PM, 10 PM, 4 AM)' : 'Every 1 Hour'}`, 'success');
    } catch (e) {
      showToast('Failed to update schedule mode', 'error');
    }
  };

  const handleHeadlessToggle = async () => {
    const updated = { ...config, headless: !config.headless };
    setConfig(updated);
    try {
      await apiFetch('/api/naukri/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast(`Browser mode: ${updated.headless ? 'Headless (Silent)' : 'Visible Chrome Window'}`, 'info');
    } catch (e) {}
  };

  const handleTriggerUpload = async () => {
    if (!config.username && !formData.username) {
      return showToast('Please enter your Naukri login email & password first.', 'error');
    }
    setUploading(true);
    try {
      const res = await apiFetch('/api/naukri/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username.trim() || config.username,
          password: formData.password || config.password,
          headless: config.headless
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showToast(`🚀 Resume uploaded to Naukri successfully! Profile Status: Active Just Now (${data.result?.duration || '12s'})`, 'success');
      fetchConfigAndHistory();
    } catch (err) {
      showToast(err.message || 'Failed to upload resume to Naukri', 'error');
      fetchConfigAndHistory();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* 1. Control Center Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">Naukri Quarter-Day Auto-Uploader & Profile Booster</h2>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                config.enabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
              }`}>
                {config.enabled ? '● QUARTER-DAY AUTO-UPLOADER ACTIVE' : '○ PAUSED'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Automatically generates your latest ATS-tailored 1-page resume and uploads it to Naukri.com every quarter of the day (<strong>10:00 AM</strong>, <strong>04:00 PM</strong>, <strong>10:00 PM</strong>, <strong>04:00 AM</strong>) to keep your profile marked as <strong>"Active Just Now"</strong> at the top of recruiter searches.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleToggleAutoUploader}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs border ${
                config.enabled
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent'
              }`}
            >
              {config.enabled ? 'Pause Scheduler' : '▶ Activate Scheduler'}
            </button>

            <select
              value={config.scheduleMode || 'quarter_day'}
              onChange={(e) => handleScheduleModeChange(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:border-indigo-500"
              title="Upload Schedule Mode"
            >
              <option value="quarter_day">⏱️ Quarter-Day (10 AM, 4 PM, 10 PM, 4 AM)</option>
              <option value="hourly">⏱️ Every 1 Hour (Continuous Hourly)</option>
              <option value="half_hour">⏱️ Every 30 Minutes</option>
            </select>

            <button
              onClick={handleTriggerUpload}
              disabled={uploading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-4 rounded-lg text-xs transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
              title="Upload resume immediately right now"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              <span>{uploading ? 'Uploading to Naukri...' : 'Boost Profile Now'}</span>
            </button>
          </div>
        </div>

        {/* Live Uploading Progress Banner */}
        {uploading && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3 animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-emerald-900 dark:text-emerald-200 block">
                Launching Chrome & uploading tailored 1-page PDF to Naukri.com...
              </span>
              <span className="text-emerald-700 dark:text-emerald-400 text-[11px]">
                Authenticating session, updating resume file input (#attachCV), and confirming 'Active Just Now' status badge.
              </span>
            </div>
          </div>
        )}

        {/* Config & Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Credentials Card */}
          <form onSubmit={handleSaveCredentials} className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-500" />
                <span>Naukri Account Credentials</span>
              </span>
              <span className="text-[10px] text-slate-400">Stored securely in local sandbox</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                Naukri Login Email / Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="e.g. tksanthosh494@gmail.com"
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                Naukri Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-1.5 text-xs pr-8 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.headless}
                  onChange={handleHeadlessToggle}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Run Headless (Silent background)</span>
              </label>

              <button
                type="submit"
                disabled={savingCreds}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1"
              >
                {savingCreds ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                <span>Save Credentials</span>
              </button>
            </div>
          </form>

          {/* Quarter-Day Resdex Hack Strategy Info Card */}
          <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex flex-col justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Quarter-Day Upload Schedule (Every 6 Hours)</span>
              </span>
              <p className="text-xs text-emerald-800 dark:text-emerald-300/90 leading-relaxed">
                Naukri ranks candidate profiles by <strong>Last Active / Updated timestamp</strong>. Your resume will be uploaded across 4 daily peak recruiter search windows:
              </p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-emerald-200 dark:border-emerald-800/60 text-xs">
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 block">🌅 Slot 1: 10:00 AM</span>
                  <span className="text-[10px] text-slate-500">Peak Morning Search</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-emerald-200 dark:border-emerald-800/60 text-xs">
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 block">☀️ Slot 2: 04:00 PM</span>
                  <span className="text-[10px] text-slate-500">Afternoon Hiring Review</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-emerald-200 dark:border-emerald-800/60 text-xs">
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 block">🌙 Slot 3: 10:00 PM</span>
                  <span className="text-[10px] text-slate-500">Late Evening Sourcing</span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded border border-emerald-200 dark:border-emerald-800/60 text-xs">
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 block">🌌 Slot 4: 04:00 AM</span>
                  <span className="text-[10px] text-slate-500">Early Index Freshness</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/60 flex justify-between items-center text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
              <span>Last Upload: {config.lastUploadAt ? new Date(config.lastUploadAt).toLocaleTimeString() : 'Not yet'}</span>
              <span>Next Upload Slot: {config.nextUploadAt ? new Date(config.nextUploadAt).toLocaleTimeString() : '10:00 AM'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Upload History Feed Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
        <div className="flex justify-between items-center">
          <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-500" />
            <span>Naukri Upload & Profile Boost History ({history.length})</span>
          </h3>
          <button
            onClick={fetchConfigAndHistory}
            className="text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 font-semibold"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {history.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs italic border border-slate-100 dark:border-slate-800 rounded-lg">
            No upload history recorded yet. Click "Boost Profile Now" above or save your credentials to begin automatic quarter-day updates!
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto touch-scroll">
            <table className="w-full text-left text-xs border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                  <th className="p-3">Upload Timestamp</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Profile Status Message</th>
                  <th className="p-3">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        item.status === 'success'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                      }`}>
                        {item.status === 'success' ? '🟢 Active Just Now' : '🔴 Failed'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-800 dark:text-slate-200">
                      {item.profileStatus || item.message || item.error || 'Resume Refreshed'}
                    </td>
                    <td className="p-3 font-mono text-slate-500 dark:text-slate-400">
                      {item.duration || '8s'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}