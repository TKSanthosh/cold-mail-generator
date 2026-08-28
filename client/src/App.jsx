import React, { useState, useEffect, useRef } from 'react';
import { Mail, FileText, Settings, Sparkles, Send, Plus, Trash2, CheckCircle, XCircle, LogOut, Loader2, ArrowRight, History, Download, Eye, Search, UploadCloud, Globe, Clock, Bookmark, User, UserCheck, Shield } from 'lucide-react';

const BACKEND_URL = window.location.port === '5174' || window.location.port === '5173' ? 'http://localhost:5001' : '';

// Helper to make authenticated, per-user sandbox API calls
export const apiFetch = (endpoint, options = {}) => {
  let userKey = '';
  try {
    const stored = JSON.parse(localStorage.getItem('cold_email_user') || '{}');
    userKey = stored.userKey || '';
  } catch (e) {}

  const headers = {
    ...options.headers,
    'x-user-key': userKey
  };

  return fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
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
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [toast, setToast] = useState(null);

  // Check auth status on load for the active user
  const checkAuthStatus = async (user = currentUser) => {
    try {
      const res = await apiFetch('/api/auth/status', {
        headers: { 'x-user-key': user?.userKey || '' }
      });
      const data = await res.json();
      setIsAuthorized(data.authorized);
      if (data.user) {
        const updated = { ...user, ...data.user, userKey: data.userKey || user?.userKey };
        setCurrentUser(updated);
        localStorage.setItem('cold_email_user', JSON.stringify(updated));
      }
    } catch (e) {
      console.error('Failed to check auth status', e);
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

      const userObj = {
        userKey: userKey || (email ? email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() : 'default_user'),
        email: email || '',
        name: name || 'Candidate',
        picture: picture || ''
      };

      setCurrentUser(userObj);
      localStorage.setItem('cold_email_user', JSON.stringify(userObj));
      setIsAuthorized(true);
      showToast(`Welcome ${userObj.name}! Connected your private Gmail sandbox.`, 'success');

      // Clean query parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      checkAuthStatus(userObj);
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
      const res = await apiFetch('/api/auth/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setIsAuthorized(false);
        setCurrentUser(null);
        localStorage.removeItem('cold_email_user');
        showToast('Account disconnected & workspace locked.', 'success');
      }
    } catch (e) {
      showToast('Failed to disconnect Gmail', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border flex items-center gap-2 transition-all ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
          toast.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
          'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600" /> :
           toast.type === 'error' ? <XCircle className="w-5 h-5 text-rose-600" /> : null}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-md">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Cold Email & Resume Tailor</h1>
              <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 border border-slate-200">
                <Shield className="w-3 h-3 text-indigo-600" /> Isolated Sandbox
              </span>
            </div>
            <p className="text-xs text-slate-500">Google OAuth & NVIDIA NIM Automated Outreach</p>
          </div>
        </div>

        {/* Gmail User Profile & Auth Status */}
        <div className="flex items-center gap-3">
          {checkingAuth ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking session...
            </div>
          ) : isAuthorized && currentUser ? (
            <div className="flex items-center gap-3 bg-emerald-50/80 border border-emerald-200 rounded-full pl-2 pr-3 py-1.5 shadow-sm">
              {currentUser.picture ? (
                <img src={currentUser.picture} alt={currentUser.name} className="w-6 h-6 rounded-full border border-emerald-300" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                  {(currentUser.name || 'C').charAt(0)}
                </div>
              )}
              <div className="flex flex-col text-left leading-none">
                <span className="text-emerald-900 text-xs font-bold">{currentUser.name || 'Candidate'}</span>
                <span className="text-emerald-700 text-[10px] font-medium">{currentUser.email}</span>
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-1"></div>
              <button 
                onClick={handleDisconnectGmail}
                className="text-slate-400 hover:text-rose-600 p-1 rounded-full hover:bg-white transition-colors ml-1"
                title="Switch / Disconnect Account"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectGmail}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <Mail className="w-4 h-4" /> Sign in with Gmail
            </button>
          )}
        </div>
      </header>

      {/* Navigation tabs */}
      <div className="bg-white border-b border-slate-200 px-6 flex gap-6">
        <button
          onClick={() => setActiveTab('single')}
          className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'single' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Send className="w-4 h-4" /> Single Email
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'bulk' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Mail className="w-4 h-4" /> Bulk Campaign
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'logs' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <History className="w-4 h-4" /> Outreach History / Logs
        </button>
        <button
          onClick={() => setActiveTab('jdtailor')}
          className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'jdtailor' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4" /> JD Resume Tailor & Log
        </button>
        <button
          onClick={() => setActiveTab('resume')}
          className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'resume' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" /> Base Resume Template
        </button>
      </div>

      {/* Main Content (Preserved in Memory) */}
      <main className="flex-1 p-6 overflow-y-auto max-w-7xl w-full mx-auto">
        <div className={activeTab === 'single' ? 'block' : 'hidden'}>
          <SingleSender isAuthorized={isAuthorized} showToast={showToast} />
        </div>
        <div className={activeTab === 'bulk' ? 'block' : 'hidden'}>
          <BulkSender isAuthorized={isAuthorized} showToast={showToast} />
        </div>
        <div className={activeTab === 'logs' ? 'block' : 'hidden'}>
          <LogsViewer showToast={showToast} />
        </div>
        <div className={activeTab === 'jdtailor' ? 'block' : 'hidden'}>
          <JdResumeTailor showToast={showToast} />
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

  // Auto-parse on blur or typing check
  const handleEmailBlur = () => {
    if (hrEmail.includes('@') && !parsedName && !parsedCompany) {
      const [local, domain] = hrEmail.split('@');
      let name = local.replace(/[._\-+]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      if (['hr', 'recruitment', 'jobs', 'careers'].includes(name.toLowerCase())) name = 'Hiring Team';
      const company = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1).toLowerCase();
      setParsedName(name);
      setParsedCompany(company);
    }
  };

  const handleGenerate = async () => {
    if (!hrEmail) return showToast('Please enter an HR email address.', 'error');
    setGenerating(true);
    try {
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
      showToast('Scraped company intelligence & tailored templates successfully!', 'success');
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

    // Calculate tomorrow 8:30 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 30, 0, 0);

    setSending(true);
    try {
      const res = await apiFetch(`/api/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: hrEmail,
          subject: emailSubject,
          body: emailBody,
          resume: tailoredResume,
          hrName: parsedName,
          company: parsedCompany,
          scheduledAt: tomorrow.toISOString(),
          resumeType: jd && jd.trim().length > 0 ? 'Tailored' : 'Standard'
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showToast(`Scheduled for tomorrow morning at 8:30 AM via Gmail!`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to schedule email', 'error');
    } finally {
      setSending(false);
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Inputs Column */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-5">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" /> Target Outreach Details
        </h2>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">HR Email Address</label>
          <input
            type="email"
            value={hrEmail}
            onChange={(e) => setHrEmail(e.target.value)}
            onBlur={handleEmailBlur}
            placeholder="e.g. santhosh@indi.co"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Parsed Fields (Editable) */}
        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Parsed HR Name</label>
            <input
              type="text"
              value={parsedName}
              onChange={(e) => setParsedName(e.target.value)}
              placeholder="Hiring Manager"
              className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Parsed Company</label>
            <input
              type="text"
              value={parsedCompany}
              onChange={(e) => setParsedCompany(e.target.value)}
              placeholder="Target Company"
              className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Scraped Company Intelligence Card */}
        {companyIntel && (
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-950 flex flex-col gap-1">
            <span className="font-bold flex items-center gap-1.5 text-indigo-700">
              <Globe className="w-3.5 h-3.5" /> Scraped Company Intelligence ({companyIntel.source || 'Online'})
            </span>
            <p className="leading-relaxed text-slate-700 italic">{companyIntel.summary}</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Job Description (JD) <span className="text-slate-400 font-normal">(Optional)</span></label>
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job description here to tailor your resume & email to this specific role..."
            rows={5}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono text-xs"
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
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-600" /> Customized Cold Email
            </h3>
            {emailBody && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Subject: ${emailSubject}\n\n${emailBody}`);
                  showToast('Copied to clipboard!', 'success');
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
              >
                Copy Content
              </button>
            )}
          </div>

          <div className="border border-slate-100 rounded-lg overflow-hidden text-sm">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
              <span className="text-slate-400 font-semibold">Subject:</span>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject line will generate here..."
                className="bg-transparent border-none focus:outline-none w-full text-slate-800 font-semibold"
              />
            </div>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Email body will generate here..."
              rows={10}
              className="w-full p-4 bg-white border-none focus:outline-none font-sans text-slate-700 resize-none whitespace-pre-wrap text-sm leading-relaxed"
            />
          </div>

          {/* Action Buttons inside Email Card */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSendEmail}
              disabled={sending || !emailBody}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Email Now to {parsedName || 'HR'}
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={handleScheduleMorning}
                disabled={sending || !emailBody}
                className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold py-2.5 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Schedules email dispatch for tomorrow morning at 8:30 AM"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                🌅 Schedule Morning (8:30 AM)
              </button>

              <button
                onClick={handleCreateDraft}
                disabled={sending || !emailBody}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold py-2.5 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Creates a ready draft in your Gmail app with the 1-page PDF attached so you can schedule send in Gmail"
              >
                <Bookmark className="w-3.5 h-3.5 text-indigo-600" />
                📝 Save Draft in Gmail App
              </button>
            </div>
          </div>
        </div>

        {/* Resume Preview */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" /> Tailored Resume Highlights
          </h3>

          {tailoredResume ? (
            <div className="flex flex-col gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider block mb-1">Tailored Summary</span>
                <p className="text-xs text-slate-600 italic leading-relaxed">"{tailoredResume.summary}"</p>
              </div>

              <div className="border border-slate-100 rounded-lg p-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Technical Skill Alignment</span>
                <div className="flex flex-wrap gap-1">
                  {Object.values(tailoredResume.skills || {}).flat().slice(0, 10).map((skill, i) => (
                    <span key={i} className="bg-slate-100 text-slate-800 text-[10px] px-2 py-0.5 rounded font-semibold border border-slate-200">
                      {skill}
                    </span>
                  ))}
                  <span className="text-[10px] text-slate-400 py-0.5">...and others</span>
                </div>
              </div>

              <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-lg flex items-center gap-3 text-xs text-indigo-800">
                <CheckCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                <div>
                  <p className="font-semibold">Tailored PDF Attached Automatically</p>
                  <p className="text-indigo-600">The resume experience bullet points have been aligned to target JD keywords.</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-xs py-6 text-center italic">Generate templates to preview customized resume tweaks.</p>
          )}

          <button
            onClick={handleSendEmail}
            disabled={sending || !emailBody}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
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
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Mail className="w-5 h-5 text-indigo-600" /> Bulk Outreach Campaign
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportHrExcel}
            disabled={!emailsText && parsedItems.length === 0}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 border border-slate-200 disabled:opacity-50"
            title="Download HR names, company names, and emails as an Excel CSV file"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" /> Download HR Emails (Excel)
          </button>
          {parsedItems.length > 0 && (
            <button onClick={handleReset} className="text-xs text-rose-600 hover:text-rose-800 font-semibold">
              Reset List
            </button>
          )}
        </div>
      </div>

      {campaignState === 'idle' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recipient Emails <span className="text-slate-400 font-normal">(One per line)</span></label>
              <textarea
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                placeholder="santhosh@indi.co&#10;hr.manager@google.com&#10;recruitment@amazon.in"
                rows={10}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
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
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-lg text-xs transition-all border border-slate-200 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Download className="w-4 h-4 text-emerald-600" /> Export Excel
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Common Job Description (JD)</label>
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the job description here. Every outgoing resume and cold email in the campaign will be tailored dynamically using this JD as context..."
              rows={10}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono text-xs resize-y"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center text-sm font-semibold text-slate-600">
            <span>Campaign progress ({currentIndex + 1} / {parsedItems.length})</span>
            <span>{campaignState === 'sending' ? 'Sending...' : 'Campaign Complete!'}</span>
          </div>
          
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div 
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / parsedItems.length) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {parsedItems.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden mt-2">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="p-3">Email Address</th>
                <th className="p-3">HR Name</th>
                <th className="p-3">Company</th>
                <th className="p-3">Campaign Status</th>
              </tr>
            </thead>
            <tbody>
              {parsedItems.map((item, index) => (
                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-700">{item.email}</td>
                  <td className="p-3 font-semibold text-slate-800">{item.name}</td>
                  <td className="p-3 text-slate-600">{item.company}</td>
                  <td className="p-3 flex items-center gap-2">
                    {item.status === 'pending' && <span className="text-slate-400">Waiting</span>}
                    {item.status === 'generating' && <span className="text-indigo-600 font-medium flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Tailoring...</span>}
                    {item.status === 'sending' && <span className="text-amber-600 font-medium flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Emailing...</span>}
                    {item.status === 'success' && <span className="text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Sent</span>}
                    {item.status === 'error' && (
                      <span className="text-rose-600 font-semibold flex items-center gap-1" title={item.errorMsg}>
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
function LogsViewer({ showToast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = async () => {
    try {
      const res = await apiFetch(`/api/logs`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      showToast('Failed to load outreach history', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all outreach logs?')) return;
    try {
      const res = await apiFetch(`/api/logs`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
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
      `"${l.hrEmail || ''}"`,
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
    return (
      (l.company && l.company.toLowerCase().includes(q)) ||
      (l.hrName && l.hrName.toLowerCase().includes(q)) ||
      (l.hrEmail && l.hrEmail.toLowerCase().includes(q)) ||
      (l.subject && l.subject.toLowerCase().includes(q))
    );
  });

  const totalSent = logs.filter(l => l.status === 'Sent').length;
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
    <div className="flex flex-col gap-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Emails Sent</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{totalSent}</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Mail className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tailored Resumes</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{tailoredCount}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Standard Resumes</p>
            <p className="text-2xl font-black text-slate-700 mt-1">{totalSent - tailoredCount}</p>
          </div>
          <div className="p-3 bg-slate-100 text-slate-600 rounded-lg">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Companies Reached</p>
            <p className="text-2xl font-black text-indigo-600 mt-1">{uniqueCompanies}</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <History className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Logs Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Outreach Records & History Log</h2>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search company, HR, email..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleExportCSV}
              disabled={logs.length === 0}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>

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
          <div className="py-16 text-center text-slate-400 text-xs italic border border-slate-100 rounded-lg">
            {logs.length === 0 ? 'No emails sent yet. Sent emails will be automatically tracked here!' : 'No records match your search query.'}
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">Date & Time</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">HR Name & Email</th>
                  <th className="p-3">Resume Attachment Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 text-slate-500 font-mono whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 font-semibold text-slate-900">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                        {log.company || 'Unknown'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-800">{log.hrName || 'Hiring Manager'}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{log.hrEmail}</div>
                    </td>
                    <td className="p-3">
                      {(log.resumeType || '').includes('Tailored') ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-semibold text-[11px]">
                          <Sparkles className="w-3 h-3 text-emerald-600" /> Tailored with JD
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-medium text-[11px]">
                          <FileText className="w-3 h-3 text-slate-400" /> Standard Baseline
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {log.status === 'Sent' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-bold" title={log.error}>
                          <XCircle className="w-3.5 h-3.5 text-rose-500" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded text-xs font-semibold transition-colors inline-flex items-center gap-1"
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

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Outreach Record Details</h3>
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
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" /> Base Resume Template Editor
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Upload a new PDF resume or edit your baseline template details manually below.</p>
        </div>
        <div className="flex items-center gap-2">
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
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg text-xs transition-all disabled:opacity-50 flex items-center gap-1.5 border border-slate-200"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" /> : <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />}
            {uploading ? 'Parsing with AI...' : 'Upload Updated Resume (PDF)'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg text-xs shadow transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Upload Banner */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center"
      >
        <div className="p-3 bg-white text-indigo-600 rounded-full shadow-sm">
          {uploading ? <Loader2 className="w-6 h-6 animate-spin text-indigo-600" /> : <UploadCloud className="w-6 h-6" />}
        </div>
        <div>
          <p className="text-xs font-bold text-slate-800">
            {uploading ? 'Extracting text and parsing details using AI...' : 'Click to Upload your Updated Resume PDF'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">The system will automatically extract your experience, skills, projects, and education into your baseline template.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-4 border border-slate-100 p-4 rounded-lg">
          <h3 className="text-sm font-bold text-slate-700 border-b pb-1">Personal Details</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Full Name</label>
              <input
                type="text"
                value={resumeData.personalInfo?.name || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'name', e.target.value)}
                className="w-full bg-slate-50 border rounded p-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Job Title</label>
              <input
                type="text"
                value={resumeData.personalInfo?.title || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'title', e.target.value)}
                className="w-full bg-slate-50 border rounded p-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Email</label>
              <input
                type="text"
                value={resumeData.personalInfo?.email || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'email', e.target.value)}
                className="w-full bg-slate-50 border rounded p-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Phone</label>
              <input
                type="text"
                value={resumeData.personalInfo?.phone || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'phone', e.target.value)}
                className="w-full bg-slate-50 border rounded p-2 focus:outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-slate-500 mb-1">Location</label>
              <input
                type="text"
                value={resumeData.personalInfo?.location || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'location', e.target.value)}
                className="w-full bg-slate-50 border rounded p-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">GitHub URL</label>
              <input
                type="text"
                value={resumeData.personalInfo?.github || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'github', e.target.value)}
                className="w-full bg-slate-50 border rounded p-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">LinkedIn URL</label>
              <input
                type="text"
                value={resumeData.personalInfo?.linkedin || ''}
                onChange={(e) => handleNestedChange('personalInfo', 'linkedin', e.target.value)}
                className="w-full bg-slate-50 border rounded p-2 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border border-slate-100 p-4 rounded-lg">
          <h3 className="text-sm font-bold text-slate-700 border-b pb-1">Professional Summary</h3>
          <textarea
            value={resumeData.summary || ''}
            onChange={(e) => setResumeData(prev => ({ ...prev, summary: e.target.value }))}
            rows={8}
            className="w-full bg-slate-50 border rounded p-3 text-xs leading-relaxed focus:outline-none resize-none"
          />
        </div>
      </div>

      <div className="border border-slate-100 p-4 rounded-lg flex flex-col gap-3">
        <h3 className="text-sm font-bold text-slate-700 border-b pb-1 flex items-center justify-between">
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
          className="w-full bg-slate-50 border rounded p-3 text-[11px] font-mono leading-relaxed focus:outline-none resize-y"
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

  const fetchApplications = async () => {
    setLoadingApps(true);
    try {
      const res = await apiFetch(`/api/applications`);
      const data = await res.json();
      setApplications(data.applications || []);
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
          role: role.trim() || 'Software Development Engineer 2 (SDE2)',
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
        setApplications(prev => prev.filter(a => a.id !== id));
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
    link.download = `Santhosh_TK_${(comp || 'Company').replace(/\s+/g, '_')}_${(rol || 'SDE2').replace(/\s+/g, '_')}_Resume.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloading 1-Page Tailored Executive PDF...', 'success');
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
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-indigo-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-indigo-400/30">
              AI Job-Matched Resume Compiler
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Dedicated JD Resume Tailor & Application Log</h2>
          <p className="text-sm text-indigo-200/90 mt-1 max-w-2xl">
            Paste any target Job Description (JD). Our AI engine intelligently aligns your real technical stack, projects, and achievements to match the job requirements, compiles an executive 1-page PDF, and stores the application in your persistent history log.
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 text-center min-w-[140px]">
          <div className="text-2xl font-black text-white">{applications.length}</div>
          <div className="text-xs text-indigo-200 font-medium">Logged Resumes</div>
        </div>
      </div>

      {/* Input Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Form (5 cols) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Target Role & Job Description</span>
            </h3>
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded transition-colors"
            >
              📋 Paste JD
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Target Company</label>
              <input
                type="text"
                placeholder="e.g. Amazon, Google, Uber"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Target Role / Title</label>
              <input
                type="text"
                placeholder="e.g. Full Stack Engineer (SDE2)"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">Paste Job Description (JD) *</label>
              <span className="text-[11px] text-slate-400">{jd.length} chars</span>
            </div>
            <textarea
              rows={10}
              placeholder="Paste the complete Job Description here (key skills, responsibilities, required backend/frontend stack)..."
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs leading-relaxed text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-sans"
            />
          </div>

          <button
            onClick={handleTailor}
            disabled={tailoring || !jd.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm"
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
        <div className="lg:col-span-7 bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>Tailored Resume Result</span>
            </h3>
            {currentTailored && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewTab('visual')}
                  className={`text-xs px-2.5 py-1 rounded font-semibold transition-all ${
                    previewTab === 'visual' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Visual Preview
                </button>
                <button
                  onClick={() => setPreviewTab('json')}
                  className={`text-xs px-2.5 py-1 rounded font-semibold transition-all ${
                    previewTab === 'json' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                    className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold px-2.5 py-2 rounded-lg transition-colors flex items-center justify-center"
                    title="Export JSON"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Preview Body */}
              {previewTab === 'visual' ? (
                <div className="flex-1 max-h-[420px] overflow-y-auto bg-slate-50 p-4 rounded-lg border border-slate-200 text-slate-800 flex flex-col gap-3.5 text-xs">
                  {/* Summary */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b pb-1 mb-1">
                      Tailored Professional Summary
                    </h5>
                    <p className="leading-relaxed text-slate-700">
                      {currentTailored.tailoredResume?.summary}
                    </p>
                  </div>

                  {/* Skills */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b pb-1 mb-1.5">
                      Prioritized Technical Skills
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(currentTailored.tailoredResume?.skills || {}).map(([cat, list]) => (
                        <div key={cat} className="bg-white p-2 rounded border border-slate-100">
                          <span className="font-bold text-slate-800">{cat}: </span>
                          <span className="text-slate-600">{Array.isArray(list) ? list.join(', ') : list}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Experience */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b pb-1 mb-1.5">
                      Tailored Project Highlights & Experience
                    </h5>
                    <div className="flex flex-col gap-2">
                      {currentTailored.tailoredResume?.experience?.map((job, idx) => (
                        <div key={idx} className="bg-white p-2.5 rounded border border-slate-100">
                          <div className="flex justify-between items-center font-bold text-slate-900 mb-1">
                            <span>{job.role} - {job.company}</span>
                            <span className="text-[10px] text-slate-500 font-normal">{job.duration}</span>
                          </div>
                          {job.highlights && (
                            <ul className="list-disc list-inside text-[11px] text-slate-600 flex flex-col gap-0.5">
                              {job.highlights.map((hl, hIdx) => (
                                <li key={hIdx}>{hl}</li>
                              ))}
                            </ul>
                          )}
                          {job.projects && job.projects.map((proj, pIdx) => (
                            <div key={pIdx} className="mt-1 pl-2 border-l-2 border-indigo-200">
                              <span className="font-semibold text-slate-800 text-[11px]">{proj.name}</span>
                              <ul className="list-disc list-inside text-[11px] text-slate-600">
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
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-indigo-600" />
              <span>Application History & Tailored Resumes Log</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
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
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs w-full sm:w-48 focus:outline-none focus:bg-white"
              />
            </div>
            <button
              onClick={fetchApplications}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors"
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
          <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-lg">
            No application records found. Tailor a resume using the form above to build your history log.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-bold text-[10px] tracking-wider">
                  <th className="p-3">Applied Company & Role</th>
                  <th className="p-3">Matched Skills</th>
                  <th className="p-3">Job Description Preview</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApps.map(app => (
                  <tr key={app.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{app.company}</div>
                      <div className="text-indigo-600 font-semibold text-[11px]">{app.role}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {app.matchedSkills?.slice(0, 4).map((skill, sIdx) => (
                          <span key={sIdx} className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.5 rounded">
                            {skill}
                          </span>
                        ))}
                        {(app.matchedSkills?.length || 0) > 4 && (
                          <span className="text-[10px] text-slate-400 font-medium">+{app.matchedSkills.length - 4} more</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <p className="text-slate-600 text-[11px] line-clamp-2 max-w-md">
                        {app.jdSnippet}
                      </p>
                    </td>
                    <td className="p-3 text-slate-500 whitespace-nowrap text-[11px]">
                      {new Date(app.timestamp).toLocaleDateString()} {new Date(app.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDownloadPdf(app.id, app.company, app.role)}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1"
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
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded text-xs font-semibold transition-all flex items-center gap-1"
                          title="View Tailored Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={(e) => handleDeleteApp(app.id, e)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition-colors"
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

