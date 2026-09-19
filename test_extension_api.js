const fs = require('fs');
const path = require('path');

async function testExtensionIntegration() {
  console.log('=== Step 1: Validating Manifest V3 and Extension Files ===');
  const extDir = path.join(__dirname, 'extension');
  const manifestPath = path.join(extDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json does not exist!');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log('Manifest name:', manifest.name, 'v' + manifest.version);
  console.log('Manifest permissions:', manifest.permissions);

  // Check referenced files
  const requiredFiles = [
    manifest.action.default_popup,
    manifest.background.service_worker,
    ...manifest.content_scripts[0].js,
    ...manifest.content_scripts[0].css,
    ...Object.values(manifest.icons)
  ];

  for (const rel of requiredFiles) {
    const fullPath = path.join(extDir, rel);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Referenced file missing: ${rel}`);
    }
    const stat = fs.statSync(fullPath);
    console.log(`  [OK] ${rel} (${stat.size} bytes)`);
  }

  console.log('\n=== Step 2: Testing Backend Server & Tailor Flow ===');
  // Start server or import handler directly
  const { tailorResume } = require('./server/src/services/llm.service');
  const { getUserResume } = require('./server/src/services/user.service');
  const { generateResumePdf } = require('./server/src/services/pdf.service');

  const testResume = getUserResume('tksanthosh494_gmail_com') || getUserResume('default_user');
  if (!testResume) {
    throw new Error('Base resume not found!');
  }
  console.log(`  [OK] Base resume found for candidate: ${testResume.personalInfo?.name}`);

  const sampleJd = `
    Job Title: Senior Full Stack Engineer (React / Node.js)
    Company: TechVision Innovations
    Responsibilities:
    - Design and develop scalable microservices using Node.js and Express.
    - Build responsive, modern web UI using React.js, Redux, and modern CSS.
    - Optimize REST APIs, database queries (MySQL / MongoDB), and ensure 99.9% uptime.
    - Implement CI/CD pipelines and deploy to AWS cloud environments.
    Requirements:
    - 3+ years experience with Full Stack JavaScript (Node.js, React.js).
    - Strong understanding of RESTful API design, relational databases, and Docker.
  `;

  console.log('  Testing resume tailoring...');
  const tailored = await tailorResume(testResume, sampleJd);
  console.log(`  [OK] Tailored title: "${tailored.personalInfo?.title}"`);
  console.log(`  [OK] Tailored summary: "${tailored.summary?.slice(0, 100)}..."`);
  console.log(`  [OK] ATS Keywords count: ${tailored.atsKeywords?.length || 0}`);

  const tempPdfPath = path.join(__dirname, 'server', 'uploads', `test_extension_verify_${Date.now()}.pdf`);
  await generateResumePdf(tailored, tempPdfPath);
  const pdfStat = fs.statSync(tempPdfPath);
  console.log(`  [OK] Generated tailored PDF: ${tempPdfPath} (${pdfStat.size} bytes)`);

  const headerBuf = Buffer.alloc(4);
  const fd = fs.openSync(tempPdfPath, 'r');
  fs.readSync(fd, headerBuf, 0, 4, 0);
  fs.closeSync(fd);
  const magic = headerBuf.toString('utf8');
  if (magic !== '%PDF') {
    throw new Error(`Invalid PDF magic bytes: ${magic}`);
  }
  console.log(`  [OK] PDF Header validated: "${magic}"`);

  // Clean up temp verify file
  try { fs.unlinkSync(tempPdfPath); } catch (e) {}

  console.log('\n✅ ALL EXTENSION ASSETS AND BACKEND INTEGRATION TESTS PASSED!');
}

testExtensionIntegration().catch(err => {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
});
