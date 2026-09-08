# ⚡ AI Resume Tailor & ATS Optimizer (Browser Extension)

A high-performance Manifest V3 browser extension for Chromium browsers (**Google Chrome, Microsoft Edge, Brave, Arc**) that supercharges your job application workflow.

Whenever you navigate to any job posting page (LinkedIn, Naukri, Indeed, Greenhouse, Lever, Workday, or any company career page), this extension automatically detects the **Job Description (JD)**, **Role**, and **Company**. With a single click of the **Generate** button, it instantly tailors your resume using AI to maximize your ATS match score and downloads a customized 1-page PDF resume ready to submit.

---

## 🌟 Key Features

1. **Auto JD & Role Scraper**:
   - Deep native selectors for **LinkedIn Jobs**, **Naukri.com**, **Indeed**, **Greenhouse**, **Lever**, **Glassdoor**, etc.
   - Smart universal fallback that scans any career website for job descriptions, qualifications, and requirements.
2. **In-Page Floating Action Button**:
   - A floating `⚡ Optimize Resume` pill appears directly on detected job postings.
   - Click to open an on-page modal without having to navigate to browser toolbars.
3. **Instant ATS Optimization & 1-Page PDF Generation**:
   - Analyzes JD keywords and embeds matched competencies into your professional profile summary.
   - Generates a clean 1-page ATS-optimized PDF resume on the fly and downloads it directly to your machine.
4. **ATS Compatibility Gauge & Matched Skills**:
   - Displays real-time estimated ATS Match Score (e.g. 96% Match) and highlights matched technical skill chips.
5. **Bonus: Recruiter Cold Outreach Draft**:
   - Generates a tailored cold email pitch for the recruiter with 1-click clipboard copy.

---

## 🚀 How to Install in Your Browser

### Step 1: Open Extension Management Page
- **In Google Chrome / Brave**:
  Navigate to `chrome://extensions/`
- **In Microsoft Edge**:
  Navigate to `edge://extensions/`

### Step 2: Enable Developer Mode
- In the top-right corner of the Extensions page, toggle the **"Developer mode"** switch to **ON**.

### Step 3: Load the Extension
1. Click the **"Load unpacked"** button in the top-left corner.
2. Browse to this folder on your computer:
   ```
   c:\Users\Santhosh\.gemini\antigravity\scratch\cold-mail-generator\extension
   ```
3. Select the folder and click **Select Folder**.
4. The **"AI Resume Tailor & ATS Optimizer"** extension will appear in your extensions list!

### Step 4: Pin to Toolbar
- Click the Extensions puzzle icon (🧩) in your browser toolbar and click the **Pin** icon next to **AI Resume Tailor**.

---

## 🎯 How to Use

### Method 1: In-Page Floating Quick-Action
1. Make sure your local application server is running (`npm start` or `npm run dev:server` on `http://localhost:5000`).
2. Open any job posting on **LinkedIn**, **Naukri**, or **Indeed**.
3. A floating `⚡ Optimize Resume` button will appear on the bottom-right corner of the page.
4. Click it to open the quick-action modal.
5. Review the extracted role, company, and JD, then click **"Generate & Download Tailored Resume"**.
6. The AI tailors your resume in ~2-3 seconds, calculates your ATS score, and downloads `Santhosh_T_K_[Role]_[Company].pdf` directly to your Downloads folder!

### Method 2: Extension Toolbar Popup
1. On any job posting (or any page with job text), click the **⚡ AI Resume Tailor** icon in your browser toolbar.
2. The popup automatically displays the detected Role, Company, and Job Description.
3. Click **"⚡ Optimize Resume for this Role"**.
4. View your **ATS Match Score**, review matched skills tags, and click **📥 Download ATS PDF**.
5. Click **✉️ Recruiter Email** if you wish to copy a personalized cold email for this role.

---

## ⚙️ Configuration & Settings
Click the **⚙️ Settings** icon in the extension popup to customize:
- **Backend Server URL**: Default is `http://localhost:5000`. If you deploy the backend to Render, AWS, or Vercel, simply paste the live URL here.
- **User Profile Key**: Corresponds to your resume profile sandbox (e.g., `tksanthosh494_gmail_com`).
- **Floating Button Toggle**: Turn the on-page floating button on/off.
- **Auto-Download PDF**: Automatically initiates the PDF download as soon as AI generation completes.
