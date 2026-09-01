import React, { useState, useEffect, useRef } from 'react';
import { Mail, FileText, Settings, Sparkles, Send, Plus, Trash2, CheckCircle, XCircle, LogOut, Loader2, ArrowRight, History, Download, Eye, Search, UploadCloud, Globe, Clock, Bookmark, User, UserCheck, Shield, ShieldCheck, ShieldAlert, Users, Activity, Layers, Radio, AlertCircle, Sun, Moon, TrendingUp, Lock, RefreshCw, Check, Key, Copy, ExternalLink, Briefcase } from 'lucide-react';

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

  const isAdmin = Boolean(isAuthorized && currentUser?.email && (currentUser.email).toLowerCase().trim() === 'tksanthosh494@gmail.com');
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
      if (data.authorized && data.user) {
        setIsAuthorized(true);
        const updated = { ...user, ...data.user, userKey: data.userKey || user?.userKey };
        setCurrentUser(updated);
        localStorage.setItem('cold_email_user', JSON.stringify(updated));
      } else {
        setIsAuthorized(false);
        setCurrentUser(null);
        localStorage.removeItem('cold_email_user');
        localStorage.removeItem('cold_email_jwt');
      }
    } catch (e) {
      console.error('Failed to check auth status', e);
      setIsAuthorized(false);
      setCurrentUser(null);
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
    showToast('Logged out successfully. Please sign in to access your workspace.', 'info');
  };

  if (!currentUser && !checkingAuth) {
    return (
      <>
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
        <LoginPage onConnectGmail={handleConnectGmail} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      </>
    );
  }

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
              <h1 className="text-sm sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-tight">emailSender <span className="font-normal text-slate-400">|</span> Cold Reach AI</h1>
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

        {/* Dedicated Admin Tab - Visible ONLY for tksanthosh494@gmail.com */}
        {isAdmin && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`py-2.5 sm:py-3 px-2.5 sm:px-2 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'admin'
                ? 'border-purple-600 dark:border-purple-400 text-purple-700 dark:text-purple-300 bg-purple-50/60 dark:bg-purple-950/30'
                : 'border-transparent text-purple-600/80 dark:text-purple-400/80 hover:text-purple-900 dark:hover:text-purple-100 hover:bg-purple-50/30'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 dark:text-purple-400 animate-pulse" />
            <span>Admin Console</span>
            <span className="text-[9px] bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 px-1.5 py-0.2 rounded-full font-mono">
              MASTER
            </span>
          </button>
        )}
      </div>

      {/* Main Content (Preserved in Memory) */}
      <main className="flex-1 p-3 sm:p-6 overflow-y-auto max-w-7xl w-full mx-auto touch-scroll">
        <div className={activeTab === 'single' ? 'block' : 'hidden'}>
          <SingleSender isAuthorized={isAuthorized} showToast={showToast} currentUser={currentUser} />
        </div>
        <div className={activeTab === 'bulk' ? 'block' : 'hidden'}>
          <BulkSender isAuthorized={isAuthorized} showToast={showToast} currentUser={currentUser} />
        </div>
        <div className={activeTab === 'logs' ? 'block' : 'hidden'}>
          <LogsViewer showToast={showToast} isActive={activeTab === 'logs'} currentUser={currentUser} />
        </div>
        <div className={activeTab === 'jdtailor' ? 'block' : 'hidden'}>
          <JdResumeTailor showToast={showToast} currentUser={currentUser} />
        </div>
        <div className={activeTab === 'linkedin' ? 'block' : 'hidden'}>
          <LinkedInAutoPilot isAuthorized={isAuthorized} showToast={showToast} isActive={activeTab === 'linkedin'} currentUser={currentUser} />
        </div>
        <div className={activeTab === 'naukri' ? 'block' : 'hidden'}>
          <NaukriAutoUploader showToast={showToast} isActive={activeTab === 'naukri'} currentUser={currentUser} />
        </div>
        <div className={activeTab === 'resume' ? 'block' : 'hidden'}>
          <ResumeEditor showToast={showToast} currentUser={currentUser} />
        </div>
        {isAdmin && (
          <div className={activeTab === 'admin' ? 'block' : 'hidden'}>
            <AdminDashboard showToast={showToast} isActive={activeTab === 'admin'} currentUser={currentUser} />
          </div>
        )}
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
function LogsViewer({ showToast, isActive, currentUser }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const getCachedLogs = () => {
    try {
      const user = currentUser || JSON.parse(localStorage.getItem('cold_email_user') || '{}');
      const key = `cold_email_logs_${user.userKey || 'default'}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  };

  const setCachedLogs = (data) => {
    try {
      const user = currentUser || JSON.parse(localStorage.getItem('cold_email_user') || '{}');
      const key = `cold_email_logs_${user.userKey || 'default'}`;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
  };

  const fetchLogs = async () => {
    if (!currentUser) {
      setLogs([]);
      setLoading(false);
      return;
    }
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
  }, [isActive, currentUser]);

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
function ResumeEditor({ showToast, currentUser }) {
  const [resumeData, setResumeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fetchResume = async () => {
    if (!currentUser) {
      setResumeData(null);
      setLoading(false);
      return;
    }
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
  }, [currentUser]);

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

  if (!currentUser) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center flex flex-col items-center justify-center gap-4 max-w-lg mx-auto my-12 shadow-sm">
        <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl">
          <FileText className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Sign in to Edit Your Base Resume</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            Upload your resume PDF or customize your experience, skills, and personal information privately under your Google account.
          </p>
        </div>
      </div>
    );
  }

  if (loading || !resumeData) {
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
function JdResumeTailor({ showToast, currentUser }) {
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
      const user = currentUser || JSON.parse(localStorage.getItem('cold_email_user') || '{}');
      const key = `cold_email_apps_${user.userKey || 'default'}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  };

  const setCachedApps = (data) => {
    try {
      const user = currentUser || JSON.parse(localStorage.getItem('cold_email_user') || '{}');
      const key = `cold_email_apps_${user.userKey || 'default'}`;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
  };

  const fetchApplications = async () => {
    if (!currentUser) {
      setApplications([]);
      setLoadingApps(false);
      return;
    }
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
  }, [currentUser]);

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
  const [batchStatusMap, setBatchStatusMap] = useState({});
  const [searchKeywords, setSearchKeywords] = useState('Full Stack Developer, MERN Stack, React.js, Node.js, Express, Bangalore, Remote');
  const [newCustomTime, setNewCustomTime] = useState('09:30');
  const [config, setConfig] = useState({
    enabled: true,
    scheduleMode: 'interval',
    intervalHours: 4,
    intervalMinutes: 240,
    customSlots: ['09:30 AM', '01:30 PM', '05:30 PM', '09:30 PM'],
    keywords: 'Full Stack Developer, MERN Stack, React.js, Node.js, Express, Bangalore, Remote',
    timeFrame: '3d',
    mode: 'send',
    targetPerRun: 15,
    lastRunAt: null,
    nextRunAt: null
  });
  const [selectedLead, setSelectedLead] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [tailoredPreview, setTailoredPreview] = useState(null);
  const [viewMode, setViewMode] = useState('cards');
  const [scanningBounces, setScanningBounces] = useState(false);
  const [bounceCount, setBounceCount] = useState(0);

  const fetchConfig = async () => {
    try {
      const res = await apiFetch('/api/linkedin/config');
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
        if (data.config.keywords) setSearchKeywords(data.config.keywords);
      }
    } catch (e) {}
  };

  const handleScanBounces = async () => {
    if (!isAuthorized) return showToast('Please connect your Gmail account via OAuth first.', 'error');
    setScanningBounces(true);
    try {
      const res = await apiFetch('/api/mail/bounces/scan', { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBounceCount(data.totalBlacklisted || 0);
      if (data.newBouncesDetected > 0) {
        showToast(`🛡️ Anti-Bounce Active: ${data.newBouncesDetected} dead bounce addresses detected & blacklisted from Gmail!`, 'success');
      } else {
        showToast(`🛡️ Gmail Inbox Clean! All ${data.totalBlacklisted || 0} blacklisted bounce addresses are blocked.`, 'info');
      }
      handleScanLeads();
    } catch (e) {
      showToast(e.message || 'Failed to scan Gmail bounces', 'error');
    } finally {
      setScanningBounces(false);
    }
  };

  const handleTimeFrameChange = async (newTf) => {
    const updated = { ...config, timeFrame: newTf };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`Timeframe updated to ${newTf.toUpperCase()}! Searching fresh recruiter posts...`, 'info');
      handleScanLeads(searchKeywords, newTf);
    } catch (e) {
      showToast('Failed to update timeframe', 'error');
    }
  };

  const handleParsePastedPost = async () => {
    if (!pastedPostText.trim()) return;
    setParsingPasted(true);
    try {
      const isUrl = pastedPostText.trim().startsWith('http') || pastedPostText.trim().includes('linkedin.com/jobs/');
      const endpoint = isUrl ? '/api/linkedin/scrape-job' : '/api/linkedin/parse-post';
      const payload = isUrl ? { url: pastedPostText.trim() } : { text: pastedPostText.trim() };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setLeads(prev => [data.lead, ...prev.filter(l => l.email.toLowerCase() !== data.lead.email.toLowerCase())]);
      setPastedPostText('');
      showToast(`🎯 Extracted real HR: ${data.lead.recruiterName} (${data.lead.email}) from ${data.lead.company}! Verified deliverable.`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to parse job post', 'error');
    } finally {
      setParsingPasted(false);
    }
  };

  const handleScanLeads = async (queryOverride = null, timeFrameOverride = null, triggerAutoSend = false) => {
    const query = queryOverride || searchKeywords || config.keywords || 'MERN Stack Developer React Node.js';
    const tf = timeFrameOverride || config.timeFrame || '3d';
    setScanning(true);
    try {
      const res = await apiFetch('/api/linkedin/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, count: config.targetPerRun || 15, timeFrame: tf })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const fetchedLeads = data.leads || [];
      setLeads(fetchedLeads);
      showToast(`Discovered ${fetchedLeads.length} live recruiter hiring posts (${tf.toUpperCase()})!`, 'success');

      // 100% Autonomous Send: If Auto-Dispatch is active or explicitly triggered, send one-by-one immediately!
      const shouldAutoSend = triggerAutoSend || (config.autoDispatch !== false && config.enabled);
      if (shouldAutoSend && fetchedLeads.length > 0 && isAuthorized) {
        const uncontacted = fetchedLeads.filter(l => !l.alreadyContacted);
        if (uncontacted.length > 0) {
          showToast(`⚡ Auto-Pilot: Automatically sending tailored 1-page PDF emails to ${uncontacted.length} HRs one-by-one...`, 'info');
          setTimeout(() => {
            handleRunBatchOutreach(fetchedLeads);
          }, 600);
        }
      }
    } catch (e) {
      showToast(e.message || 'Failed to discover LinkedIn posts', 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleToggleAutoPilot = async () => {
    const updated = { ...config, enabled: !config.enabled };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(updated.enabled ? 'LinkedIn Auto-Pilot is now ACTIVE! Searching & auto-sending...' : 'LinkedIn Auto-Pilot paused.', 'info');
      if (updated.enabled) {
        handleScanLeads(null, null, true);
      }
    } catch (e) {
      showToast('Failed to update config', 'error');
    }
  };

  const handleModeChange = async (newMode) => {
    const updated = { ...config, mode: newMode };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`Outreach mode set to ${newMode === 'send' ? 'Instant Send via Gmail' : 'Save Drafts in Gmail'}`, 'info');
    } catch (e) {
      showToast('Failed to update mode', 'error');
    }
  };

  const handleTargetCountChange = async (count) => {
    const updated = { ...config, targetPerRun: parseInt(count, 10) || 10 };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`Outreach volume set to ${count} emails per run`, 'info');
    } catch (e) {}
  };

  const handleScheduleModeChange = async (mode) => {
    const updated = { ...config, scheduleMode: mode };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`LinkedIn schedule mode set to ${mode === 'custom' ? 'Custom Daily Timings' : 'Periodic Interval'}!`, 'success');
    } catch (e) {
      showToast('Failed to update schedule mode', 'error');
    }
  };

  const handleIntervalChange = async (hoursStr) => {
    const hrs = parseFloat(hoursStr);
    const mins = Math.round(hrs * 60);
    const updated = { ...config, scheduleMode: 'interval', intervalHours: hrs, intervalMinutes: mins };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`Auto-Pilot scheduled to run every ${hrs >= 1 ? hrs + ' hours' : mins + ' minutes'}!`, 'success');
    } catch (e) {
      showToast('Failed to update interval', 'error');
    }
  };

  const handleAddCustomSlot = async (time24) => {
    if (!time24) return;
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const formatted = `${String(h).padStart(2, '0')}:${m} ${ampm}`;

    const current = Array.isArray(config.customSlots) ? config.customSlots : ['09:30 AM', '01:30 PM', '05:30 PM', '09:30 PM'];
    if (current.includes(formatted)) {
      return showToast(`Slot ${formatted} already exists in your schedule!`, 'info');
    }
    const updatedSlots = [...current, formatted];
    const updated = { ...config, scheduleMode: 'custom', customSlots: updatedSlots };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`Added custom timing slot: ${formatted}! Next run recalculated.`, 'success');
    } catch (e) {
      showToast('Failed to add custom timing', 'error');
    }
  };

  const handleRemoveCustomSlot = async (slotToRemove) => {
    const current = Array.isArray(config.customSlots) ? config.customSlots : [];
    const updatedSlots = current.filter(s => s !== slotToRemove);
    if (updatedSlots.length === 0) {
      return showToast('You must maintain at least 1 active timing slot.', 'error');
    }
    const updated = { ...config, scheduleMode: 'custom', customSlots: updatedSlots };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`Removed time slot: ${slotToRemove}`, 'info');
    } catch (e) {
      showToast('Failed to update custom slots', 'error');
    }
  };

  const handleApplyPresetSlots = async (presetList, presetName) => {
    const updated = { ...config, scheduleMode: 'custom', customSlots: presetList };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`Applied preset: ${presetName}! (${presetList.length} slots)`, 'success');
    } catch (e) {
      showToast('Failed to apply preset', 'error');
    }
  };

  const handleSaveKeywords = async (newKeywords) => {
    const updated = { ...config, keywords: newKeywords };
    setConfig(updated);
    try {
      await apiFetch('/api/linkedin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast('Updated LinkedIn search keywords! Discovering fresh live posts & sending...', 'success');
      handleScanLeads(newKeywords, null, true);
    } catch (e) {
      showToast('Failed to update keywords', 'error');
    }
  };

  const handleRunBatchOutreach = async (leadsOverride = null) => {
    if (!isAuthorized) return showToast('Please connect your Gmail account via OAuth first.', 'error');

    const sourceLeads = leadsOverride || leads;
    const uncontacted = sourceLeads.filter(l => !l.alreadyContacted).slice(0, config.targetPerRun || 15);
    if (uncontacted.length === 0) {
      return showToast('No fresh uncontacted leads available in this batch. Click Discover Live Posts to find more!', 'info');
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
        const jdContext = `Role: ${lead.role}\nCompany: ${lead.company}\nJob Description / Recruiter Hiring Post (Posted ${lead.postedDaysAgo || 1}d ago):\n${lead.postSnippet}`;
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
            resumeType: 'Tailored (LinkedIn Live Post)',
            jdSnippet: lead.postSnippet
          })
        });
        const sendData = await sendRes.json();
        if (sendData.error) throw new Error(sendData.error);

        setBatchStatusMap(prev => ({ ...prev, [lead.id]: 'success' }));
        successCount++;

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
    fetchConfig();
  };

  const handlePreviewLead = async (lead) => {
    setSelectedLead(lead);
    setPreviewing(true);
    setTailoredPreview(null);
    try {
      const jdContext = `Role: ${lead.role}\nCompany: ${lead.company}\nJob Description / Recruiter Hiring Post (Posted ${lead.postedDaysAgo || 1}d ago):\n${lead.postSnippet}`;
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
      const jdContext = `Role: ${lead.role}\nCompany: ${lead.company}\nJob Description / Recruiter Hiring Post (Posted ${lead.postedDaysAgo || 1}d ago):\n${lead.postSnippet}`;
      const genRes = await apiFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lead.email, jd: jdContext, company: lead.company, hrName: lead.recruiterName })
      });
      const genData = await genRes.json();

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
          resumeType: 'Tailored (LinkedIn Live Post)',
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
      {/* 1. Auto-Pilot Control Center Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Globe className="w-5 h-5 text-sky-500" />
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">LinkedIn Recruiter Live Job Hunter & Auto-Pilot</h2>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                config.enabled 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
              }`}>
                {config.enabled ? `● AUTO-PILOT ACTIVE (${config.scheduleMode === 'custom' ? (config.customSlots?.length || 4) + ' CUSTOM DAILY SLOTS' : 'EVERY ' + (config.intervalHours || 4) + ' HOURS'})` : '○ PAUSED'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Continuously searches live recruiter hiring posts with your target keywords, verifies corporate MX email servers, and automatically dispatches tailored 1-page resumes at your scheduled interval or exact daily times.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleScanBounces}
              disabled={scanningBounces}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs border bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
              title="Scans Gmail for undeliverable bounce emails and auto-blacklists failed recipients"
            >
              {scanningBounces ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3 text-amber-600" />}
              <span>{scanningBounces ? 'Scanning Bounces...' : '🛡️ Scan Bounces'}</span>
            </button>

            <button
              onClick={handleToggleAutoPilot}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs border ${
                config.enabled
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent'
              }`}
            >
              {config.enabled ? 'Pause Scheduler' : '▶ Activate Auto-Pilot'}
            </button>

            {/* Schedule Frequency Selector */}
            <select
              value={config.scheduleMode === 'custom' ? 'custom' : String(config.intervalHours || 4)}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  handleScheduleModeChange('custom');
                } else {
                  handleIntervalChange(e.target.value);
                }
              }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
              title="Auto-Pilot Execution Schedule"
            >
              <option value="4">⏱️ Every 4 Hours (Recommended Peak Hiring)</option>
              <option value="6">⏱️ Every 6 Hours</option>
              <option value="2">⏱️ Every 2 Hours</option>
              <option value="1">⏱️ Every 1 Hour</option>
              <option value="0.5">⏱️ Every 30 Minutes</option>
              <option value="12">⏱️ Every 12 Hours</option>
              <option value="24">⏱️ Every 24 Hours (Daily)</option>
              <option value="custom">🎯 Custom Timings (Add Exact Daily Times)</option>
            </select>

            {/* Volume per run */}
            <select
              value={config.targetPerRun || 10}
              onChange={(e) => handleTargetCountChange(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
              title="Outreach Volume per Batch"
            >
              <option value="5">📦 5 Leads / Run</option>
              <option value="10">📦 10 Leads / Run</option>
              <option value="15">📦 15 Leads / Run</option>
            </select>

            {/* Mode: Send vs Draft */}
            <select
              value={config.mode || 'send'}
              onChange={(e) => handleModeChange(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="send">⚡ Auto-Send via Gmail</option>
              <option value="draft">📝 Save Drafts in Gmail</option>
            </select>
          </div>
        </div>

        {/* Custom Timings Interactive Manager (when custom mode is selected) */}
        {config.scheduleMode === 'custom' && (
          <div className="p-4 bg-sky-50/60 dark:bg-sky-950/20 rounded-xl border border-sky-200 dark:border-sky-800/60 flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-sky-900 dark:text-sky-300 uppercase tracking-wider flex items-center gap-1.5 mb-0.5">
                  <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>Custom Daily LinkedIn Outreach Timings ({(config.customSlots || []).length} Active Slots)</span>
                </span>
                <p className="text-[11px] text-sky-800 dark:text-sky-300/90">
                  Set specific times throughout the day when Auto-Pilot should search for new recruiter posts and send emails.
                </p>
              </div>
              <span className="text-[10px] font-bold bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 px-2 py-0.5 rounded-full border border-sky-300 dark:border-sky-700">
                Custom Mode Active
              </span>
            </div>

            {/* Add Custom Time Row */}
            <div className="flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 p-2 rounded-xl border border-sky-200 dark:border-sky-800/60">
              <input
                type="time"
                value={newCustomTime}
                onChange={(e) => setNewCustomTime(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={() => handleAddCustomSlot(newCustomTime)}
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Time Slot</span>
              </button>
            </div>

            {/* Active Time Slot Chips */}
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              {(config.customSlots || ['09:30 AM', '01:30 PM', '05:30 PM', '09:30 PM']).map((slot, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200 px-2.5 py-1 rounded-lg text-xs font-mono font-bold shadow-xs group"
                >
                  <Clock className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  <span>{slot}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomSlot(slot)}
                    className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs ml-0.5"
                    title={`Remove ${slot}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-sky-200 dark:border-sky-800/40">
              <span className="text-[10px] text-sky-700 dark:text-sky-400 font-bold uppercase">Presets:</span>
              <button
                type="button"
                onClick={() => handleApplyPresetSlots(['09:30 AM', '01:30 PM', '05:30 PM', '09:30 PM'], '4 Peak Hiring')}
                className="text-[10px] bg-sky-100/70 hover:bg-sky-200/80 dark:bg-sky-900/40 dark:hover:bg-sky-800/60 text-sky-800 dark:text-sky-200 font-semibold px-2 py-0.5 rounded border border-sky-200 dark:border-sky-700 transition-colors cursor-pointer"
              >
                ✨ 4 Peak Hiring
              </button>
              <button
                type="button"
                onClick={() => handleApplyPresetSlots(['10:00 AM', '01:00 PM', '04:00 PM', '07:00 PM'], 'Workday')}
                className="text-[10px] bg-sky-100/70 hover:bg-sky-200/80 dark:bg-sky-900/40 dark:hover:bg-sky-800/60 text-sky-800 dark:text-sky-200 font-semibold px-2 py-0.5 rounded border border-sky-200 dark:border-sky-700 transition-colors cursor-pointer"
              >
                🏢 Workday
              </button>
              <button
                type="button"
                onClick={() => handleApplyPresetSlots(['08:30 AM', '11:30 AM', '02:30 PM', '05:30 PM', '08:30 PM', '11:30 PM'], '6 Daily Slots')}
                className="text-[10px] bg-sky-100/70 hover:bg-sky-200/80 dark:bg-sky-900/40 dark:hover:bg-sky-800/60 text-sky-800 dark:text-sky-200 font-semibold px-2 py-0.5 rounded border border-sky-200 dark:border-sky-700 transition-colors cursor-pointer"
              >
                ⚡ 6 Daily Slots
              </button>
            </div>
          </div>
        )}

        {/* 2. Recruiter Post Timeframe Filter & Search Keywords */}
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-sky-500" />
                <span>Hiring Post Timeframe:</span>
              </span>
              {[
                { id: '24h', label: '🕒 Past 24 Hours' },
                { id: '3d', label: '⚡ Past 3 Days' },
                { id: '7d', label: '📅 Past 1 Week' },
                { id: '30d', label: '🗓️ Past 1 Month' },
                { id: 'all', label: '🌐 All Active' }
              ].map(tf => (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => handleTimeFrameChange(tf.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                    (config.timeFrame || '3d') === tf.id
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Next Scheduled Run: <strong className="text-sky-600 dark:text-sky-400">{config.nextRunAt ? new Date(config.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}</strong>
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={searchKeywords}
              onChange={(e) => setSearchKeywords(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKeywords(searchKeywords); }}
              placeholder="e.g. MERN Stack, React.js, Node.js, Express, Bangalore, Remote, 3+ YOE"
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-sky-500"
            />
            <button
              onClick={() => handleSaveKeywords(searchKeywords)}
              disabled={scanning || dispatching}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="Search and harvest fresh live recruiter posts"
            >
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>{scanning ? 'Searching Live Posts...' : 'Discover Live Posts'}</span>
            </button>

            <button
              onClick={handleRunBatchOutreach}
              disabled={dispatching || scanning || leads.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
              title="Tailors 1-page resumes and sends emails continuously one-after-another"
            >
              {dispatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{dispatching ? 'Auto-Sending Batch...' : `🚀 1-Click Auto-Send All (${leads.filter(l => !l.alreadyContacted).length})`}</span>
            </button>
          </div>

          {/* Quick Keyword Preset Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold">Quick Keyword Presets:</span>
            {[
              'Full Stack Developer (React & Node.js)',
              'MERN Stack Engineer (3+ YOE)',
              'Backend Developer (Node.js/Microservices)',
              'Frontend Developer (React.js/Next.js)',
              'Bangalore / Remote Product Startups'
            ].map((kw, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setSearchKeywords(kw);
                  handleSaveKeywords(kw);
                }}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                + {kw}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Quick Paste Recruiter Post / LinkedIn Job URL Card */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Paste Any LinkedIn Job URL (e.g. linkedin.com/jobs/view/...) or Recruiter Post</span>
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Auto-extracts real HR & verifies deliverability (0% bounce)
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={pastedPostText}
              onChange={(e) => setPastedPostText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleParsePastedPost(); }}
              placeholder='e.g. "https://www.linkedin.com/jobs/view/4158392019" or "Hiring MERN Stack Lead at Swiggy. Drop CV to priya@swiggy.in"'
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleParsePastedPost}
              disabled={parsingPasted || !pastedPostText.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
            >
              {parsingPasted ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{parsingPasted ? 'Extracting HR...' : 'Extract HR & Queue'}</span>
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

      {/* 2. Discovered Recruiter Leads Feed */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-500" />
              <span>Live LinkedIn Job Posts & Extracted HR Contacts ({leads.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {leads.filter(l => !l.alreadyContacted).length} fresh leads queued for 100% automatic background email dispatch
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 flex text-xs">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                📇 LinkedIn Post Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                📋 Compact Table
              </button>
            </div>
          </div>
        </div>

        {leads.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs italic border border-slate-100 dark:border-slate-800 rounded-lg">
            {scanning ? 'Searching live LinkedIn recruiter posts matching your keywords...' : 'No leads discovered yet. Click "Discover Live Posts" above to find fresh hiring posts!'}
          </div>
        ) : viewMode === 'cards' ? (
          /* Rich LinkedIn Social Post Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {leads.map((lead) => {
              const currentStatus = batchStatusMap[lead.id];
              const initials = (lead.recruiterName || lead.company || 'HR')
                .split(' ')
                .map(w => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

              return (
                <div
                  key={lead.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-3 relative overflow-hidden"
                >
                  {/* LinkedIn Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm">
                        {initials}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100">{lead.recruiterName || 'Talent Acquisition'}</span>
                          <span className="text-[10px] text-slate-400">• Hiring at</span>
                          <span className="font-bold text-xs text-sky-600 dark:text-sky-400">{lead.company}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span>{lead.postedDaysAgo ? `${lead.postedDaysAgo}d ago` : 'Recent'}</span>
                          <span>•</span>
                          <span className="flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" /> Public Post</span>
                          {lead.isLive && (
                            <span className="bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-bold px-1.5 py-0.2 rounded text-[9px] border border-sky-200 dark:border-sky-800">
                              LIVE DISCOVERY
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <a
                      href={lead.sourceUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(lead.company)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Open job post on LinkedIn"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  {/* Target Role Pill */}
                  <div className="inline-flex items-center gap-1.5 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200/80 dark:border-indigo-800/60 self-start">
                    <Briefcase className="w-3 h-3 text-indigo-500" />
                    <span>{lead.role}</span>
                  </div>

                  {/* Verbatim LinkedIn Post Snippet Box */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 text-xs text-slate-700 dark:text-slate-300 leading-relaxed italic">
                    "{lead.postSnippet}"
                  </div>

                  {/* Extracted Contact Email Badge */}
                  <div className="flex items-center justify-between gap-2 bg-sky-50/50 dark:bg-sky-950/20 p-2.5 rounded-lg border border-sky-100 dark:border-sky-900/40">
                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-sky-900 dark:text-sky-300">
                      <Mail className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      <span>{lead.email}</span>
                    </div>
                    {lead.isVerified && (
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-bold border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                        <CheckCircle className="w-2.5 h-2.5" /> MX Verified
                      </span>
                    )}
                  </div>

                  {/* Direct LinkedIn Job Post Link Bar */}
                  <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/70 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-1.5 min-w-0 text-slate-700 dark:text-slate-300">
                      <Globe className="w-3.5 h-3.5 text-[#0A66C2] shrink-0" />
                      <span className="text-[11px] font-bold shrink-0">Job Link:</span>
                      <a
                        href={lead.sourceUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(lead.company + ' ' + lead.role)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[#0A66C2] dark:text-sky-400 hover:underline font-mono truncate"
                      >
                        {lead.sourceUrl ? lead.sourceUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 32) + '...' : `linkedin.com/jobs/${lead.company.toLowerCase()}`}
                      </a>
                    </div>

                    <a
                      href={lead.sourceUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(lead.company + ' ' + lead.role)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#0A66C2] hover:bg-[#004182] text-white text-[10px] font-bold px-2.5 py-1 rounded flex items-center gap-1 shrink-0 transition-colors shadow-xs"
                      title="Open job post directly on LinkedIn"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View on LinkedIn</span>
                    </a>
                  </div>

                  {/* Outreach Status & Actions Footer */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[10px]">
                      {currentStatus === 'tailoring' ? (
                        <span className="text-amber-600 font-bold flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Tailoring PDF...</span>
                      ) : currentStatus === 'sending' ? (
                        <span className="text-sky-600 font-bold flex items-center gap-1"><Send className="w-3 h-3 animate-pulse" /> Sending Mail...</span>
                      ) : currentStatus === 'success' ? (
                        <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Sent Just Now</span>
                      ) : lead.alreadyContacted ? (
                        <span className="text-slate-400 font-semibold flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Already Contacted</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> Ready for Auto-Pilot
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePreviewLead(lead)}
                        className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                        title="Preview Tailored Resume & Cold Email"
                      >
                        <Eye className="w-3 h-3" /> <span>Preview</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendSingleLead(lead)}
                        disabled={dispatching || lead.alreadyContacted}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-xs font-bold transition-all shadow-xs flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                        title="Tailor and send 1-page PDF directly to recruiter"
                      >
                        <Send className="w-3 h-3" /> <span>Send Now</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Compact Table View */
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto touch-scroll">
            <table className="w-full text-left text-xs border-collapse min-w-[750px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                  <th className="p-3">Company & Recruiter</th>
                  <th className="p-3">Extracted Contact Email</th>
                  <th className="p-3">Posted Window</th>
                  <th className="p-3">LinkedIn Hiring Post</th>
                  <th className="p-3">Auto-Pilot Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {leads.map((lead) => {
                  const currentStatus = batchStatusMap[lead.id];
                  return (
                    <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span>{lead.company}</span>
                          {lead.isLive && (
                            <span className="text-[9px] font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 px-1.5 py-0.2 rounded border border-sky-200 dark:border-sky-800">
                              LIVE
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500 text-[11px] font-medium">{lead.recruiterName || 'Hiring Lead'}</div>
                      </td>
                      <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                        <div className="flex items-center gap-1">
                          <span>{lead.email}</span>
                          {lead.isVerified && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold" title="Corporate DNS MX Verified">
                              ✓
                            </span>
                          )}
                        </div>
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
                        <a
                          href={lead.sourceUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(lead.company + ' ' + lead.role)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#0A66C2] dark:text-sky-400 hover:underline font-bold text-[10px] mt-1"
                          title="Open job post on LinkedIn"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>View Post on LinkedIn ↗</span>
                        </a>
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
                            <Sparkles className="w-3 h-3 text-emerald-500" /> Auto-Pilot Ready
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePreviewLead(lead)}
                            className="bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                            title="Preview tailored email & resume"
                          >
                            <Eye className="w-3.5 h-3.5" /> <span>Preview</span>
                          </button>
                          <button
                            onClick={() => handleSendSingleLead(lead)}
                            disabled={dispatching || lead.alreadyContacted}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-bold transition-all shadow-xs flex items-center gap-1 disabled:opacity-40 cursor-pointer"
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
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              {/* Direct LinkedIn Job Link Bar in Modal */}
              <div className="flex items-center justify-between p-2.5 bg-sky-50 dark:bg-sky-950/40 rounded-lg border border-sky-200 dark:border-sky-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="w-4 h-4 text-[#0A66C2] shrink-0" />
                  <span className="font-bold text-sky-900 dark:text-sky-200 truncate">LinkedIn Recruiter Post</span>
                </div>
                <a
                  href={selectedLead.sourceUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(selectedLead.company + ' ' + selectedLead.role)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#0A66C2] hover:bg-[#004182] text-white font-bold px-3 py-1 rounded-md text-xs flex items-center gap-1 transition-colors shadow-xs shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Post on LinkedIn ↗</span>
                </a>
              </div>

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
                className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => handleSendSingleLead(selectedLead)}
                disabled={dispatching}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
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
function NaukriAutoUploader({ showToast, isActive, currentUser }) {
  const [config, setConfig] = useState({
    enabled: true,
    scheduleMode: 'quarter_day',
    slots: ['10:00 AM', '04:00 PM', '10:00 PM', '04:00 AM'],
    customSlots: ['09:30 AM', '01:30 PM', '04:30 PM', '06:30 PM'],
    intervalHours: 6,
    intervalMinutes: 360,
    username: '',
    password: '',
    hasSession: false,
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
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  const [otpError, setOtpError] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Naukri Easy Apply & Smart Q&A Memory State
  const [qaItems, setQaItems] = useState([]);
  const [pendingQuestions, setPendingQuestions] = useState([]);
  const [appliedJobs, setAppliedJobs] = useState([]);
  const [applyKeywords, setApplyKeywords] = useState('Full Stack Developer MERN React Node.js');
  const [applyTargetCount, setApplyTargetCount] = useState(10);
  const [isAutoApplying, setIsAutoApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(null);
  const [showNewQaModal, setShowNewQaModal] = useState(false);
  const [newQaForm, setNewQaForm] = useState({ question: '', answer: '', category: 'Skills' });
  const [pendingAnswerInputs, setPendingAnswerInputs] = useState({});

  const fetchQaAndAppliedJobs = async () => {
    if (!currentUser) return;
    try {
      const [qaRes, pendRes, appRes] = await Promise.all([
        apiFetch('/api/naukri/qa'),
        apiFetch('/api/naukri/qa/pending'),
        apiFetch('/api/naukri/apply/history')
      ]);
      const qaData = await qaRes.json();
      const pendData = await pendRes.json();
      const appData = await appRes.json();

      if (Array.isArray(qaData.qaItems)) setQaItems(qaData.qaItems);
      if (Array.isArray(pendData.pending)) setPendingQuestions(pendData.pending);
      if (Array.isArray(appData.applications)) setAppliedJobs(appData.applications);
    } catch (e) {}
  };

  const handleSaveNewQa = async (e) => {
    e?.preventDefault();
    if (!newQaForm.question.trim() || !newQaForm.answer.trim()) {
      return showToast('Please enter both question and answer', 'error');
    }
    try {
      const res = await apiFetch('/api/naukri/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQaForm)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQaItems(data.qaItems || []);
      setShowNewQaModal(false);
      setNewQaForm({ question: '', answer: '', category: 'Skills' });
      showToast('Saved Q&A answer into memory DB!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save Q&A', 'error');
    }
  };

  const handleDeleteQa = async (id) => {
    try {
      const res = await apiFetch(`/api/naukri/qa/${id}`, { method: 'DELETE' });
      const data = await res.json();
      setQaItems(data.qaItems || []);
      showToast('Deleted Q&A memory record', 'info');
    } catch (err) {
      showToast('Failed to delete Q&A', 'error');
    }
  };

  const handleResolvePendingQuestion = async (pendingId) => {
    const answer = (pendingAnswerInputs[pendingId] || '').trim();
    if (!answer) return showToast('Please type your answer first.', 'error');

    try {
      const res = await apiFetch('/api/naukri/qa/answer-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pendingId, answer })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPendingQuestions(data.pending || []);
      setQaItems(data.qaItems || []);
      showToast('Saved answer into database and resumed application!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to submit answer', 'error');
    }
  };

  const handleStartAutoApply = async () => {
    setIsAutoApplying(true);
    setApplyProgress({ current: 1, total: applyTargetCount, status: 'Scanning matching Easy Apply jobs on Naukri...' });
    showToast(`🚀 Starting Naukri Easy Apply Bot for: ${applyKeywords}...`, 'info');

    try {
      const res = await apiFetch('/api/naukri/apply/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: applyKeywords, targetCount: applyTargetCount })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showToast(`🎉 Applied to ${data.appliedCount || 0} jobs on Naukri with 100% automated screening!`, 'success');
      fetchQaAndAppliedJobs();
    } catch (err) {
      showToast(err.message || 'Failed to run Naukri auto-apply', 'error');
    } finally {
      setIsAutoApplying(false);
      setApplyProgress(null);
    }
  };

  const fetchConfigAndHistory = async () => {
    if (!currentUser) {
      setConfig({
        enabled: true,
        scheduleMode: 'quarter_day',
        slots: ['10:00 AM', '04:00 PM', '10:00 PM', '04:00 AM'],
        customSlots: ['09:30 AM', '01:30 PM', '04:30 PM', '06:30 PM'],
        intervalHours: 6,
        intervalMinutes: 360,
        username: '',
        password: '',
        hasSession: false,
        headless: true,
        lastUploadAt: null,
        nextUploadAt: null,
        lastStatus: null,
        lastError: null
      });
      setFormData({ username: '', password: '' });
      setHistory([]);
      return;
    }

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
      if (Array.isArray(histData.history)) {
        setHistory(histData.history);
      }
      fetchQaAndAppliedJobs();
    } catch (e) {
      console.error('Failed fetching Naukri data', e);
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchConfigAndHistory();
      fetchQaAndAppliedJobs();
    }
  }, [isActive, currentUser]);

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

  const [newCustomTime, setNewCustomTime] = useState('09:30');

  const formatTime24to12 = (t24) => {
    if (!t24) return '';
    const [hStr, mStr] = t24.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
  };

  const handleScheduleModeChange = async (mode) => {
    const updated = { ...config, scheduleMode: mode };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/naukri/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      const modeLabels = {
        quarter_day: 'Quarter-Day (10 AM, 4 PM, 10 PM, 4 AM)',
        custom: 'Custom Timings (Add Your Own Exact Times)',
        hourly: 'Every 1 Hour',
        half_hour: 'Every 30 Minutes'
      };
      showToast(`Schedule set to ${modeLabels[mode] || mode}!`, 'success');
    } catch (e) {
      showToast('Failed to update schedule mode', 'error');
    }
  };

  const handleAddCustomSlot = async (slotTime24) => {
    if (!slotTime24) return;
    const formatted = formatTime24to12(slotTime24);
    const current = Array.isArray(config.customSlots) ? config.customSlots : ['09:30 AM', '01:30 PM', '04:30 PM', '06:30 PM'];
    if (current.includes(formatted)) {
      return showToast(`Slot ${formatted} is already in your schedule!`, 'info');
    }
    const updatedSlots = [...current, formatted];
    const updated = { ...config, scheduleMode: 'custom', customSlots: updatedSlots };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/naukri/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`Added custom timing: ${formatted}! Next upload recalculated.`, 'success');
    } catch (e) {
      showToast('Failed to add custom slot', 'error');
    }
  };

  const handleRemoveCustomSlot = async (slotToRemove) => {
    const current = Array.isArray(config.customSlots) ? config.customSlots : [];
    const updatedSlots = current.filter(s => s !== slotToRemove);
    if (updatedSlots.length === 0) {
      return showToast('You must keep at least 1 active time slot.', 'error');
    }
    const updated = { ...config, scheduleMode: 'custom', customSlots: updatedSlots };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/naukri/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`Removed time slot: ${slotToRemove}`, 'info');
    } catch (e) {
      showToast('Failed to update custom timings', 'error');
    }
  };

  const handleApplyPresetSlots = async (presetList, presetName) => {
    const updated = { ...config, scheduleMode: 'custom', customSlots: presetList };
    setConfig(updated);
    try {
      const res = await apiFetch('/api/naukri/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      showToast(`Applied preset: ${presetName}! (${presetList.length} slots)`, 'success');
    } catch (e) {
      showToast('Failed to apply preset', 'error');
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

  const [connectingSso, setConnectingSso] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [showViewCookiesModal, setShowViewCookiesModal] = useState(false);
  const [activeSessionCookiesData, setActiveSessionCookiesData] = useState(null);
  const [loadingViewCookies, setLoadingViewCookies] = useState(false);
  const [cookieInput, setCookieInput] = useState('');
  const [savingCookie, setSavingCookie] = useState(false);

  const handleOpenViewCookiesModal = async () => {
    setShowViewCookiesModal(true);
    setLoadingViewCookies(true);
    try {
      const res = await apiFetch('/api/naukri/session/cookies');
      const data = await res.json();
      setActiveSessionCookiesData(data);
    } catch (e) {
      showToast('Failed to fetch stored session cookies', 'error');
    } finally {
      setLoadingViewCookies(false);
    }
  };

  const handleLaunchGoogleSso = async () => {
    setConnectingSso(true);
    showToast('🚀 Launching desktop Chrome for Google SSO sign-in...', 'info');
    try {
      const res = await apiFetch('/api/naukri/launch-sso', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showToast('🎉 Google SSO connected successfully! Session cookies saved.', 'success');
      fetchConfigAndHistory();
    } catch (err) {
      showToast(err.message || 'Google SSO login failed', 'error');
    } finally {
      setConnectingSso(false);
    }
  };

  const handleImportCookies = async (e) => {
    e?.preventDefault();
    if (!cookieInput.trim()) {
      return showToast('Please paste your Naukri session cookies.', 'error');
    }
    setSavingCookie(true);
    try {
      const res = await apiFetch('/api/naukri/import-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookieInput.trim() })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setShowCookieModal(false);
      setCookieInput('');
      showToast(data.message || '🎉 Naukri session linked successfully! Auto-boosts are now active.', 'success');
      fetchConfigAndHistory();
    } catch (err) {
      showToast(err.message || 'Failed to import session cookies', 'error');
    } finally {
      setSavingCookie(false);
    }
  };

  const handleDisconnectSession = async () => {
    if (!window.confirm('Disconnect your active Naukri session?')) return;
    try {
      await apiFetch('/api/naukri/clear-session', { method: 'POST' });
      showToast('Naukri session disconnected.', 'info');
      fetchConfigAndHistory();
    } catch (e) {
      showToast('Failed to disconnect session', 'error');
    }
  };

  const handleTriggerUpload = async () => {
    if (!config.hasSession && !config.username && !formData.username) {
      return showToast('Please enter your Naukri credentials or link your session cookie first.', 'error');
    }
    setUploading(true);
    setOtpError('');
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

      if (data.result?.status === 'otp_required' || data.result?.requiresOtp) {
        setOtpMessage(data.result.message || 'Naukri sent a 6-digit OTP to your registered email/phone.');
        setOtpError('');
        setOtpInput('');
        setShowOtpModal(true);
        showToast('🔑 Naukri requested 2FA OTP verification. Please enter the OTP code.', 'info');
        return;
      }

      showToast(`🚀 Resume uploaded to Naukri successfully! Profile Status: Active Just Now (${data.result?.duration || '12s'})`, 'success');
      fetchConfigAndHistory();
    } catch (err) {
      showToast(err.message || 'Failed to upload resume to Naukri', 'error');
      fetchConfigAndHistory();
    } finally {
      setUploading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    if (!otpInput || otpInput.trim().length === 0) {
      setOtpError('Please enter the 6-digit OTP code.');
      return showToast('Please enter the 6-digit OTP code.', 'error');
    }
    setVerifyingOtp(true);
    setOtpError('');
    try {
      const res = await apiFetch('/api/naukri/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpInput.trim() })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setShowOtpModal(false);
      setOtpInput('');
      setOtpError('');
      showToast(data.result?.message || '🎉 2FA OTP Verified! Resume uploaded and session saved permanently.', 'success');
      fetchConfigAndHistory();
    } catch (err) {
      setOtpError(err.message || 'Failed to verify OTP');
      showToast(err.message || 'Failed to verify OTP', 'error');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear the Naukri upload history?')) return;
    try {
      await apiFetch('/api/naukri/history', { method: 'DELETE' });
      setHistory([]);
      showToast('Naukri upload history cleared.', 'info');
    } catch (e) {
      showToast('Failed to clear history', 'error');
    }
  };

  if (!currentUser) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center flex flex-col items-center justify-center gap-4 max-w-lg mx-auto my-12 shadow-sm">
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl">
          <Lock className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Sign in to Access Naukri Profile Booster</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            Naukri credentials, upload schedules, and boost history are 100% private and isolated to your Google SSO account.
          </p>
        </div>
      </div>
    );
  }

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
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
              title="Upload Schedule Mode"
            >
              <option value="quarter_day">⏱️ Quarter-Day Resdex Hack (10 AM, 4 PM, 10 PM, 4 AM)</option>
              <option value="custom">🎯 Custom Timings (Choose Your Own Exact Times)</option>
              <option value="hourly">⏱️ Every 1 Hour (Continuous Hourly)</option>
              <option value="half_hour">⏱️ Every 30 Minutes</option>
            </select>

            <button
              onClick={handleTriggerUpload}
              disabled={uploading || connectingSso}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-4 rounded-lg text-xs transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
              title="Upload resume immediately right now"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              <span>{uploading ? 'Uploading to Naukri...' : 'Boost Profile Now'}</span>
            </button>
          </div>
        </div>

        {/* Live Uploading / SSO Connecting Progress Banner */}
        {uploading && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3 animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-emerald-900 dark:text-emerald-200 block">
                Launching Chrome & uploading tailored 1-page PDF to Naukri.com...
              </span>
              <span className="text-emerald-700 dark:text-emerald-400 text-[11px]">
                Authenticating session via Google SSO cookies, attaching resume PDF to #attachCV, and confirming 'Active Just Now' timestamp.
              </span>
            </div>
          </div>
        )}

        {connectingSso && (
          <div className="p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl flex items-center gap-3 animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-sky-900 dark:text-sky-200 block">
                Chrome Window Open: Please click "Sign in with Google"
              </span>
              <span className="text-sky-700 dark:text-sky-400 text-[11px]">
                Select your Google account in the Chrome window. Once signed in, this window will automatically save your session cookies for background Quarter-Day auto-uploads!
              </span>
            </div>
          </div>
        )}

        {/* Config & Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Credentials Card (Primary) */}
          <form onSubmit={handleSaveCredentials} className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-500" />
                <span>Naukri Account Authorization</span>
              </span>
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                📄 {currentUser?.name ? `${currentUser.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_resume.pdf` : 'candidate_resume.pdf'}
              </span>
            </div>

            {/* Quick Connection Options (Google SSO & Session Cookie) */}
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex flex-col gap-2 shadow-xs">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Session Status:</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    config.hasSession
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                  }`}>
                    {config.hasSession ? '🟢 Active (Auto-Boost Ready)' : '⚪ Not Linked'}
                  </span>
                  {config.hasSession && (
                    <button
                      type="button"
                      onClick={handleOpenViewCookiesModal}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      title="View active session cookies retrieved from Cloud Database"
                    >
                      <Eye className="w-3 h-3" />
                      <span>View Cookie</span>
                    </button>
                  )}
                  {config.hasSession && (
                    <button
                      type="button"
                      onClick={handleDisconnectSession}
                      className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold underline cursor-pointer ml-0.5"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setShowCookieModal(true)}
                  disabled={uploading}
                  className="flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg py-2 px-2 font-bold text-[11px] shadow-xs transition-all cursor-pointer"
                  title="Paste session cookie from your browser - ideal for Google SSO accounts on cloud"
                >
                  <Key className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Paste Session Cookie</span>
                </button>

                <button
                  type="button"
                  onClick={handleLaunchGoogleSso}
                  disabled={connectingSso || uploading}
                  className="flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg py-2 px-2 font-bold text-[11px] shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  title="Launch Google SSO in local Chrome browser (Desktop App)"
                >
                  {connectingSso ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  )}
                  <span>1-Click Desktop SSO</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 my-0.5">
              <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Or Login with Password</span>
              <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                Naukri Login Email / Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="e.g. your_email@gmail.com"
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

            <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.headless}
                  onChange={handleHeadlessToggle}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Run Headless (Silent Background)</span>
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

          {/* Schedule Strategy & Custom Timings Card */}
          <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex flex-col justify-between gap-3">
            {config.scheduleMode === 'custom' ? (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5 mb-0.5">
                      <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Custom Daily Upload Timings ({(config.customSlots || []).length} Slots)</span>
                    </span>
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-300/90">
                      Add specific times of day for automated resume uploads on Naukri.
                    </p>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700">
                    Custom Active
                  </span>
                </div>

                {/* Add Custom Time Input Row */}
                <div className="flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 p-2 rounded-xl border border-emerald-200 dark:border-emerald-800/60">
                  <input
                    type="time"
                    value={newCustomTime}
                    onChange={(e) => setNewCustomTime(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCustomSlot(newCustomTime)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Time Slot</span>
                  </button>
                </div>

                {/* Active Custom Slot Chips */}
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {(config.customSlots || ['09:30 AM', '01:30 PM', '04:30 PM', '06:30 PM']).map((slot, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 px-2.5 py-1 rounded-lg text-xs font-mono font-bold shadow-xs group"
                    >
                      <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span>{slot}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomSlot(slot)}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs ml-0.5"
                        title={`Remove ${slot}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-emerald-200 dark:border-emerald-800/40">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetSlots(['09:30 AM', '01:30 PM', '04:30 PM', '06:30 PM'], 'Target Timings (9:30, 1:30, 4:30, 6:30)')}
                    className="text-[10px] bg-emerald-100/70 hover:bg-emerald-200/80 dark:bg-emerald-900/40 dark:hover:bg-emerald-800/60 text-emerald-800 dark:text-emerald-200 font-bold px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-700 transition-colors cursor-pointer shadow-xs"
                  >
                    🎯 4 Target Slots (9:30, 1:30, 4:30, 6:30)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetSlots(['10:00 AM', '01:00 PM', '04:00 PM', '07:00 PM'], 'Workday')}
                    className="text-[10px] bg-emerald-100/70 hover:bg-emerald-200/80 dark:bg-emerald-900/40 dark:hover:bg-emerald-800/60 text-emerald-800 dark:text-emerald-200 font-semibold px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-700 transition-colors cursor-pointer"
                  >
                    🏢 Workday
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetSlots(['08:30 AM', '11:30 AM', '02:30 PM', '05:30 PM', '08:30 PM', '11:30 PM'], '6 Daily Slots')}
                    className="text-[10px] bg-emerald-100/70 hover:bg-emerald-200/80 dark:bg-emerald-900/40 dark:hover:bg-emerald-800/60 text-emerald-800 dark:text-emerald-200 font-semibold px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-700 transition-colors cursor-pointer"
                  >
                    ⚡ 6 Daily Slots
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Quarter-Day Upload Schedule (Every 6 Hours)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleScheduleModeChange('custom')}
                    className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold underline hover:text-emerald-900 cursor-pointer"
                  >
                    ⚙️ Set Custom Times
                  </button>
                </div>
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
            )}

            <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/60 flex justify-between items-center text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
              <span>Last Upload: {config.lastUploadAt ? new Date(config.lastUploadAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not yet'}</span>
              <span>Next Upload Slot: {config.nextUploadAt ? new Date(config.nextUploadAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:00 AM'}</span>
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
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="text-xs text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 flex items-center gap-1 font-semibold transition-colors"
                title="Clear upload history"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
            <button
              onClick={fetchConfigAndHistory}
              className="text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 font-semibold"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
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

      {/* 3. Interactive Pending Screening Questions Alert Banner */}
      {pendingQuestions.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-300 dark:border-amber-800 p-4 sm:p-5 shadow-sm flex flex-col gap-3 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded-lg">
              <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-950 dark:text-amber-200 flex items-center gap-2">
                <span>Naukri Recruiter Screening Questions ({pendingQuestions.length} Pending)</span>
                <span className="text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold px-2 py-0.5 rounded-full">
                  Action Required
                </span>
              </h3>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Answer once below — Cold Reach AI will permanently store your answer in the DB and use it for all future job applications automatically!
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-1">
            {pendingQuestions.map((q) => (
              <div key={q.id} className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>{q.company}</span>
                    <span>•</span>
                    <span>{q.jobTitle}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block mt-0.5">
                    ❓ {q.question}
                  </span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    value={pendingAnswerInputs[q.id] || ''}
                    onChange={(e) => setPendingAnswerInputs({ ...pendingAnswerInputs, [q.id]: e.target.value })}
                    placeholder="Type your answer here..."
                    className="flex-1 sm:w-48 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={() => handleResolvePendingQuestion(q.id)}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all shadow-xs shrink-0 cursor-pointer"
                  >
                    Save & Auto-Apply
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Naukri 1-Click Easy Apply & Auto-Screening Bot Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                Naukri 1-Click Easy Apply & Auto-Screening Bot
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Automatically discovers Easy Apply jobs on Naukri matching your skills, fills recruiter screening questions from your Q&A memory DB, and submits applications with 0 human effort.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={applyTargetCount}
              onChange={(e) => setApplyTargetCount(parseInt(e.target.value, 10) || 10)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="5">Apply 5 Jobs</option>
              <option value="10">Apply 10 Jobs</option>
              <option value="15">Apply 15 Jobs</option>
              <option value="25">Apply 25 Jobs</option>
            </select>

            <button
              onClick={handleStartAutoApply}
              disabled={isAutoApplying || (!config.hasSession && !formData.username)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-4 rounded-lg text-xs transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="Search and apply to matching Naukri Easy Apply jobs automatically"
            >
              {isAutoApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{isAutoApplying ? 'Applying Jobs...' : '🚀 Start Naukri Easy Apply'}</span>
            </button>
          </div>
        </div>

        {/* Search Keyword Bar & Presets */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={applyKeywords}
              onChange={(e) => setApplyKeywords(e.target.value)}
              placeholder="e.g. Full Stack Developer, MERN Stack, React.js, Node.js, Bangalore"
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 uppercase font-bold">Role Presets:</span>
            {[
              'Full Stack Developer (React & Node.js)',
              'MERN Stack Engineer (3+ YOE)',
              'Backend Developer (Node.js/Express)',
              'Frontend Developer (React.js/Next.js)',
              'SDE-2 Full Stack (Bangalore / Remote)'
            ].map((kw, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setApplyKeywords(kw)}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                + {kw}
              </button>
            ))}
          </div>
        </div>

        {/* Live Auto-Apply Progress Banner */}
        {isAutoApplying && applyProgress && (
          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl flex flex-col gap-2 animate-pulse">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                <span>{applyProgress.status}</span>
              </span>
              <span className="font-mono text-indigo-700 dark:text-indigo-300 font-bold">
                {applyProgress.current} / {applyProgress.total}
              </span>
            </div>
            <div className="w-full bg-indigo-200 dark:bg-indigo-900 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 dark:bg-indigo-400 h-2 transition-all duration-500 rounded-full"
                style={{ width: `${Math.round((applyProgress.current / (applyProgress.total || 1)) * 100)}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Smart Q&A Memory Database Manager Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
        <div className="flex justify-between items-center flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                Smart Recruiter Q&A Memory Database ({qaItems.length})
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Naukri recruiter screening questions stored in DB. Answers are automatically retrieved to fill application dialogs without asking you again.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNewQaModal(true)}
            className="bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Answer</span>
          </button>
        </div>

        {/* Q&A Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {qaItems.map((qa) => (
            <div
              key={qa.id}
              className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2 text-xs"
            >
              <div>
                <div className="flex justify-between items-start gap-2">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{qa.question}</span>
                  <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold px-1.5 py-0.5 rounded shrink-0">
                    {qa.category || 'General'}
                  </span>
                </div>
                <div className="mt-1.5 font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  Answer: {qa.answer}
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => handleDeleteQa(qa.id)}
                  className="text-[11px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Remove this question memory"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Applied Jobs History Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-colors">
        <div className="flex justify-between items-center">
          <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span>Naukri Easy Apply Jobs Log ({appliedJobs.length})</span>
          </h3>
          <button
            onClick={fetchQaAndAppliedJobs}
            className="text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 font-semibold"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {appliedJobs.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs italic border border-slate-100 dark:border-slate-800 rounded-lg">
            No jobs applied via Easy Apply yet. Click "Start Naukri Easy Apply" above to begin automated applications!
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto touch-scroll">
            <table className="w-full text-left text-xs border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                  <th className="p-3">Job Title & Company</th>
                  <th className="p-3">Location & Exp</th>
                  <th className="p-3">Applied Timestamp</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {appliedJobs.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">{app.jobTitle}</span>
                      <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">{app.company}</span>
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      <div>{app.location}</div>
                      <div className="text-[10px] text-slate-400">{app.experience}</div>
                    </td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                      {new Date(app.appliedAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle className="w-2.5 h-2.5" /> Applied (Easy Apply)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Custom Q&A Dialog Modal */}
      {showNewQaModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-indigo-200 dark:border-indigo-800 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Recruiter Q&A Memory</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Remembered for all future Naukri applications</p>
              </div>
            </div>

            <form onSubmit={handleSaveNewQa} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Recruiter Question:
                </label>
                <input
                  type="text"
                  value={newQaForm.question}
                  onChange={(e) => setNewQaForm({ ...newQaForm, question: e.target.value })}
                  placeholder="e.g. What is your experience in Docker & Kubernetes?"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Your Answer:
                </label>
                <input
                  type="text"
                  value={newQaForm.answer}
                  onChange={(e) => setNewQaForm({ ...newQaForm, answer: e.target.value })}
                  placeholder="e.g. 2+ Years / Yes / 12 LPA"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Category:
                </label>
                <select
                  value={newQaForm.category}
                  onChange={(e) => setNewQaForm({ ...newQaForm, category: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Skills">Skills & Technologies</option>
                  <option value="Experience">Experience & Background</option>
                  <option value="Compensation">Compensation & CTC</option>
                  <option value="Availability">Notice Period & Availability</option>
                  <option value="Location">Location & Relocation</option>
                  <option value="Education">Education & Degree</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewQaModal(false)}
                  className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save to Memory DB</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2FA OTP Verification Dialog Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-indigo-200 dark:border-indigo-800 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Naukri 2FA OTP Verification</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">One-Time Device Authorization</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              {otpMessage || 'Naukri sent a 6-digit OTP to your registered email/phone. Enter it below to link your account once. Future boosts will run automatically without OTP!'}
            </p>

            {otpError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{otpError}</span>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Enter 6-Digit OTP Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => {
                    setOtpInput(e.target.value.replace(/[^0-9]/g, ''));
                    setOtpError('');
                  }}
                  placeholder="e.g. 123456"
                  autoFocus
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowOtpModal(false);
                    setOtpError('');
                  }}
                  disabled={verifyingOtp}
                  className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyingOtp || otpInput.length < 4}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {verifyingOtp && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{verifyingOtp ? 'Verifying...' : 'Verify & Boost Profile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Session Cookie Import Dialog Modal */}
      {showCookieModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-emerald-200 dark:border-emerald-800 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Paste Naukri Session Cookie</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Direct Link for Google SSO Accounts (Zero Passwords / OTPs)</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex flex-col gap-1.5">
              <span className="font-bold text-slate-800 dark:text-slate-200">How to get your cookie in 5 seconds:</span>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <li>Open <a href="https://www.naukri.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-semibold">naukri.com</a> in your Chrome browser where you are logged in.</li>
                <li>Press <kbd className="bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 font-mono text-[10px]">F12</kbd> (or Right Click → <strong>Inspect</strong>) and click the <strong>Console</strong> tab.</li>
                <li>Type <code className="bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono text-[11px] text-indigo-600 dark:text-indigo-300 font-bold">copy(document.cookie)</code> and hit <kbd className="bg-white dark:bg-slate-900 px-1 py-0.5 rounded border font-mono text-[10px]">Enter</kbd>.</li>
                <li>Paste the copied text below and click <strong>Save & Link Session</strong>.</li>
              </ol>
            </div>

            <form onSubmit={handleImportCookies} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Paste Session Cookies / String:
                </label>
                <textarea
                  rows={4}
                  value={cookieInput}
                  onChange={(e) => setCookieInput(e.target.value)}
                  placeholder="e.g. nauk_session=...; ubt_user=... or JSON cookie array"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowCookieModal(false);
                    setCookieInput('');
                  }}
                  disabled={savingCookie}
                  className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCookie || !cookieInput.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {savingCookie && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingCookie ? 'Linking...' : 'Save & Link Session'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Session Cookies Modal */}
      {showViewCookiesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-indigo-200 dark:border-indigo-800 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Key className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Active Naukri Session Cookies</span>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 font-bold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700">
                      ☁️ Synced to DB
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Encrypted with AES-256-GCM and preserved in Supabase Cloud DB for 24/7 background boosts.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowViewCookiesModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {loadingViewCookies ? (
              <div className="p-8 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="text-xs">Fetching active cookies from Cloud Database...</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Status bar */}
                <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs">
                  <span className="text-emerald-800 dark:text-emerald-300 font-medium">
                    🔒 <strong>{activeSessionCookiesData?.cookieCount || 0} Cookies Loaded</strong> from isolated cloud sandbox.
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenViewCookiesModal}
                    className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Cookie String View */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Document Cookie String:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeSessionCookiesData?.cookieString) {
                          navigator.clipboard.writeText(activeSessionCookiesData.cookieString);
                          showToast('📋 Cookie string copied to clipboard!', 'success');
                        }
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy Cookie String</span>
                    </button>
                  </div>
                  <pre className="w-full bg-slate-900 text-emerald-400 p-3 rounded-xl text-[11px] font-mono whitespace-pre-wrap break-all max-h-36 overflow-y-auto border border-slate-700">
                    {activeSessionCookiesData?.cookieString || 'No active cookies found.'}
                  </pre>
                </div>

                {/* Structured Cookies List */}
                {Array.isArray(activeSessionCookiesData?.cookies) && activeSessionCookiesData.cookies.length > 0 && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Individual Cookies ({activeSessionCookiesData.cookies.length}):
                    </label>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {activeSessionCookiesData.cookies.map((c, idx) => (
                        <div
                          key={idx}
                          className="p-2 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs font-mono"
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400 truncate">{c.name}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{c.domain || '.naukri.com'}</span>
                          </div>
                          <span className="text-[10px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate max-w-[200px]">
                            {c.value ? `${c.value.substring(0, 16)}...` : '(empty)'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setShowViewCookiesModal(false);
                      setShowCookieModal(true);
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    ✏️ Update / Replace Cookies
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowViewCookiesModal(false)}
                    className="bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   ADMIN CONSOLE & USER ACTIVITY MONITOR (Exclusively for tksanthosh494@gmail.com)
   ========================================================================= */
function AdminDashboard({ showToast, isActive, currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAdminTab, setActiveAdminTab] = useState('users'); // 'users' | 'activities'
  const [selectedUserKey, setSelectedUserKey] = useState(null);
  const [inspectDetails, setInspectDetails] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectSubTab, setInspectSubTab] = useState('logs'); // 'logs' | 'apps' | 'resume' | 'naukri'

  const fetchAdminData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await apiFetch('/api/admin/overview');
      if (!res.ok) {
        throw new Error('Admin authorization failed or access restricted.');
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      if (!silent) {
        showToast(e.message || 'Failed to load admin telemetry', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchAdminData();
      const interval = setInterval(() => {
        fetchAdminData(true);
      }, 15000); // 15-second live telemetry poll
      return () => clearInterval(interval);
    }
  }, [isActive]);

  const handleInspectUser = async (userKey) => {
    setSelectedUserKey(userKey);
    setInspectLoading(true);
    setInspectDetails(null);
    try {
      const res = await apiFetch(`/api/admin/user/${encodeURIComponent(userKey)}`);
      const json = await res.json();
      setInspectDetails(json);
    } catch (e) {
      showToast('Failed to load user deep dive', 'error');
    } finally {
      setInspectLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <p className="text-sm font-semibold">Loading Super Admin Telemetry & Activity Stream...</p>
      </div>
    );
  }

  const metrics = data?.metrics || { totalUsers: 0, totalEmailsSent: 0, totalResumesTailored: 0, activeNaukriBoosters: 0 };
  const users = data?.users || [];
  const activities = data?.activities || [];

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q) || (u.userKey || '').toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Admin Security Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-4 sm:p-5 rounded-2xl border border-purple-800/50 shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-500/20 border border-purple-400/30 rounded-xl text-purple-300 shrink-0 shadow-inner">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-tight">Super Admin Control Center</h2>
              <span className="text-[10px] bg-purple-500/30 text-purple-200 border border-purple-400/40 px-2 py-0.5 rounded-full font-mono font-bold">
                ROOT PRIVILEGES
              </span>
            </div>
            <p className="text-xs text-purple-200/80">
              Live multi-tenant monitoring exclusively for <strong className="text-white font-mono">tksanthosh494@gmail.com</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => fetchAdminData(false)}
            disabled={refreshing}
            className="bg-purple-800/60 hover:bg-purple-700/80 text-purple-100 text-xs font-semibold px-3 py-1.5 rounded-lg border border-purple-600/40 flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing...' : 'Refresh Feed'}</span>
          </button>
        </div>
      </div>

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between transition-colors">
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Total Users</p>
            <p className="text-xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 mt-1">{metrics.totalUsers}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Active Sandbox Accounts</p>
          </div>
          <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between transition-colors">
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Platform Emails Sent</p>
            <p className="text-xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{metrics.totalEmailsSent}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Across All Accounts</p>
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Mail className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between transition-colors">
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Resumes Tailored</p>
            <p className="text-xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mt-1">{metrics.totalResumesTailored}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">AI ATS Customizations</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between transition-colors">
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Active Boosters</p>
            <p className="text-xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{metrics.activeNaukriBoosters}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Quarter-Day Uploaders</p>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* Main Admin Section with Sub-tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm flex flex-col gap-5 transition-colors">
        {/* Navigation Switcher between Users and Activity Stream */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveAdminTab('users')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeAdminTab === 'users'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Registered Users ({users.length})</span>
            </button>
            <button
              onClick={() => setActiveAdminTab('activities')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeAdminTab === 'activities'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Global Activity Feed ({activities.length})</span>
            </button>
          </div>

          {activeAdminTab === 'users' && (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user by name/email..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-purple-500"
              />
            </div>
          )}
        </div>

        {/* 1. USERS DIRECTORY VIEW */}
        {activeAdminTab === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                  <th className="p-3">User Profile</th>
                  <th className="p-3">OAuth Status</th>
                  <th className="p-3">Outreach Stats</th>
                  <th className="p-3">Naukri Booster</th>
                  <th className="p-3">Last Active</th>
                  <th className="p-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No users match the search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.userKey} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          {u.picture ? (
                            <img src={u.picture} alt="" className="w-7 h-7 rounded-full border border-purple-200 dark:border-purple-800 shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center text-xs shrink-0">
                              {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                              <span>{u.name || 'Anonymous Candidate'}</span>
                              {u.email === 'tksanthosh494@gmail.com' && (
                                <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.2 rounded font-bold">
                                  ADMIN
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          u.isAuthorized
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.isAuthorized ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                          {u.isAuthorized ? 'Gmail Connected' : 'Disconnected'}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="flex flex-col text-[11px]">
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            ✉️ {u.totalEmailsSent} emails sent
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            📄 {u.totalTailoredResumes} tailored resumes
                          </span>
                        </div>
                      </td>

                      <td className="p-3">
                        {u.naukriConfig?.enabled ? (
                          <div className="flex flex-col text-[11px]">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              🟢 Quarter-Day Active
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {u.naukriConfig.lastUploadAt ? `Last: ${new Date(u.naukriConfig.lastUploadAt).toLocaleTimeString()}` : 'Scheduled'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Inactive / Paused</span>
                        )}
                      </td>

                      <td className="p-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {u.lastActive ? new Date(u.lastActive).toLocaleString() : 'N/A'}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleInspectUser(u.userKey)}
                          className="bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold px-2.5 py-1 rounded-lg text-[11px] border border-purple-200 dark:border-purple-800 transition-all flex items-center gap-1 ml-auto"
                        >
                          <Eye className="w-3 h-3" /> Inspect
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. LIVE ACTIVITY STREAM VIEW */}
        {activeAdminTab === 'activities' && (
          <div className="flex flex-col gap-3">
            {activities.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No user activities recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activities.map((act) => (
                  <div key={act.id} className="py-3 flex items-start justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 px-2 rounded-lg transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                        act.type === 'email_outreach' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' :
                        act.type === 'resume_tailored' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' :
                        'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {act.type === 'email_outreach' ? <Mail className="w-4 h-4" /> :
                         act.type === 'resume_tailored' ? <FileText className="w-4 h-4" /> :
                         <TrendingUp className="w-4 h-4" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                            {act.userName || act.userEmail}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            ({act.userEmail})
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                            act.status === 'Sent' || act.status === 'success' || act.status === 'Generated'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                          }`}>
                            {act.status}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                          {act.title}
                        </p>
                        {act.details && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 italic">
                            "{act.details}"
                          </p>
                        )}
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {new Date(act.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* USER INSPECTION MODAL */}
      {selectedUserKey && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-sm shadow">
                  {(selectedUserKey.charAt(0) || 'U').toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                    Inspecting Workspace: <span className="font-mono text-purple-600 dark:text-purple-400">{selectedUserKey}</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">Live multi-device cloud storage & activity audit</p>
                </div>
              </div>

              <button
                onClick={() => { setSelectedUserKey(null); setInspectDetails(null); }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg p-1.5"
              >
                ✕
              </button>
            </div>

            {/* Modal Sub-Tabs */}
            <div className="flex items-center gap-2 px-4 sm:px-6 pt-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
              <button
                onClick={() => setInspectSubTab('logs')}
                className={`py-2 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  inspectSubTab === 'logs' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500'
                }`}
              >
                <Mail className="w-3.5 h-3.5" /> Outreach Logs ({inspectDetails?.logs?.length || 0})
              </button>
              <button
                onClick={() => setInspectSubTab('apps')}
                className={`py-2 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  inspectSubTab === 'apps' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Tailored Resumes ({inspectDetails?.applications?.length || 0})
              </button>
              <button
                onClick={() => setInspectSubTab('resume')}
                className={`py-2 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  inspectSubTab === 'resume' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" /> Master Template
              </button>
              <button
                onClick={() => setInspectSubTab('naukri')}
                className={`py-2 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  inspectSubTab === 'naukri' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" /> Naukri Automation
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto max-h-[60vh] text-xs">
              {inspectLoading ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                  <span>Loading user data from Supabase...</span>
                </div>
              ) : !inspectDetails ? (
                <div className="text-center text-slate-400 py-12">No data found for this user.</div>
              ) : (
                <div>
                  {inspectSubTab === 'logs' && (
                    <div className="flex flex-col gap-2">
                      {inspectDetails.logs?.length === 0 ? (
                        <p className="text-slate-400 py-8 text-center">User has not sent any cold emails yet.</p>
                      ) : (
                        inspectDetails.logs.map((l) => (
                          <div key={l.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-1.5">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-800 dark:text-slate-100">
                                🏢 {l.company || 'Company'} • {l.hrName || 'HR'} ({l.hrEmail || l.email})
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">
                                {new Date(l.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 font-semibold">{l.subject}</p>
                            <pre className="p-2 bg-white dark:bg-slate-900 rounded text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans">
                              {l.body}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {inspectSubTab === 'apps' && (
                    <div className="flex flex-col gap-2">
                      {inspectDetails.applications?.length === 0 ? (
                        <p className="text-slate-400 py-8 text-center">No tailored applications found.</p>
                      ) : (
                        inspectDetails.applications.map((a) => (
                          <div key={a.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-bold text-slate-800 dark:text-slate-100">
                                🎯 {a.role} at {a.company}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">{new Date(a.timestamp).toLocaleDateString()}</span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {a.matchedSkills?.map((s, idx) => (
                                <span key={idx} className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded text-[10px] font-bold">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {inspectSubTab === 'resume' && (
                    <pre className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-[11px] overflow-x-auto text-slate-800 dark:text-slate-200">
                      {JSON.stringify(inspectDetails.resume || {}, null, 2)}
                    </pre>
                  )}

                  {inspectSubTab === 'naukri' && (
                    <div className="flex flex-col gap-3">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Naukri Configuration</h4>
                        <p><strong>Status:</strong> {inspectDetails.naukriConfig?.enabled ? '🟢 Active' : '🔴 Paused'}</p>
                        <p><strong>Username:</strong> {inspectDetails.naukriConfig?.username || 'Not set'}</p>
                        <p><strong>Schedule Mode:</strong> {inspectDetails.naukriConfig?.scheduleMode || 'quarter_day'}</p>
                        <p><strong>Last Upload:</strong> {inspectDetails.naukriConfig?.lastUploadAt ? new Date(inspectDetails.naukriConfig.lastUploadAt).toLocaleString() : 'None'}</p>
                      </div>

                      <h4 className="font-bold text-slate-800 dark:text-slate-200 mt-2">Boost History ({inspectDetails.naukriHistory?.length || 0})</h4>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {inspectDetails.naukriHistory?.map((h) => (
                          <div key={h.id} className="py-2 flex justify-between items-center text-[11px]">
                            <span>{h.status === 'success' ? '🟢' : '🔴'} {h.fileName} - {h.profileStatus || h.message}</span>
                            <span className="font-mono text-slate-400">{new Date(h.timestamp).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-800/50">
              <button
                onClick={() => { setSelectedUserKey(null); setInspectDetails(null); }}
                className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold px-4 py-1.5 rounded-lg text-xs transition-all"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   LOGIN & LANDING PAGE MODULE (For Guests / Logged Out Users)
   ========================================================================= */
function LoginPage({ onConnectGmail, isDarkMode, setIsDarkMode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors">
      {/* Top Navigation Bar */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-tight">emailSender <span className="font-normal text-slate-400">|</span> Cold Reach AI</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Intelligent Recruiter Outreach Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-amber-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
          <button
            onClick={onConnectGmail}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-2"
          >
            <Mail className="w-4 h-4" />
            <span>Sign In</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-4 py-12 sm:py-16 flex flex-col items-center text-center gap-8">
        <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-xs">
          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Multi-Tenant Google SSO • Isolated Sandboxes</span>
        </div>

        <div className="max-w-3xl space-y-4">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight sm:leading-tight">
            Supercharge Your Job Search with <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">AI Outreach</span> & Tailored Resumes
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Send punchy cold emails directly from your Gmail, generate 1-page ATS resumes tailored to specific Job Descriptions, and automate your Naukri recruiter visibility 24/7.
          </p>
        </div>

        {/* Primary Call to Action Button */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md justify-center">
          <button
            onClick={onConnectGmail}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3.5 rounded-xl shadow-lg hover:shadow-indigo-500/25 transition-all text-sm sm:text-base flex items-center justify-center gap-3 active:scale-98"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Sign in with Google SSO</span>
          </button>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full text-left mt-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl w-fit mb-3">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Smart Cold Emails</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Ultra-brief, high-converting outreach under 100 words sent directly through your authenticated Gmail.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs">
            <div className="p-2.5 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-xl w-fit mb-3">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">JD Resume Tailor</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Extract keywords from any JD to build an ATS-optimized, 1-page PDF resume with verified skill alignment.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl w-fit mb-3">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Naukri Auto-Booster</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Quarter-Day automated resume uploader keeps your profile marked "Active Just Now" for top recruiter rank.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs">
            <div className="p-2.5 bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 rounded-xl w-fit mb-3">
              <Globe className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">LinkedIn Auto-Pilot</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Discovers hiring posts and sends tailored outreach on a scheduled 30-minute automated drip loop.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 px-4 text-center text-xs text-slate-400 dark:text-slate-500 flex flex-col sm:flex-row items-center justify-between max-w-5xl mx-auto w-full gap-2">
        <p>© 2026 Cold Reach AI. Built with Google SSO & NVIDIA NIM.</p>
        <div className="flex items-center gap-4">
          <a href="/privacy" target="_blank" rel="noreferrer" className="hover:text-indigo-600 dark:hover:text-indigo-400 underline">Privacy Policy</a>
          <a href="/terms" target="_blank" rel="noreferrer" className="hover:text-indigo-600 dark:hover:text-indigo-400 underline">Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}