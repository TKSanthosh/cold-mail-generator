# 🚀 Cold Email & Resume Tailor Generator

An automated full-stack application designed to craft high-converting, personalized cold emails and dynamically tailor executive resume PDFs for job applications using **Google OAuth2 Gmail API** and **NVIDIA NIM (Llama 3.2)**.

![Dashboard Preview](https://via.placeholder.com/1200x600.png?text=Cold+Email+%26+Resume+Tailor+Dashboard)

---

## ✨ Features

- **📧 Smart HR Domain & Name Parser**: Automatically parses email addresses like `santhosh@indi.co` into Name (`Santhosh`) and Company (`Indi`), while mapping generic handles like `careers@` or `jobs@` to `Hiring Team`.
- **🎯 Dynamic Resume Tailoring**: Given a Job Description (JD), tweaks your professional summary and reorders skill keywords to maximize ATS and recruiter alignment—*without fabricating or adding fake skills*.
- **📄 Programmatic PDF Resume Generation**: Uses `pdfkit` to compile single-page executive A4 resumes and automatically attaches them to outgoing emails.
- **🔐 Google OAuth2 Gmail Integration**: Authenticates securely via official Google Cloud APIs to send customized cold emails directly from your verified Gmail address.
- **📊 Bulk Outreach Campaigns**: Batch process lists of HR emails against a common target job description with real-time progress indicators and live status logs.
- **📜 Complete Outreach History & Logging**: Tracks every outreach attempt (Company, HR Name, Email, Resume Type sent, Timestamp, Status) with searchable records and 1-click CSV export for your job tracking spreadsheet.
- **✏️ Interactive Baseline Editor**: Customize your standard resume JSON template on the fly right from your browser.

---

## 📱 Mobile Usage & Cloud Deployment

Because this app includes a backend service (for PDF compilation and secure Gmail OAuth sending), you can host it for free on **Render**, **Railway**, or **Fly.io** directly connected to this GitHub repo:

### 1-Click Deployment on Render (Free)
1. Fork / Clone this repository to your GitHub account.
2. Sign up on [Render.com](https://render.com/).
3. Click **New +** ➔ **Web Service** ➔ Select your repository.
4. Set the following build settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Under **Environment Variables**, add:
   - `NVIDIA_API_KEY`: Your NVIDIA NIM key
   - `PORT`: `10000` (or leave default)
6. Once deployed, you will get a permanent public HTTPS URL (e.g., `https://cold-mail-generator.onrender.com`) that you can open on your **mobile phone** anytime to send tailored cold emails without turning on your laptop!

---

## 🛠️ Local Development Setup

### Prerequisites
- Node.js (v18+)
- NVIDIA NIM API Key
- Google Cloud OAuth2 Client Secret JSON

### Installation & Run

1. Clone repository:
   ```bash
   git clone https://github.com/TKSanthosh/cold-mail-generator.git
   cd cold-mail-generator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch Application:
   - On Windows: Run `.\Start_App.ps1`
   - Or run manually:
     ```bash
     # Start Backend
     cd server && npm start
     # In another terminal, start Frontend
     cd client && npm run dev
     ```

4. Open your browser at `http://localhost:5174`.

---

## 🛡️ License
MIT License. Created by [Santhosh T K](https://github.com/TKSanthosh).
