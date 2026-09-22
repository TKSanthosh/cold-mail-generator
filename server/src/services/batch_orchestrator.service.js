/**
 * BATCH ORCHESTRATOR SERVICE
 * Dedicated production-grade coordinator for the 7-stage backend-first Naukri batch workflow:
 *
 * DISCOVER -> INSPECT (NO SUBMIT) -> EXTRACT REAL DOM QUESTIONS -> CONSOLIDATE & STORE
 *   -> WAIT FOR ANSWERS -> RESUME -> APPLY WITH MATCHED ANSWERS -> VERIFY DOM -> RECONCILE -> DB
 *
 * Guarantees 100% backend autonomy with zero frontend dependency.
 */

const fs = require('fs');
const path = require('path');
const {
  getBatchScreeningData,
  saveBatchScreeningData,
  getBatchScreeningDataAsync,
  inspectBatchJobQuestionsAsync,
  applyBatchWithAnswersAsync,
  reconcileNaukriAppliedJobs,
  getNaukriQueue,
  saveNaukriQueueAsync,
  getNaukriAppliedJobs,
  getTodayAppliedStats,
  getFilterConfig,
  discoverNaukriJobsWithPuppeteer,
  buildDiverseApplicationQueue,
  getPastAppliedCompanySets,
  isConfirmedAppliedRecord
} = require('./naukri_apply.service');

const {
  acquireUserLockAsync,
  releaseUserLockAsync,
  isUserLockedAsync,
  getNaukriConfigAsync,
  saveNaukriConfigAsync,
  restoreAndInjectNaukriSession,
  validateNaukriSessionOnPage,
  findBrowserExecutable,
  ensureBrowserInstalled
} = require('./naukri.service');

const {
  withSingleBrowserLock,
  getOptimizedLaunchOptions,
  setupPageOptimizations,
  safeCloseBrowser
} = require('./browser.helper');

const {
  isSupabaseConfigured,
  supabaseSaveBatchScreeningData,
  supabaseGetBatchScreeningData
} = require('./supabase.service');

let notificationService = null;
try {
  notificationService = require('./notification.service');
} catch (e) {}

// Explicit 7-Stage State Machine
const BatchStage = {
  IDLE: 'IDLE',
  DISCOVERING: 'DISCOVERING',
  INSPECTING: 'INSPECTING',
  WAITING_FOR_ANSWERS: 'WAITING_FOR_ANSWERS',
  READY_TO_APPLY: 'READY_TO_APPLY',
  APPLYING: 'APPLYING',
  RECONCILING: 'RECONCILING',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
  FAILED: 'FAILED'
};

// Valid Stage Transition Map (Enforces Zero Illegal Transitions)
const VALID_STAGE_TRANSITIONS = {
  [BatchStage.IDLE]: [BatchStage.DISCOVERING, BatchStage.INSPECTING, BatchStage.WAITING_FOR_ANSWERS, BatchStage.READY_TO_APPLY, BatchStage.FAILED],
  [BatchStage.DISCOVERING]: [BatchStage.INSPECTING, BatchStage.READY_TO_APPLY, BatchStage.APPLYING, BatchStage.FAILED, BatchStage.IDLE],
  [BatchStage.INSPECTING]: [BatchStage.WAITING_FOR_ANSWERS, BatchStage.READY_TO_APPLY, BatchStage.FAILED, BatchStage.IDLE],
  [BatchStage.WAITING_FOR_ANSWERS]: [BatchStage.READY_TO_APPLY, BatchStage.APPLYING, BatchStage.PAUSED, BatchStage.IDLE],
  [BatchStage.READY_TO_APPLY]: [BatchStage.APPLYING, BatchStage.RECONCILING, BatchStage.WAITING_FOR_ANSWERS, BatchStage.PAUSED, BatchStage.IDLE],
  [BatchStage.APPLYING]: [BatchStage.RECONCILING, BatchStage.WAITING_FOR_ANSWERS, BatchStage.FAILED, BatchStage.COMPLETED],
  [BatchStage.RECONCILING]: [BatchStage.COMPLETED, BatchStage.READY_TO_APPLY, BatchStage.WAITING_FOR_ANSWERS, BatchStage.FAILED, BatchStage.IDLE],
  [BatchStage.COMPLETED]: [BatchStage.IDLE, BatchStage.DISCOVERING, BatchStage.READY_TO_APPLY, BatchStage.INSPECTING, BatchStage.WAITING_FOR_ANSWERS],
  [BatchStage.PAUSED]: [BatchStage.WAITING_FOR_ANSWERS, BatchStage.READY_TO_APPLY, BatchStage.IDLE],
  [BatchStage.FAILED]: [BatchStage.IDLE, BatchStage.DISCOVERING, BatchStage.READY_TO_APPLY]
};

