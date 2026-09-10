/**
 * Mock Naukri DOM Page Generator & Test Fixtures
 * Creates realistic Naukri HTML DOM structures for automated testing
 * ZERO network requests to real Naukri servers.
 */

function generateMockJobPage(options = {}) {
  const {
    jobTitle = 'Senior Full Stack Engineer',
    company = 'Infosys Technologies',
    isAlreadyApplied = false,
    isExternalApply = false,
    hasChatbot = true,
    questions = []
  } = options;

  let applyControlHtml = '';
  if (isAlreadyApplied) {
    applyControlHtml = `<button class="applied-button" disabled>Applied</button><span class="badge">Already Applied</span>`;
  } else if (isExternalApply) {
    applyControlHtml = `<button class="external-apply">Apply on company site</button>`;
  } else {
    applyControlHtml = `<button id="apply-button" class="apply-button">Apply</button>`;
  }

  let chatbotHtml = '';
  if (hasChatbot && questions.length > 0) {
    const qItemsHtml = questions.map((q, qIdx) => {
      let inputHtml = '';
      if (q.type === 'single_choice') {
        inputHtml = `<div class="chip-container">
          ${q.options.map((opt, oIdx) => `
            <label class="chip" data-value="${opt}">
              <input type="radio" name="q_${qIdx}" value="${opt}">
              <span>${opt}</span>
            </label>
          `).join('\n')}
        </div>`;
      } else if (q.type === 'multiple_choice') {
        inputHtml = `<div class="checkbox-container">
          ${q.options.map((opt, oIdx) => `
            <label class="checkbox-option">
              <input type="checkbox" name="q_${qIdx}[]" value="${opt}">
              <span>${opt}</span>
            </label>
          `).join('\n')}
        </div>`;
      } else if (q.type === 'dropdown') {
        inputHtml = `<select name="q_${qIdx}">
          <option value="">Select an option</option>
          ${q.options.map(opt => `<option value="${opt}">${opt}</option>`).join('\n')}
        </select>`;
      } else if (q.type === 'textarea') {
        inputHtml = `<textarea placeholder="Type your answer here..." rows="3"></textarea>`;
      } else {
        inputHtml = `<input type="text" placeholder="Type your answer..." />`;
      }

      return `
        <div class="botMsg chat-bubble incomingMsg" data-turn="${qIdx + 1}">
          <div class="msg-text">${q.question}${q.isMandatory ? ' *' : ''}</div>
          <div class="user-input-section">
            ${inputHtml}
          </div>
        </div>
      `;
    }).join('\n');

    chatbotHtml = `
      <div class="chatbot-container chatbot_Drawer chatbot-wrapper" role="dialog">
        <div class="chatbot-header">
          <span class="title">Apply to ${company}</span>
          <button type="button" class="chatbot_close crossIcon" aria-label="Close">✕</button>
        </div>
        <div class="chatbot-body">
          ${qItemsHtml}
        </div>
        <div class="chatbot-footer">
          <button type="button" class="send-btn">Send</button>
          <button type="submit" class="submit-application">Submit Application</button>
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${jobTitle} - ${company} on Naukri</title>
    </head>
    <body>
      <div class="job-header">
        <h1 class="title">${jobTitle}</h1>
        <h2 class="comp-name">${company}</h2>
        <div class="loc">Bangalore/Bengaluru</div>
        <div class="exp">3-5 Yrs</div>
      </div>
      <div class="apply-section">
        ${applyControlHtml}
      </div>
      ${chatbotHtml}
    </body>
    </html>
  `;
}

// 100 Realistic Test Jobs Dataset
function generate100TestJobs() {
  const jobs = [];
  const companies = [
    'Infosys', 'TCS', 'Wipro', 'Cognizant', 'HCLTech', 'Tech Mahindra', 'Accenture', 'Capgemini',
    'LTI Mindtree', 'Persistent Systems', 'Cisco', 'Amazon Web Services', 'Microsoft India',
    'Google Cloud', 'Oracle Financial', 'SAP Labs', 'IBM India', 'Dell Technologies', 'Adobe', 'Salesforce'
  ];

  const roles = [
    'Full Stack Engineer', 'Backend Developer', 'Frontend Developer', 'Node.js Developer',
    'React Developer', 'DevOps Engineer', 'Cloud Architect', 'Python Software Engineer'
  ];

  for (let i = 1; i <= 100; i++) {
    const comp = companies[(i - 1) % companies.length];
    const role = roles[(i - 1) % roles.length];
    const id = `mock_job_${String(i).padStart(3, '0')}`;
    const url = `http://localhost:5099/mock-job/${id}`;

    let scenario = 'NORMAL';
    let questions = [];

    if (i <= 20) {
      // 20 jobs with 0 questions (Direct Easy Apply)
      scenario = 'ZERO_QUESTIONS';
      questions = [];
    } else if (i <= 40) {
      // 20 jobs with 1 question (Notice Period single choice)
      scenario = 'SINGLE_QUESTION';
      questions = [{
        id: `q_np_${i}`,
        question: 'What is your official notice period?',
        type: 'single_choice',
        options: ['15 Days or less', '1 Month', '2 Months', '3 Months'],
        isMandatory: true
      }];
    } else if (i <= 60) {
      // 20 jobs with multiple questions (Notice + CTC + Relocation)
      scenario = 'MULTIPLE_QUESTIONS';
      questions = [
        {
          id: `q_np_${i}`,
          question: 'What is your official notice period?',
          type: 'single_choice',
          options: ['15 Days or less', '1 Month', '2 Months', '3 Months'],
          isMandatory: true
        },
        {
          id: `q_ctc_${i}`,
          question: 'What is your current CTC (in LPA)?',
          type: 'text',
          options: [],
          isMandatory: true
        },
        {
          id: `q_tech_${i}`,
          question: 'Which of the following cloud platforms do you have production experience in?',
          type: 'multiple_choice',
          options: ['AWS', 'Azure', 'GCP', 'None of the above'],
          isMandatory: false
        }
      ];
    } else if (i <= 70) {
      // 10 jobs with duplicate notice question
      scenario = 'DUPLICATE_QUESTIONS';
      questions = [{
        id: 'q_duplicate_notice',
        question: 'What is your notice period?',
        type: 'single_choice',
        options: ['Immediate', '15 Days', '30 Days', '60 Days'],
        isMandatory: true
      }];
    } else if (i <= 80) {
      // 10 jobs with unique role questions
      scenario = 'UNIQUE_QUESTIONS';
      questions = [{
        id: `q_unique_${i}`,
        question: `How many years of experience do you have in ${role.split(' ')[0]}?`,
        type: 'single_choice',
        options: ['1-2 Years', '3-4 Years', '5+ Years'],
        isMandatory: true
      }];
    } else if (i <= 85) {
      // 5 jobs with unexpected questions mid-apply
      scenario = 'UNEXPECTED_QUESTION';
      questions = [
        {
          id: `q_unexp_${i}`,
          question: 'Do you hold an active US B1/B2 visa or European Blue Card?',
          type: 'single_choice',
          options: ['Yes, valid for >1 year', 'Yes, expiring soon', 'No'],
          isMandatory: true
        }
      ];
    } else if (i <= 90) {
      // 5 jobs with failure
      scenario = 'APPLICATION_FAILURE';
    } else if (i <= 95) {
      // 5 jobs with timeout
      scenario = 'TIMEOUT';
    } else {
      // 5 jobs with auth / session expired
      scenario = 'SESSION_EXPIRED';
    }

    jobs.push({
      jobId: id,
      id,
      company: `${comp} ${i > 20 ? 'Division ' + Math.ceil(i / 10) : ''}`.trim(),
      jobTitle: `${role} - Team ${i}`,
      jobUrl: url,
      location: 'Bangalore / Remote',
      experience: '3-6 Yrs',
      appliedAt: new Date(Date.now() - (100 - i) * 3600000).toISOString(),
      status: i <= 10 ? 'SUBMITTED' : 'SUBMISSION_UNCONFIRMED',
      verificationStatus: i <= 10 ? 'VERIFIED' : 'UNVERIFIED',
      scenario,
      mockQuestions: questions
    });
  }

  return jobs;
}

module.exports = {
  generateMockJobPage,
  generate100TestJobs
};
