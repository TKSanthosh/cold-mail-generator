/**
 * Resume Optimizer Validation Test Suite
 * 
 * Comprehensive automated tests for:
 * 1. Matching JD (Authentic Full Stack Stack)
 * 2. Unsupported Technologies JD (Kubernetes, Kafka, Go, Rust - must be classified as unsupported and never added)
 * 3. Irrelevant / Misleading JD (Graceful fallback)
 * 4. Missing / Empty JD (Proper rejection)
 * 5. Resume with Missing Sections (Resilient defaults)
 * 6. PDF 1-Page Layout Constraint & Readable Font Sizes
 * 7. Immutable Field Protection (Name, Companies, Dates, Education)
 * 8. Hallucinated Skill Detection & Metric Inflation Guard
 * 9. Microscopic White Text Removal (Zero hidden ATS keywords)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { analyzeJd } = require('../server/src/services/jd_analyzer.service');
const { matchResumeToJd, extractCanonicalSkillSet } = require('../server/src/services/resume_matcher.service');
const { validateAndSanitizeResume } = require('../server/src/services/resume_validator.service');
const { tailorResume } = require('../server/src/services/llm.service');
const { generateResumePdf, validatePdfOutput } = require('../server/src/services/pdf.service');

const canonicalResume = JSON.parse(fs.readFileSync(path.join(__dirname, '../server/resume.json'), 'utf8'));

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

async function runAllTests() {
  console.log('\n================================================================================');
  console.log('  RESUME OPTIMIZER VALIDATION & INTEGRITY TEST SUITE');
  console.log('================================================================================\n');

  // Test 1: Matching JD
  await testAsync('1. Matching JD: High relevance matching with authentic candidate stack', async () => {
    const jd = `
      Senior Full Stack Engineer
      We are looking for an experienced Full Stack Developer with 4+ years of experience.
      Requirements:
      - Strong proficiency in Node.js, Express.js, TypeScript, and React.js
      - Experience with MySQL, MongoDB, and RESTful APIs
      - Cloud experience with AWS and CI/CD version control using Git
    `;

    const analyzed = analyzeJd(jd);
    assert(analyzed.technologies.languages.includes('TypeScript'), 'TypeScript should be extracted');
    assert(analyzed.technologies.frameworks.includes('Node.js'), 'Node.js should be extracted');

    const matched = matchResumeToJd(canonicalResume, analyzed);
    assert(matched.matchedSkills.includes('Node.js'), 'Node.js should be in matchedSkills');
    assert(matched.matchedSkills.includes('React.js'), 'React.js should be in matchedSkills');
    assert(matched.atsScore >= 85, `ATS score should be high, got ${matched.atsScore}`);

    const tailored = await tailorResume(canonicalResume, jd);
    assert(tailored.personalInfo.name === 'SANTHOSH T K', 'Candidate name must remain authentic');
    assert(tailored.skills.Backend.includes('Node.js'), 'Backend skills must contain Node.js');
  });

  // Test 2: Unsupported Technologies JD
  await testAsync('2. Unsupported Technologies JD: Foreign tools classified as unsupported & strictly omitted', async () => {
    const jd = `
      Staff Systems Engineer
      Requirements:
      - 5+ years with Kubernetes, Kafka, Go (Golang), Rust, Docker, and Apache Cassandra
    `;

    const analyzed = analyzeJd(jd);
    const matched = matchResumeToJd(canonicalResume, analyzed);

    // Unsupported requirements should capture Kubernetes, Kafka, Go, Rust, Docker, Cassandra
    const unsupportedLower = matched.unsupportedRequirements.map(s => s.toLowerCase());
    assert(unsupportedLower.some(s => s.includes('kubernetes') || s.includes('kafka') || s.includes('go') || s.includes('rust')),
      'Kubernetes, Kafka, or Go must be flagged in unsupportedRequirements');

    const tailored = await tailorResume(canonicalResume, jd);
    const allTailoredSkills = Object.values(tailored.skills).flat().map(s => s.toLowerCase());

    assert(!allTailoredSkills.includes('kubernetes'), 'Kubernetes must NOT be added to tailored skills');
    assert(!allTailoredSkills.includes('kafka'), 'Kafka must NOT be added to tailored skills');
    assert(!allTailoredSkills.includes('go') && !allTailoredSkills.includes('golang'), 'Go must NOT be added to tailored skills');
    assert(!allTailoredSkills.includes('rust'), 'Rust must NOT be added to tailored skills');
  });

  // Test 3: Irrelevant / Misleading JD
  await testAsync('3. Irrelevant / Misleading JD: Graceful handling without resume corruption', async () => {
    const junkJd = `
      Executive Head Chef & Culinary Director
      Seeking a Michelin-star pastry chef with experience in French cuisine, sous-vide, and kitchen inventory.
    `;

    const analyzed = analyzeJd(junkJd);
    const matched = matchResumeToJd(canonicalResume, analyzed);
    assert(matched.matchedSkills.length === 0, 'No technical skills should match culinary JD');

    const tailored = await tailorResume(canonicalResume, junkJd);
    assert(tailored.personalInfo.name === 'SANTHOSH T K', 'Candidate identity intact');
    assert(tailored.skills.Backend.includes('Node.js'), 'Candidate core stack preserved');
  });

  // Test 4: Missing or Empty JD
  await testAsync('4. Missing or Empty JD: Returns standard resume safely without errors', async () => {
    const tailoredEmpty = await tailorResume(canonicalResume, '');
    assert.deepStrictEqual(tailoredEmpty, canonicalResume, 'Empty JD should return unmodified canonical resume');

    const analyzedEmpty = analyzeJd('');
    assert(analyzedEmpty.requiredSkills.length === 0, 'Empty JD should produce 0 required skills');
  });

  // Test 5: Resume with Missing Sections
  test('5. Resume with Missing Sections: Resilient fallback handling', () => {
    const minimalResume = {
      personalInfo: { name: 'SANTHOSH T K' },
      skills: {},
      experience: []
    };

    const analyzed = analyzeJd('Node.js developer needed');
    const matched = matchResumeToJd(minimalResume, analyzed);
    assert(Array.isArray(matched.matchedSkills), 'matchedSkills should be array');

    const validation = validateAndSanitizeResume(minimalResume, canonicalResume);
    assert(validation.sanitizedResume.education.length > 0, 'Education should be restored from canonical');
  });

  // Test 6: Immutable Field Modification Guard
  test('6. Immutable Field Modification: Tampered candidate data is caught and reset to canonical', () => {
    const tampered = JSON.parse(JSON.stringify(canonicalResume));
    tampered.personalInfo.name = 'Fake Candidate';
    tampered.personalInfo.email = 'hacker@scam.com';
    tampered.personalInfo.phone = '+1 999 999 9999';
    tampered.personalInfo.title = 'Chief Astronaut';
    tampered.experience[0].company = 'Google DeepMind, London';
    tampered.experience[0].duration = '2010 – 2026 (16 years)';
    tampered.education[0].institution = 'MIT Harvard University';

    const result = validateAndSanitizeResume(tampered, canonicalResume);
    assert(!result.valid, 'Tampered resume should be flagged invalid');
    assert(result.violations.length >= 5, `Expected multiple violations, got ${result.violations.length}`);

    // Verify sanitized outputs
    assert(result.sanitizedResume.personalInfo.name === 'SANTHOSH T K', 'Name must be reset');
    assert(result.sanitizedResume.personalInfo.email === 'tksanthosh494@gmail.com', 'Email must be reset');
    assert(result.sanitizedResume.personalInfo.phone === '+91 8825802707', 'Phone must be reset');
    assert(result.sanitizedResume.experience[0].company === 'IQVIA, Bangalore', 'Company must be reset');
    assert(result.sanitizedResume.experience[0].duration === 'June 2026 – Present', 'Duration must be reset');
    assert(result.sanitizedResume.education[0].institution === 'Velammal College of Engineering & Technology, Madurai', 'Education must be reset');
  });

  // Test 7: Hallucinated Skill Detection & Metric Inflation Guard
  test('7. Anti-Hallucination & Metric Inflation: Fabricated skills purged and exaggerated metrics reset', () => {
    const injected = JSON.parse(JSON.stringify(canonicalResume));
    injected.skills.Backend.push('Kubernetes', 'Haskell', 'Apache Kafka', 'Cobol');
    injected.experience[0].highlights[0] = 'Improved application speed by 900% and reduced server costs by 95%';

    const result = validateAndSanitizeResume(injected, canonicalResume);
    assert(!result.valid, 'Injected skills should cause validation violation');

    const backendClean = result.sanitizedResume.skills.Backend;
    assert(!backendClean.includes('Kubernetes'), 'Kubernetes must be purged');
    assert(!backendClean.includes('Haskell'), 'Haskell must be purged');
    assert(!backendClean.includes('Apache Kafka'), 'Apache Kafka must be purged');
    assert(!backendClean.includes('Cobol'), 'Cobol must be purged');

    // Check metric reset
    assert(result.sanitizedResume.experience[0].highlights[0].includes('Developed a dynamic engagement-creation stepper'),
      'Exaggerated metric highlight should be reset to canonical fact');
  });

  // Test 8: PDF 1-Page Layout Constraint & Zero Microscopic White Text
  await testAsync('8. PDF 1-Page Layout & Zero Microscopic White Text: Output strictly 1 page with no white layer', async () => {
    const testPdfPath = path.join(__dirname, '../server/test_resume_validation_output.pdf');
    if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);

    await generateResumePdf(canonicalResume, testPdfPath);
    assert(fs.existsSync(testPdfPath), 'PDF output file should exist');

    const pdfValidation = validatePdfOutput(testPdfPath, canonicalResume);
    assert(pdfValidation.valid === true, 'PDF validation should pass');
    assert(pdfValidation.pageCount === 1, `Page count should be strictly 1, got ${pdfValidation.pageCount}`);
    assert(pdfValidation.hasWhiteText === false, 'PDF must NOT have white text layer');

    // Clean up test file
    try { fs.unlinkSync(testPdfPath); } catch (_) {}
  });

  console.log('\n================================================================================');
  console.log(`  RESUME OPTIMIZER VALIDATION SUMMARY:`);
  console.log(`  TOTAL:  ${passCount + failCount}`);
  console.log(`  PASSED: ${passCount}`);
  console.log(`  FAILED: ${failCount}`);
  console.log('================================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