function transitionBatchStage(data, nextStage) {
  const current = data.batchStage || BatchStage.IDLE;
  if (current === nextStage) return;
  const allowed = VALID_STAGE_TRANSITIONS[current] || [];
  if (!allowed.includes(nextStage)) {
    throw new Error(`[STATE MACHINE VIOLATION] Invalid state transition: ${current} -> ${nextStage}`);
  }
  data.batchStage = nextStage;
}

// Explicit Execution Modes for Physical Safety Barriers
const ExecutionMode = {
  INSPECTION_ONLY: 'INSPECTION_ONLY', // Submission buttons strictly intercepted and disabled
  APPLICATION: 'APPLICATION'         // Submissions allowed and verified
};

// In-memory active cycle locks per user
const activeOrchestratorCycles = new Map();

/**
 * Gets the current batch stage and metadata for a candidate
 */
async function getOrchestratorStatus(userKey = 'default_user') {
  const data = await getBatchScreeningDataAsync(userKey);
  const answers = data.answers || {};
  const questions = data.consolidatedQuestions || [];
  
  const unAnsweredMandatory = questions.filter(q => {
    if (!q.isMandatory) return false;
    return answers[q.id] === undefined &&
           answers[q.normKey] === undefined &&
           answers[q.question] === undefined;
  });

  return {
    stage: data.batchStage || BatchStage.IDLE,
    totalJobs: data.totalJobs || 0,
    inspectedCount: data.inspectedCount || 0,
    uniqueQuestionsCount: questions.length,
    unAnsweredMandatoryCount: unAnsweredMandatory.length,
    unAnsweredMandatory,
    answersCount: Object.keys(answers).length,
    lastInspectedAt: data.lastInspectedAt || null,
    lastAppliedAt: data.lastAppliedAt || null,
    error: data.lastError || null
  };
}

/**
 * Main autonomous cycle entry point invoked by background scheduler
 */
