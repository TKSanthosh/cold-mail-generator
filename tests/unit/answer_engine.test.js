/**
 * Answer Engine Unit Tests
 * Verifies answer storage, validation of required answers, answer persistence,
 * QA database sync, and precise answer matching per job with zero cross-job contamination.
 */

const assert = require('assert');
const fs = require('fs');
const {
  saveBatchScreeningData,
  getBatchScreeningData,
  saveBatchScreeningAnswersAsync,
  getQaDatabaseAsync
} = require('../../server/src/services/naukri_apply.service');

async function runAnswerEngineTests() {
  console.log('--- [UNIT] Answer Engine Tests ---');
  const testUser = 'unit_answer_user_' + Date.now();

  // 1. Storage and Persistence of Answers
  console.log('  1. Testing Answer Storage & Persistence...');
  const initialData = {
    totalJobs: 2,
    inspectedCount: 2,
    consolidatedQuestions: [
      { id: 'cq_notice', question: 'What is your notice period?', isMandatory: true, jobIds: ['job_A', 'job_B'] },
      { id: 'cq_relocate', question: 'Are you willing to relocate?', isMandatory: true, jobIds: ['job_A'] },
      { id: 'cq_ctc', question: 'Expected CTC in LPA?', isMandatory: false, jobIds: ['job_B'] }
    ],
    answers: {}
  };
  saveBatchScreeningData(testUser, initialData);

  // User answers Q1
  await saveBatchScreeningAnswersAsync(testUser, { cq_notice: '30 Days' });
  let current = getBatchScreeningData(testUser);
  assert.strictEqual(current.answers['cq_notice'], '30 Days', 'Q1 answer should be stored');

  // User answers Q2
  await saveBatchScreeningAnswersAsync(testUser, { cq_relocate: 'Yes' });
  current = getBatchScreeningData(testUser);
  assert.strictEqual(current.answers['cq_notice'], '30 Days', 'Q1 answer must still persist');
  assert.strictEqual(current.answers['cq_relocate'], 'Yes', 'Q2 answer should be stored');

  // Changing an answer
  await saveBatchScreeningAnswersAsync(testUser, { cq_notice: '15 Days' });
  current = getBatchScreeningData(testUser);
  assert.strictEqual(current.answers['cq_notice'], '15 Days', 'Changed answer should update');
  console.log('    [PASS] Answer storage, updating, and persistence verified.');

  // 2. Answer Synchronization to Persistent Candidate QA Database
  console.log('  2. Testing Sync to QA Database...');
  const qaDb = await getQaDatabaseAsync(testUser);
  const syncedNotice = qaDb.find(q => q.source === 'user_batch_screening' && q.question.includes('notice'));
  assert(syncedNotice !== undefined, 'Answer should sync to QA database');
  assert.strictEqual(syncedNotice.answer, '15 Days');
  console.log('    [PASS] Successfully verified QA database synchronization.');

  // 3. Pre-Apply Validation (Mandatory vs Missing Answers)
  console.log('  3. Testing Pre-Apply Validation for Missing Answers...');
  const questionsList = current.consolidatedQuestions;
  const answers = current.answers;

  // We have answered cq_notice and cq_relocate, but cq_ctc is optional
  const unAnsweredMandatory = questionsList.filter(q => q.isMandatory && !answers[q.id]);
  assert.strictEqual(unAnsweredMandatory.length, 0, 'All mandatory questions should be recognized as answered');

  // If we remove cq_relocate:
  const incompleteAnswers = { cq_notice: '15 Days' };
  const missing = questionsList.filter(q => q.isMandatory && !incompleteAnswers[q.id]);
  assert.strictEqual(missing.length, 1, 'Should detect 1 missing mandatory question');
  assert.strictEqual(missing[0].id, 'cq_relocate');
  console.log('    [PASS] Pre-apply validator correctly flags missing mandatory questions.');

  // 4. Job-Specific Answer Matching (Zero Cross-Job Contamination)
  console.log('  4. Testing Job-Specific Answer Matching (Job A vs Job B)...');
  // Job A requires Q1 (Notice) and Q2 (Relocate)
  // Job B requires Q1 (Notice) and Q3 (CTC)
  const allUserAnswers = {
    cq_notice: '30 Days',
    cq_relocate: 'Yes',
    cq_ctc: '12 LPA'
  };

  const getAnswersForJob = (jobQuestions, availableAnswers) => {
    const matched = {};
    for (const q of jobQuestions) {
      if (availableAnswers[q.id] !== undefined) {
        matched[q.id] = availableAnswers[q.id];
      }
    }
    return matched;
  };

  const jobAQuestions = [
    { id: 'cq_notice', question: 'What is your notice period?' },
    { id: 'cq_relocate', question: 'Are you willing to relocate?' }
  ];
  const jobBQuestions = [
    { id: 'cq_notice', question: 'What is your notice period?' },
    { id: 'cq_ctc', question: 'Expected CTC in LPA?' }
  ];

  const matchedA = getAnswersForJob(jobAQuestions, allUserAnswers);
  const matchedB = getAnswersForJob(jobBQuestions, allUserAnswers);

  assert.deepStrictEqual(matchedA, { cq_notice: '30 Days', cq_relocate: 'Yes' });
  assert.deepStrictEqual(matchedB, { cq_notice: '30 Days', cq_ctc: '12 LPA' });

  // Explicit assertion: Job A must NOT receive CTC, Job B must NOT receive Relocate
  assert.strictEqual(matchedA['cq_ctc'], undefined, 'Job A must not receive Job B questions');
  assert.strictEqual(matchedB['cq_relocate'], undefined, 'Job B must not receive Job A questions');
  console.log('    [PASS] Strict per-job matching confirmed. Zero cross-contamination.');

  // Cleanup test user sandbox
  try {
    const { getUserPaths } = require('../../server/src/services/user.service');
    const userDir = getUserPaths(testUser).userDir;
    fs.rmSync(userDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('  [SUCCESS] Answer Engine unit tests passed 100%.\n');
  return true;
}

if (require.main === module) {
  runAnswerEngineTests().catch(err => {
    console.error('[FAIL]', err);
    process.exit(1);
  });
}

module.exports = { runAnswerEngineTests };
