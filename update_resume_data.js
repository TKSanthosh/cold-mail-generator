const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

require('./server/node_modules/dotenv').config({ path: path.join(__dirname, '.env') });

const updatedResume = {
  personalInfo: {
    name: "SANTHOSH T K",
    title: "Software Development Engineer 2 (SDE2)",
    location: "Bangalore, Karnataka | Remote",
    email: "tksanthosh494@gmail.com",
    phone: "+91 8825802707",
    portfolio: "https://santhoshtk-portfolio.netlify.app/",
    linkedin: "linkedin.com/in/santhosh-tk",
    github: "github.com/TKSanthosh"
  },
  summary: "Software Development Engineer 2 (SDE2) with 4+ years of experience engineering high-performance web applications across Node.js, Express.js, React.js, TypeScript, and AWS. Proven track record in designing resilient RESTful APIs, secure authentication architectures, optimizing MySQL and MongoDB query performance, and resolving complex production challenges. Deep expertise in asynchronous programming, MVC design, scalable caching, and modern CI/CD deployment pipelines.",
  skills: {
    Backend: [
      "Node.js",
      "TypeScript",
      "Express.js",
      "RESTful APIs",
      "API Development & Integration",
      "JWT Authentication",
      "RBAC & Authorization",
      "Middleware",
      "MVC Architecture",
      "Asynchronous Programming"
    ],
    Frontend: [
      "React.js",
      "TypeScript",
      "JavaScript (ES6+)",
      "React Hooks",
      "HTML5",
      "CSS3",
      "Reusable Components"
    ],
    Databases: [
      "MySQL",
      "MongoDB",
      "SQL Joins",
      "Indexing",
      "Query Optimization"
    ],
    "System Design": [
      "System Design Fundamentals",
      "Scalability",
      "Load Balancing",
      "Caching",
      "Database Scaling",
      "Microservices Concepts"
    ],
    "Tools & Cloud": [
      "Git",
      "GitHub",
      "Postman",
      "npm",
      "VS Code",
      "JSON",
      "AWS",
      "CI/CD"
    ],
    "AI & Developer Tools": [
      "Cursor",
      "Claude Code",
      "GitHub Copilot",
      "Generative AI / LLM APIs"
    ]
  },
  experience: [
    {
      role: "Software Development Engineer 2 (SDE2)",
      company: "IQVIA, Bangalore",
      duration: "June 2026 – Present",
      project: "Expert Events – Clinical Engagement Management Platform",
      highlights: [
        "Developed a dynamic engagement-creation stepper using React.js, with configurable multi-step validation logic based on event type.",
        "Engineered Node.js and Express.js backend services and a multi-level approval workflow in MySQL with administrator override capabilities.",
        "Spearheaded end-to-end session lifecycle handling for live engagement events, from attendee onboarding through completion.",
        "Collaborated with business analysts, technical leads, and client stakeholders to translate product roadmaps into reliable technical solutions.",
        "Maintained automated CI/CD deployment workflows using GitHub Actions across staging and production environments."
      ]
    },
    {
      role: "Software Developer",
      company: "Sify Technologies, Chennai",
      duration: "July 2023 – June 2026",
      projects: [
        {
          name: "Exam Engine – Exam Delivery Platform",
          highlights: [
            "Migrated legacy backend services from PHP to Node.js and MongoDB, decreasing recurring production issues by **30%**.",
            "Architected JWT authentication with fine-grained authorization (RBAC) to ensure tamper-proof exam integrity.",
            "Optimized MySQL and MongoDB indexing strategies to accelerate query retrieval and decrease database load.",
            "Resolved asynchronous race conditions and UI rendering bottlenecks across high-concurrency exam sessions.",
            "Deployed structured logging and centralized exception handling to accelerate triage and incident resolution."
          ]
        },
        {
          name: "QPTool – Exam Configuration Platform",
          highlights: [
            "Engineered robust backend microservices utilizing Node.js, Express.js, MySQL, and MongoDB.",
            "Designed high-throughput RESTful APIs and orchestrated seamless integration with React.js single-page applications.",
            "Crafted reusable React.js component libraries with optimized rendering performance and clean state management.",
            "Enhanced API response latency by **20%** through targeted server-side caching and SQL query optimization.",
            "Refactored legacy services into modular architectures, reinforcing input validation, data sanitization, and security policies."
          ]
        }
      ]
    }
  ],
  internship: {
    role: "Full Stack Intern",
    company: "Sify Technologies – CHIP 2023 Program",
    duration: "February 2023 – June 2023",
    highlights: [
      "Built responsive frontend views and backend REST services utilizing React.js, Node.js, Express.js, and MySQL.",
      "Participated in Agile sprints, production code reviews, and Git-driven collaboration workflows.",
      "Contributed to internal engineering utilities adopted by core development teams across production initiatives."
    ]
  },
  achievements: [
    "Delivered **8+ major features** across two mission-critical production systems.",
    "Mentored junior engineers on backend development patterns, clean architecture, and coding standards.",
    "Contributed to core PHP-to-Node.js migration and architecture modernization initiatives."
  ],
  education: [
    {
      degree: "Bachelor of Engineering (B.E.), Electronics & Communication Engineering",
      institution: "Velammal College of Engineering & Technology, Madurai",
      duration: "2023",
      details: "CGPA: 9.15 / 10"
    }
  ]
};

async function updateAll() {
  const jsonStr = JSON.stringify(updatedResume, null, 2);
  const compressedGz = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 9 });

  // 1. Update server/resume.json
  const masterPath = path.join(__dirname, 'server/resume.json');
  fs.writeFileSync(masterPath, jsonStr, 'utf8');
  console.log(`[1] Updated ${masterPath}`);

  // 2. Update server/seed_backup.json if it exists
  const seedPath = path.join(__dirname, 'server/seed_backup.json');
  if (fs.existsSync(seedPath)) {
    fs.writeFileSync(seedPath, jsonStr, 'utf8');
    console.log(`[2] Updated ${seedPath}`);
  }

  // 3. Update all user sandboxes matching santhosh or default_user
  const usersDir = path.join(__dirname, 'server/users');
  if (fs.existsSync(usersDir)) {
    const userFolders = fs.readdirSync(usersDir);
    for (const folder of userFolders) {
      if (folder.includes('santhosh') || folder === 'default_user') {
        const uResumeJson = path.join(usersDir, folder, 'resume.json');
        const uResumeGz = path.join(usersDir, folder, 'resume.json.gz');
        fs.writeFileSync(uResumeJson, jsonStr, 'utf8');
        fs.writeFileSync(uResumeGz, compressedGz);
        console.log(`[3] Updated sandbox for user: ${folder}`);
      }
    }
  }

  // 4. Update Supabase Cloud Database if configured
  try {
    const { supabaseSaveResume, isSupabaseConfigured } = require('./server/src/services/supabase.service');
    if (isSupabaseConfigured()) {
      console.log('[4] Uploading updated resume to Supabase cloud database...');
      await supabaseSaveResume('tksanthosh494_gmail_com', updatedResume);
      console.log('[4] Successfully saved to Supabase for tksanthosh494_gmail_com');
    } else {
      console.log('[4] Supabase not configured, skipped cloud sync.');
    }
  } catch (err) {
    console.warn('[4] Supabase sync warning:', err.message);
  }

  console.log('\nAll resume locations successfully updated with Naukri ATS optimizations!');
}

updateAll();