async function runBatchCycle(userKey = 'default_user', options = {}) {
  if (activeOrchestratorCycles.get(userKey)) {
    return { skipped: true, reason: 'Batch cycle is already executing for this user' };
  }

  const lockAcquired = await acquireUserLockAsync(userKey, 'batch_orchestrator', 600);
  if (!lockAcquired) {
    return { skipped: true, reason: `User ${userKey} is currently locked by another process` };
  }

  activeOrchestratorCycles.set(userKey, true);

  try {
    const data = await getBatchScreeningDataAsync(userKey);
    const answers = data.answers || {};
    const questions = data.consolidatedQuestions || [];

    // Check if previously paused jobs with NEEDS_ATTENTION can now be resumed
    if (data.jobQuestionsMap) {
      for (const [jId, jItem] of Object.entries(data.jobQuestionsMap)) {
        if (jItem.status === 'NEEDS_ATTENTION') {
          const jobCqs = (data.consolidatedQuestions || []).filter(cq =>
            (cq.jobIds && cq.jobIds.includes(jId)) && cq.isMandatory
          );
          const allAnswered = jobCqs.length > 0 && jobCqs.every(cq =>
            answers[cq.id] !== undefined ||
            answers[cq.normKey] !== undefined ||
            answers[cq.question] !== undefined
          );
          if (allAnswered) {
            console.log(`[BATCH_ORCHESTRATOR] All questions answered for job "${jId}". Restoring from NEEDS_ATTENTION to READY_TO_APPLY.`);
            jItem.status = 'READY_TO_APPLY';
            jItem.lastError = null;
          }
        }
      }
    }

    const unAnsweredMandatory = questions.filter(q => {
      if (!q.isMandatory) return false;
      return answers[q.id] === undefined &&
             answers[q.normKey] === undefined &&
             answers[q.question] === undefined;
    });

    console.log(`[BATCH_ORCHESTRATOR] User "${userKey}" | Stage: ${data.batchStage || BatchStage.IDLE} | Questions: ${questions.length} | Unanswered Mandatory: ${unAnsweredMandatory.length}`);

    // --- CRASH RECOVERY: PRE-RESUME RECONCILIATION ---
    // If the server crashed mid-application, or any in-flight jobs remain unconfirmed,
    // ALWAYS check real Naukri application state first before attempting duplicate submissions.
    const inFlightOrUnconfirmed = (getNaukriAppliedJobs(userKey) || []).filter(a =>
      a.status === 'SUBMITTING' ||
      a.status === 'SUBMISSION_UNCONFIRMED' ||
      a.verificationStatus === 'UNVERIFIED'
    );

    if (data.batchStage === BatchStage.APPLYING || (data.batchStage === BatchStage.READY_TO_APPLY && inFlightOrUnconfirmed.length > 0)) {
      console.log(`[BATCH_ORCHESTRATOR] ⚠️ Detected interrupted apply cycle or ${inFlightOrUnconfirmed.length} unconfirmed in-flight job(s). Running pre-resume reconciliation FIRST...`);
      transitionBatchStage(data, BatchStage.RECONCILING);
      saveBatchScreeningData(userKey, data);

      await withSingleBrowserLock('batch_pre_resume_reconciliation', async () => {
        let browser = null;
        try {
          const browserPath = await ensureBrowserInstalled().catch(() => findBrowserExecutable());
          const launchOptions = getOptimizedLaunchOptions({ headless: 'new', executablePath: browserPath || undefined });
          let puppeteer = require('puppeteer');
          browser = await puppeteer.launch(launchOptions);
          const page = await browser.newPage();
          await setupPageOptimizations(page, { blockMedia: true });
          const restoreResult = await restoreAndInjectNaukriSession(page, userKey);
          if (restoreResult.hasSession) {
            await reconcileNaukriAppliedJobs(page, userKey);
          }
        } catch (recErr) {
          console.warn('[BATCH_ORCHESTRATOR] Pre-resume reconciliation notice:', recErr.message);
        } finally {
          if (browser) await safeCloseBrowser(browser);
        }
      });

      // Update local job status for confirmed reconciled jobs
      const reconciledApplied = getNaukriAppliedJobs(userKey);
      for (const app of reconciledApplied) {
        if (isConfirmedAppliedRecord(app) && app.jobId && data.jobQuestionsMap && data.jobQuestionsMap[app.jobId]) {
          data.jobQuestionsMap[app.jobId].status = 'ALREADY_APPLIED';
          data.jobQuestionsMap[app.jobId].verificationStatus = 'VERIFIED';
        }
      }
      transitionBatchStage(data, BatchStage.READY_TO_APPLY);
      saveBatchScreeningData(userKey, data);
    }

    // --- DECISION TREE ---

    const targetJobs = Object.values(data.jobQuestionsMap || {}).filter(j =>
      j.status === 'QUESTIONS_FOUND' || j.status === 'READY_TO_APPLY'
    );

    // BRANCH 1: Target jobs exist and all mandatory answers are satisfied (or zero questions needed) -> AUTOMATICALLY APPLY
    if (targetJobs.length > 0 && unAnsweredMandatory.length === 0) {

      if (targetJobs.length > 0) {
        console.log(`[BATCH_ORCHESTRATOR] 🚀 All answers satisfied! Automatically triggering Batch Apply across ${targetJobs.length} job(s)...`);
        transitionBatchStage(data, BatchStage.READY_TO_APPLY);
        transitionBatchStage(data, BatchStage.APPLYING);
        saveBatchScreeningData(userKey, data);

        const applyResult = await applyBatchWithAnswersAsync(userKey, {
          executionMode: ExecutionMode.APPLICATION,
          waitForCompletion: true
        });

        // Run post-apply reconciliation
        transitionBatchStage(data, BatchStage.RECONCILING);
        saveBatchScreeningData(userKey, data);

        await withSingleBrowserLock('batch_reconciliation', async () => {
          let browser = null;
          try {
            const browserPath = await ensureBrowserInstalled().catch(() => findBrowserExecutable());
            const launchOptions = getOptimizedLaunchOptions({ headless: 'new', executablePath: browserPath || undefined });
            let puppeteer = require('puppeteer');
            browser = await puppeteer.launch(launchOptions);
            const page = await browser.newPage();
            await setupPageOptimizations(page, { blockMedia: true });
            const restoreResult = await restoreAndInjectNaukriSession(page, userKey);
            if (restoreResult.hasSession) {
              await reconcileNaukriAppliedJobs(page, userKey);
            }
          } catch (recErr) {
            console.warn('[BATCH_ORCHESTRATOR] Post-apply reconciliation notice:', recErr.message);
          } finally {
            if (browser) await safeCloseBrowser(browser);
          }
        });

        transitionBatchStage(data, BatchStage.COMPLETED);
        data.lastAppliedAt = new Date().toISOString();
        saveBatchScreeningData(userKey, data);
        return { success: true, stage: BatchStage.COMPLETED, applyResult };
      }
    }

    // BRANCH 2: Questions discovered, but candidate has NOT answered mandatory questions yet
    if (questions.length > 0 && unAnsweredMandatory.length > 0) {
      transitionBatchStage(data, BatchStage.WAITING_FOR_ANSWERS);
      saveBatchScreeningData(userKey, data);
      console.log(`[BATCH_ORCHESTRATOR] ⏸️ PAUSED: Waiting for candidate to answer ${unAnsweredMandatory.length} mandatory question(s). Zero premature applications.`);
      
      // Dispatch alert to candidate device (throttled)
      if (notificationService && typeof notificationService.broadcastMandatoryQuestionNotification === 'function') {
        const topQ = unAnsweredMandatory[0];
        await notificationService.broadcastMandatoryQuestionNotification(userKey, {
          question: topQ.question,
          options: topQ.options,
          inputType: topQ.type,
          title: `Naukri Batch: ${unAnsweredMandatory.length} Questions Ready to Answer`,
          message: `Your batch has collected ${questions.length} questions. Answer them to unleash applications.`
        }).catch(() => {});
      }
      return { paused: true, stage: BatchStage.WAITING_FOR_ANSWERS, unAnsweredMandatoryCount: unAnsweredMandatory.length };
    }

    // BRANCH 3: No questions inspected yet -> DISCOVER & INSPECT
    const queue = getNaukriQueue(userKey);
    let queuePending = queue.filter(q => q.state !== 'SUBMITTED' && q.state !== 'SKIPPED');

    if (queuePending.length === 0) {
      console.log(`[BATCH_ORCHESTRATOR] Queue is empty. Discovering fresh matching 200+ employee jobs on Naukri...`);
      transitionBatchStage(data, BatchStage.DISCOVERING);
      saveBatchScreeningData(userKey, data);

      await withSingleBrowserLock('batch_discovery', async () => {
        let browser = null;
        try {
          const browserPath = await ensureBrowserInstalled().catch(() => findBrowserExecutable());
          const launchOptions = getOptimizedLaunchOptions({ headless: 'new', executablePath: browserPath || undefined });
          let puppeteer = require('puppeteer');
          browser = await puppeteer.launch(launchOptions);
          const page = await browser.newPage();
          await setupPageOptimizations(page, { blockMedia: true });

          const restoreResult = await restoreAndInjectNaukriSession(page, userKey);
          if (!restoreResult.hasSession) {
            throw new Error('Naukri session missing or expired');
          }

          const filterConfig = getFilterConfig(userKey);
          const rawDiscovered = await discoverNaukriJobsWithPuppeteer(page, userKey, filterConfig);

          // Job-level deduplication: filter out already applied job IDs and URLs
          const pastAppliedList = await getNaukriAppliedJobs(userKey);
          const pastAppliedSet = new Set();
          for (const j of pastAppliedList) {
            if (!isConfirmedAppliedRecord(j)) continue;
            if (j.jobId) pastAppliedSet.add(j.jobId);
            if (j.jobUrl) pastAppliedSet.add(j.jobUrl.split('?')[0].toLowerCase().trim());
          }
          const pastAppliedCompanies = getPastAppliedCompanySets(pastAppliedList);
          const diverseQueue = buildDiverseApplicationQueue(rawDiscovered, filterConfig, pastAppliedSet, pastAppliedCompanies);

          await saveNaukriQueueAsync(userKey, diverseQueue);
          queuePending = diverseQueue;
          console.log(`[BATCH_ORCHESTRATOR] Successfully discovered and queued ${diverseQueue.length} jobs.`);
        } catch (discErr) {
          console.warn('[BATCH_ORCHESTRATOR] Discovery warning:', discErr.message);
        } finally {
          if (browser) await safeCloseBrowser(browser);
        }
      });
    }

    if (queuePending.length > 0) {
      console.log(`[BATCH_ORCHESTRATOR] 🔍 Starting autonomous Batch Inspection for ${queuePending.length} job(s) in INSPECTION_ONLY mode...`);
      transitionBatchStage(data, BatchStage.INSPECTING);
      saveBatchScreeningData(userKey, data);

      const inspectResult = await inspectBatchJobQuestionsAsync(userKey, {
        executionMode: ExecutionMode.INSPECTION_ONLY,
        waitForCompletion: true
      });

      const freshData = getBatchScreeningData(userKey);
      const remainingUnanswered = (freshData.consolidatedQuestions || []).filter(q => {
        if (!q.isMandatory) return false;
        const ans = (freshData.answers || {})[q.normKey];
        return ans === undefined || ans === null || String(ans).trim() === '';
      });

      if (freshData.consolidatedQuestions.length > 0 && remainingUnanswered.length > 0) {
        transitionBatchStage(freshData, BatchStage.WAITING_FOR_ANSWERS);
        saveBatchScreeningData(userKey, freshData);
        return {
          success: true,
          stage: BatchStage.WAITING_FOR_ANSWERS,
          inspectResult,
          unAnsweredMandatoryCount: remainingUnanswered.length
        };
      } else {
        transitionBatchStage(freshData, BatchStage.READY_TO_APPLY);
        saveBatchScreeningData(userKey, freshData);
        return { success: true, stage: BatchStage.READY_TO_APPLY, inspectResult };
      }
    }

    return { success: true, stage: BatchStage.IDLE, message: 'No candidate jobs available for batch processing.' };
  } catch (err) {
    console.error('[BATCH_ORCHESTRATOR ERROR]', err);
    return { success: false, error: err.message };
  } finally {
    activeOrchestratorCycles.delete(userKey);
    await releaseUserLockAsync(userKey, 'batch_orchestrator');
  }
}

module.exports = {
  BatchStage,
  ExecutionMode,
  VALID_STAGE_TRANSITIONS,
  transitionBatchStage,
  getOrchestratorStatus,
  runBatchCycle
};
