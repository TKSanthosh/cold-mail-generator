const fs = require('fs');

const { ENTERPRISE_JOB_BANK } = require('../server/src/services/ai_job_discovery.service');
const additional = require('./verified_additional_pool.json');

console.log('Existing bank length:', ENTERPRISE_JOB_BANK.length);
console.log('Additional pool length:', additional.length);

const additionalEnriched = [
  {
    company: 'Okta',
    role: 'Staff UI Software Engineer',
    category: 'Public Enterprise',
    employeeCount: '6,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '6-10 Years',
    salaryRange: '₹38 - 55 LPA',
    skills: ['React.js', 'TypeScript', 'JavaScript', 'Design Systems', 'Web Performance', 'Microfrontends'],
    url: 'https://www.okta.com/company/careers/opportunity/7902410?gh_jid=7902410',
    jd: 'Lead UI architecture for Okta enterprise identity suites. Build high-performance React microfrontends, accessible design system components, and resilient user workflows.'
  },
  {
    company: 'Okta',
    role: 'Staff Software Engineer - Node.js (JavaScript / TypeScript)',
    category: 'Public Enterprise',
    employeeCount: '6,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '6-10 Years',
    salaryRange: '₹38 - 58 LPA',
    skills: ['Node.js', 'TypeScript', 'JavaScript', 'REST APIs', 'Distributed Systems', 'AWS'],
    url: 'https://www.okta.com/company/careers/opportunity/7602354?gh_jid=7602354',
    jd: 'Architect distributed Node.js microservices powering Okta identity and authentication pipelines globally. Design fault-tolerant cloud APIs handling massive traffic volumes.'
  },
  {
    company: 'Okta',
    role: 'Staff Software Engineer - Backend Cloud',
    category: 'Public Enterprise',
    employeeCount: '6,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '6-10 Years',
    salaryRange: '₹36 - 54 LPA',
    skills: ['Java', 'Node.js', 'Distributed Systems', 'Microservices', 'SQL', 'AWS'],
    url: 'https://www.okta.com/company/careers/opportunity/8007085?gh_jid=8007085',
    jd: 'Lead backend system design and service scalability. Engineer high-throughput microservices, optimize distributed data caches, and ensure enterprise compliance and data protection.'
  },
  {
    company: 'Okta',
    role: 'Staff FullStack Engineer (Java & React/TypeScript)',
    category: 'Public Enterprise',
    employeeCount: '6,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '6-10 Years',
    salaryRange: '₹38 - 56 LPA',
    skills: ['React.js', 'Java', 'TypeScript', 'Spring Boot', 'REST APIs', 'MySQL'],
    url: 'https://www.okta.com/company/careers/opportunity/7929542?gh_jid=7929542',
    jd: 'Drive end-to-end full-stack feature development across Okta customer portals. Build dynamic React user interfaces and secure Java/Node.js transactional backend systems.'
  },
  {
    company: 'Databricks',
    role: 'Delivery Solutions Architect - Enterprise Cloud',
    category: 'Big Data & AI Leader',
    employeeCount: '7,000+ Employees',
    location: 'Mumbai, Maharashtra, India',
    workMode: 'Hybrid',
    experience: '5-9 Years',
    salaryRange: '₹36 - 55 LPA',
    skills: ['Python', 'Node.js', 'Cloud Architecture', 'Databricks / Spark', 'SQL', 'AWS'],
    url: 'https://boards.greenhouse.io/databricks/jobs/8735814002',
    jd: 'Architect modern Lakehouse and analytics solutions for top enterprises across India. Design scalable data processing architectures, API bridges, and cloud integrations.'
  },
  {
    company: 'Databricks',
    role: 'Deployment Strategist - Cloud Platform Solutions',
    category: 'Big Data & AI Leader',
    employeeCount: '7,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '5-8 Years',
    salaryRange: '₹35 - 52 LPA',
    skills: ['Cloud Infrastructure', 'Python', 'Node.js', 'Distributed Systems', 'Kubernetes', 'REST APIs'],
    url: 'https://boards.greenhouse.io/databricks/jobs/8630011002',
    jd: 'Partner with enterprise engineering teams to design, optimize, and scale production cloud infrastructure and distributed computing platforms on Databricks.'
  },
  {
    company: 'Twilio',
    role: 'Senior Application Engineer - Cloud Platforms',
    category: 'Public Tech Enterprise',
    employeeCount: '6,000+ Employees',
    location: 'India Remote',
    workMode: '100% Remote',
    experience: '4-7 Years',
    salaryRange: '₹28 - 42 LPA',
    skills: ['Node.js', 'Java', 'Enterprise Systems', 'RESTful APIs', 'SQL', 'AWS'],
    url: 'https://job-boards.greenhouse.io/twilio/jobs/8048661',
    jd: 'Develop custom enterprise systems and integration workflows for Twilio global communications infrastructure. Build scalable Node.js services and robust financial event processors.'
  },
  {
    company: 'Freshworks',
    role: 'Principal Solution Engineer - Cloud Platform',
    category: 'Public Enterprise SaaS',
    employeeCount: '5,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '7-11 Years',
    salaryRange: '₹36 - 52 LPA',
    skills: ['Node.js', 'React.js', 'API Integration', 'Cloud Architecture', 'MySQL', 'System Design'],
    url: 'https://jobs.smartrecruiters.com/Freshworks/744000150067891',
    jd: 'Architect high-performance enterprise customer experience platforms. Collaborate across engineering teams to design scalable cloud integrations and performant web modules.'
  },
  {
    company: 'Freshworks',
    role: 'Principal Solution Engineer - SaaS Architecture',
    category: 'Public Enterprise SaaS',
    employeeCount: '5,000+ Employees',
    location: 'Chennai, Tamil Nadu, India',
    workMode: 'Hybrid',
    experience: '7-11 Years',
    salaryRange: '₹36 - 52 LPA',
    skills: ['React.js', 'Node.js', 'REST APIs', 'Cloud Architecture', 'PostgreSQL', 'AWS'],
    url: 'https://jobs.smartrecruiters.com/Freshworks/744000150068499',
    jd: 'Lead architectural direction for Freshworks flagship SaaS products in Chennai. Deliver robust full-stack solutions, optimize database queries, and drive developer velocity.'
  },
  {
    company: 'Freshworks',
    role: 'Senior Director of Engineering - AI Studio',
    category: 'Public Enterprise SaaS',
    employeeCount: '5,000+ Employees',
    location: 'Chennai, Tamil Nadu, India',
    workMode: 'Hybrid',
    experience: '10+ Years',
    salaryRange: '₹50 - 75 LPA',
    skills: ['Generative AI', 'Full Stack Architecture', 'Node.js', 'React', 'Distributed Systems', 'AWS'],
    url: 'https://jobs.smartrecruiters.com/Freshworks/744000147296104',
    jd: 'Lead generative AI product engineering at Freshworks Chennai HQ. Architect autonomous customer service agents, low-latency LLM inference pipelines, and reactive web interfaces.'
  },
  {
    company: 'Freshworks',
    role: 'Solution Architect - Enterprise Platforms',
    category: 'Public Enterprise SaaS',
    employeeCount: '5,000+ Employees',
    location: 'Chennai, Tamil Nadu, India',
    workMode: 'Hybrid',
    experience: '7-10 Years',
    salaryRange: '₹35 - 50 LPA',
    skills: ['System Design', 'React.js', 'Node.js', 'Microservices', 'AWS', 'Database Scaling'],
    url: 'https://jobs.smartrecruiters.com/Freshworks/744000142843669',
    jd: 'Spearhead technical design for enterprise customer support software. Formulate scalable microservice blueprints, enforce API security standards, and optimize data persistence layers.'
  },
  {
    company: 'Chevron',
    role: 'Senior Integration Software Engineer',
    category: 'Fortune 500 MNC',
    employeeCount: '45,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '4-8 Years',
    salaryRange: '₹26 - 40 LPA',
    skills: ['Node.js', 'API Integrations', 'Cloud Platforms', 'SQL', 'Microservices', 'Azure'],
    url: 'https://chevron.wd5.myworkdayjobs.com/en-US/jobs/job/Bengaluru-Karnataka-India/Senior-Integration-Software-Engineer_R000072302-1',
    jd: 'Design, develop, and maintain critical enterprise integration services and real-time operational data connectors for Chevron India technology center.'
  },
  {
    company: 'Chevron',
    role: 'Senior Machine Learning & Cloud Engineer',
    category: 'Fortune 500 MNC',
    employeeCount: '45,000+ Employees',
    location: 'Bangalore, Karnataka, India',
    workMode: 'Hybrid',
    experience: '4-8 Years',
    salaryRange: '₹28 - 44 LPA',
    skills: ['Python', 'Node.js', 'Cloud ML Platforms', 'Distributed Systems', 'REST APIs', 'SQL'],
    url: 'https://chevron.wd5.myworkdayjobs.com/en-US/jobs/job/Bangalore-Karnataka-India/Senior-Machine-Learning-Engineer_R000064919',
    jd: 'Build scalable model training and serving infrastructure on cloud platforms. Create low-latency REST APIs and data processing workflows for industrial digital intelligence.'
  },
  {
    company: 'Chevron',
    role: 'Cloud Data Platform Engineer',
    category: 'Fortune 500 MNC',
    employeeCount: '45,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '3-6 Years',
    salaryRange: '₹22 - 35 LPA',
    skills: ['SQL Query Optimization', 'Python', 'Node.js', 'Data Pipelines', 'Cloud Architecture', 'AWS'],
    url: 'https://chevron.wd5.myworkdayjobs.com/en-US/jobs/job/Bengaluru-Karnataka-India/Data-Engineer_R000071869-2',
    jd: 'Engineer robust telemetry streaming pipelines, optimize transactional database performance, and build reliable backend data services for global Chevron operations.'
  },
  {
    company: 'Adobe',
    role: 'Software Development Engineer 4 - Cloud Services',
    category: 'Big Tech MNC',
    employeeCount: '30,000+ Employees',
    location: 'Bangalore, Karnataka, India',
    workMode: 'Hybrid',
    experience: '7-11 Years',
    salaryRange: '₹40 - 62 LPA',
    skills: ['Node.js', 'React.js', 'Java', 'Distributed Systems', 'AWS', 'Microservices'],
    url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Bangalore/Software-Development-Engineer-4_R170532',
    jd: 'Lead architecture of mission-critical Adobe Experience Platform services. Build resilient distributed backends, scalable REST endpoints, and collaborative web tooling.'
  },
  {
    company: 'Adobe',
    role: 'Software Development Engineer 4 - Creative Cloud Platform',
    category: 'Big Tech MNC',
    employeeCount: '30,000+ Employees',
    location: 'Noida, Uttar Pradesh, India',
    workMode: 'Hybrid',
    experience: '7-11 Years',
    salaryRange: '₹40 - 62 LPA',
    skills: ['React.js', 'TypeScript', 'Node.js', 'Cloud Architecture', 'Web Performance', 'REST APIs'],
    url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Noida/Software-Development-Engineer-4_R170262',
    jd: 'Architect web capabilities for Adobe next-generation Creative Cloud desktop and browser apps in Noida. Optimize render performance, memory footprints, and reactive state stores.'
  },
  {
    company: 'Adobe',
    role: 'Software Development Engineer 4 - Core Platform',
    category: 'Big Tech MNC',
    employeeCount: '30,000+ Employees',
    location: 'Noida, Uttar Pradesh, India',
    workMode: 'Hybrid',
    experience: '7-11 Years',
    salaryRange: '₹40 - 62 LPA',
    skills: ['Node.js', 'Java', 'Distributed Systems', 'React.js', 'Microservices', 'SQL'],
    url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Noida/Software-Development-Engineer-4_R170647',
    jd: 'Drive technical direction for Adobe document services and platform foundations. Build scalable cloud APIs, conduct architectural reviews, and optimize database access.'
  },
  {
    company: 'Salesforce',
    role: 'Technical Manager - API Platform & MuleSoft',
    category: 'Global Cloud Enterprise',
    employeeCount: '75,000+ Employees',
    location: 'India - Bangalore',
    workMode: 'Hybrid',
    experience: '7-11 Years',
    salaryRange: '₹38 - 58 LPA',
    skills: ['API Management', 'Node.js', 'Integration Architecture', 'Microservices', 'Cloud Security'],
    url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/India---Bangalore/Mulesoft-Technical-Manager_JR327156',
    jd: 'Lead high-caliber engineering teams delivering MuleSoft API management and runtime fabric. Ensure enterprise-grade API performance, security, and developer productivity.'
  },
  {
    company: 'Salesforce',
    role: 'DevOps & Cloud Platform Technical Architect',
    category: 'Global Cloud Enterprise',
    employeeCount: '75,000+ Employees',
    location: 'India - Bangalore',
    workMode: 'Hybrid',
    experience: '7-11 Years',
    salaryRange: '₹38 - 58 LPA',
    skills: ['CI/CD Pipelines', 'Kubernetes', 'Cloud Infrastructure', 'Node.js', 'AWS', 'Docker'],
    url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/India---Bangalore/Salesforce-DevOps---Technical-Architect_JR353962',
    jd: 'Architect automated cloud infrastructure, release pipelines, and container orchestrations powering thousands of daily production deployments across Salesforce.'
  },
  {
    company: 'Salesforce',
    role: 'Senior Data Platform Engineer',
    category: 'Global Cloud Enterprise',
    employeeCount: '75,000+ Employees',
    location: 'India - Hyderabad',
    workMode: 'Hybrid',
    experience: '4-7 Years',
    salaryRange: '₹28 - 42 LPA',
    skills: ['Python', 'SQL Query Optimization', 'Database Indexing', 'Node.js', 'Cloud Infrastructure', 'AWS'],
    url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/India---Hyderabad/Sr-Data-Engineer--Python---SQL-exp-mandatory-_JR358536',
    jd: 'Build robust data infrastructure, streaming ingestion pipelines, and database query optimizations for Salesforce Hyderabad technology center.'
  },
  {
    company: 'Autodesk',
    role: 'Software Engineering Manager (Java, AWS, Search)',
    category: 'Global Tech Enterprise',
    employeeCount: '14,000+ Employees',
    location: 'Pune, Maharashtra, India',
    workMode: 'Hybrid',
    experience: '8-12 Years',
    salaryRange: '₹40 - 65 LPA',
    skills: ['Java', 'Node.js', 'AWS', 'Search Systems', 'Microservices', 'System Design'],
    url: 'https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/Pune-IND/Software-Engineering-Manager--Java--AWS--Search-_26WD100857-1',
    jd: 'Lead search and cloud platform engineering squads in Autodesk Pune. Architect high-throughput distributed search services, microservice APIs, and mentor senior developers.'
  },
  {
    company: 'Autodesk',
    role: 'Principal Engineer - Agentic AI & Developer Automation',
    category: 'Global Tech Enterprise',
    employeeCount: '14,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '8-13 Years',
    salaryRange: '₹45 - 70 LPA',
    skills: ['Agentic AI', 'Python', 'Node.js', 'System Architecture', 'Cloud Services', 'REST APIs'],
    url: 'https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/Bengaluru-IND/Principal-Engineer---Agentic-AI_26WD99802',
    jd: 'Define technical strategy and build agentic AI systems that automate software delivery workflows across Autodesk engineering organizations worldwide.'
  },
  {
    company: 'HP Inc.',
    role: 'AI Solutions & Full Stack Engineer',
    category: 'Fortune 100 MNC',
    employeeCount: '58,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '3-6 Years',
    salaryRange: '₹24 - 38 LPA',
    skills: ['Python', 'Node.js', 'React.js', 'AI Solutions', 'RESTful APIs', 'Cloud Architecture'],
    url: 'https://hp.wd5.myworkdayjobs.com/en-US/ExternalCareerSite/job/Bengaluru-Karnataka-India/AI-Solutions-Engineer_3166378-1',
    jd: 'Develop AI-driven customer support tools and web service platforms. Implement reactive frontends, performant API gateways, and cloud inference models in HP Bengaluru.'
  },
  {
    company: 'HP Inc.',
    role: 'Agentic AI Systems Engineer',
    category: 'Fortune 100 MNC',
    employeeCount: '58,000+ Employees',
    location: 'Bengaluru, Karnataka, India',
    workMode: 'Hybrid',
    experience: '3-7 Years',
    salaryRange: '₹26 - 40 LPA',
    skills: ['AI Agents', 'Python', 'Node.js', 'Microservices', 'Cloud Architecture', 'Docker'],
    url: 'https://hp.wd5.myworkdayjobs.com/en-US/ExternalCareerSite/job/Bengaluru-Karnataka-India/Agentic-AI-Engineer_3164655-1',
    jd: 'Build autonomous agents and cloud workflow orchestrators for HP intelligent device ecosystem. Focus on event queues, distributed backend microservices, and system reliability.'
  }
];

const combined = [...ENTERPRISE_JOB_BANK, ...additionalEnriched];
console.log('Total combined jobs in bank:', combined.length);

fs.writeFileSync('tests/combined_bank.json', JSON.stringify(combined, null, 2));
console.log('Written to tests/combined_bank.json successfully.');
process.exit(0);
