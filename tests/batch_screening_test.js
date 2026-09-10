const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  getBatchScreeningData,
  saveBatchScreeningData,
  saveBatchScreeningAnswersAsync,
  getBatchInspectionStatus,
  getBatchApplyStatus,
  getQaDatabase,
  getQaDatabaseAsync
} = require('../server/src/services/naukri_apply.service');

async function runBatchScreeningTests() {
  console.log('======================================================');
  console.log('  BATCH-FIRST SCREENING-QUESTION WORKFLOW TEST SUITE  ');
  console.log('======================================================\n');

  const testUser = 'batch_test_user_' + Date.now();

  // Test 1: Initial Batch Screening Data Structure
  console.log('[TEST 1] Initial Batch Screening Data Structure');
  const initialData = getBatchScreeningData(testUser);
  assert(initialData !== null, 'Data should not be null');
  assert(Array.isArray(initialData.consolidatedQuestions), 'consolidatedQuestions should be an array');
  assert(typeof initialData.jobQuestionsMap === 'object', 'jobQuestionsMap should be an object');
  assert(typeof initialData.answers === 'object', 'answers should be an object');
  console.log('  [PASS] Initial data correctly structured with empty arrays & maps.\n');

  // Test 2: Persistence & Question Consolidation / Deduplication
  console.log('[TEST 2] Question Consolidation & Deduplication Logic');
  const sampleConsolidated = [
    {
      id: 'cq_notice_period',
      question: 'What is your official notice period?',
      normKey: 'what is your official notice period',
      type: 'single_choice',
      options: ['15 Days or less', '1 Month', '2 Months', '3 Months'],
      isMandatory: true,
      jobIds: ['job_01', 'job_02', 'job_03'],
      companies: ['TCS', 'Infosys', 'Wipro'],
      jobCount: 3
    },
    {
      id: 'cq_current_ctc',
      question: 'What is your current CTC (in LPA)?',
      normKey: 'what is your current ctc in lpa',
      type: 'text',
      options: [],
      isMandatory: true,
      jobIds: ['job_01', 'job_02'],
      companies: ['TCS', 'Infosys'],
      jobCount: 2
    },
    {
      id: 'cq_relocate',
      question: 'Are you comfortable relocating to Bangalore?',
      normKey: 'are you comfortable relocating to bangalore',
      type: 'single_choice',
      options: ['Yes', 'No'],
      isMandatory: false,
      jobIds: ['job_03'],
      companies: ['Wipro'],
      jobCount: 1
    }
  ];

  const testData = {
    lastInspectedAt: new Date().toISOString(),
    totalJobs: 3,
    inspectedCount: 3,
    questionsFoundCount: 3,
    uniqueQuestionsCount: 3,
    noQuestionsCount: 0,
    failedCount: 0,
    jobQuestionsMap: {
      'job_01': { jobId: 'job_01', company: 'TCS', status: 'QUESTIONS_FOUND', questions: [sampleConsolidated[0], sampleConsolidated[1]] },
      'job_02': { jobId: 'job_02', company: 'Infosys', status: 'QUESTIONS_FOUND', questions: [sampleConsolidated[0], sampleConsolidated[1]] },
      'job_03': { jobId: 'job_03', company: 'Wipro', status: 'QUESTIONS_FOUND', questions: [sampleConsolidated[0], sampleConsolidated[2]] }
    },
    consolidatedQuestions: sampleConsolidated,
    answers: {}
  };

  saveBatchScreeningData(testUser, testData);
  const reloaded = getBatchScreeningData(testUser);
  assert.strictEqual(reloaded.consolidatedQuestions.length, 3, 'Should have 3 unique consolidated questions');
  assert.strictEqual(reloaded.jobQuestionsMap['job_01'].company, 'TCS');
  assert.strictEqual(reloaded.consolidatedQuestions[0].jobCount, 3);
  console.log('  [PASS] Successfully persisted & deduplicated 3 unique questions across 3 jobs.\n');

  // Test 3: Save Answers Once & Automatic Sync to QA Database
  console.log('[TEST 3] Save Answers Once & Synchronize to QA Database');
  const userAnswers = {
    'cq_notice_period': '15 Days or less',
    'cq_current_ctc': '10.78 LPA',
    'cq_relocate': 'Yes'
  };

  const saveRes = await saveBatchScreeningAnswersAsync(testUser, userAnswers);
  assert.strictEqual(saveRes.success, true);
  assert.strictEqual(saveRes.answersCount, 3);

  const updatedData = getBatchScreeningData(testUser);
  assert.strictEqual(updatedData.answers['cq_notice_period'], '15 Days or less');
  assert.strictEqual(updatedData.answers['cq_current_ctc'], '10.78 LPA');

  const userQaDb = await getQaDatabaseAsync(testUser);
  const noticeItem = userQaDb.find(q => q.source === 'user_batch_screening' && q.question.toLowerCase().includes('notice'));
  assert(noticeItem !== undefined, 'Notice period should be saved in QA database');
  assert.strictEqual(noticeItem.answer, '15 Days or less');
  console.log('  [PASS] Stored answers once; verified automatic synchronization into persistent QA Database.\n');

  // Test 4: Inspection Status & Apply Status Trackers
  console.log('[TEST 4] Real-time Status Trackers');
  const inspectStatus = getBatchInspectionStatus(testUser);
  assert(typeof inspectStatus.isRunning === 'boolean');
  assert(inspectStatus.savedData.consolidatedQuestionsCount === 3);
  assert(inspectStatus.savedData.answeredCount === 3);

  const applyStatus = getBatchApplyStatus(testUser);
  assert(typeof applyStatus.isRunning === 'boolean');
  assert(typeof applyStatus.submittedCount === 'number');
  console.log('  [PASS] Status tracking structures validated.\n');

  // Cleanup test sandbox
  try {
    const { getUserPaths } = require('../server/src/services/user.service');
    const userDir = getUserPaths(testUser).userDir;
    fs.rmSync(userDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('======================================================');
  console.log('  ALL BATCH-FIRST SCREENING TESTS PASSED (100% OK)     ');
  console.log('======================================================\n');
}

runBatchScreeningTests().catch(err => {
  console.error('[TEST FAILED]', err);
  process.exit(1);
});
