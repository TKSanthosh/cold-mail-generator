const fs = require('fs');
const path = require('path');
const { getUserPaths } = require('./user.service');

function getDailyCapacityFilePath(userKey = 'default_user') {
  const paths = getUserPaths(userKey);
  return path.join(paths.userDir, 'naukri_daily_capacity.json');
}

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// In-memory slot reservation locks for atomic concurrency
const userLocks = new Map();

function acquireMemoryLock(userKey) {
  let lockPromise = userLocks.get(userKey) || Promise.resolve();
  let release;
  const nextLock = new Promise(resolve => {
    release = resolve;
  });
  userLocks.set(userKey, lockPromise.then(() => release));
  return lockPromise.then(() => () => {
    release();
    if (userLocks.get(userKey) === nextLock) {
      userLocks.delete(userKey);
    }
  });
}

function loadDailyCapacityData(userKey = 'default_user') {
  const filePath = getDailyCapacityFilePath(userKey);
  const today = getTodayDateString();

  const defaultData = {
    date: today,
    dailyTarget: 50,
    applicationsAttempted: 0,
    applicationsVerified: 0,
    applicationsUnconfirmed: 0,
    applicationsFailed: 0,
    reservedSlots: 0,
    activeReservations: {},
    naukriReportedLimitReached: false,
    naukriReportedLimitReason: null,
    lastUpdated: new Date().toISOString()
  };

  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.date === today) {
        const now = Date.now();
        const cleanedReservations = {};
        let activeCount = 0;
        if (parsed.activeReservations && typeof parsed.activeReservations === 'object') {
          for (const [id, res] of Object.entries(parsed.activeReservations)) {
            const resTime = new Date(res.reservedAt).getTime();
            if (now - resTime < 10 * 60 * 1000) {
              cleanedReservations[id] = res;
              activeCount++;
            }
          }
        }
        return {
          ...defaultData,
          ...parsed,
          activeReservations: cleanedReservations,
          reservedSlots: activeCount
        };
      }
    }
  } catch (err) {
    console.warn(`[DAILY_CAPACITY] Warning loading capacity data for ${userKey}:`, err.message);
  }

  return defaultData;
}

function saveDailyCapacityData(userKey = 'default_user', data) {
  try {
    const filePath = getDailyCapacityFilePath(userKey);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[DAILY_CAPACITY] Error saving capacity data for ${userKey}:`, err.message);
    return false;
  }
}

function getDailyCapacity(userKey = 'default_user') {
  const data = loadDailyCapacityData(userKey);
  const { getNaukriAppliedJobs, isConfirmedAppliedRecord } = require('./naukri_apply.service');
  
  let verifiedCount = data.applicationsVerified;
  try {
    const allApplied = getNaukriAppliedJobs(userKey);
    const today = getTodayDateString();
    const verifiedToday = allApplied.filter(a =>
      (a.appliedAt || '').startsWith(today) &&
      isConfirmedAppliedRecord(a)
    );
    if (verifiedToday.length > verifiedCount) {
      verifiedCount = verifiedToday.length;
      data.applicationsVerified = verifiedCount;
      saveDailyCapacityData(userKey, data);
    }
  } catch (e) {}

  const dailyTarget = data.dailyTarget || 50;
  const committedAndReserved = verifiedCount + data.reservedSlots;
  const rawRemaining = Math.max(0, dailyTarget - committedAndReserved);
  const remainingCapacity = data.naukriReportedLimitReached ? 0 : rawRemaining;

  return {
    date: data.date,
    dailyTarget,
    applicationsVerified: verifiedCount,
    applicationsAttempted: data.applicationsAttempted,
    applicationsFailed: data.applicationsFailed,
    applicationsUnconfirmed: data.applicationsUnconfirmed,
    reservedSlots: data.reservedSlots,
    remainingCapacity,
    canApply: remainingCapacity > 0 && !data.naukriReportedLimitReached,
    naukriReportedLimitReached: !!data.naukriReportedLimitReached,
    naukriReportedLimitReason: data.naukriReportedLimitReason || null,
    percentComplete: Math.min(100, Math.round((verifiedCount / dailyTarget) * 100)),
    lastUpdated: data.lastUpdated
  };
}

function setNaukriLimitReached(userKey = 'default_user', reason = 'Daily application limit reached on Naukri') {
  const data = loadDailyCapacityData(userKey);
  data.naukriReportedLimitReached = true;
  data.naukriReportedLimitReason = reason;
  saveDailyCapacityData(userKey, data);
  console.log(`[DAILY_CAPACITY] 🛑 Naukri limit reached for user "${userKey}": ${reason}`);
  return getDailyCapacity(userKey);
}

function resetDailyLimitReached(userKey = 'default_user') {
  const data = loadDailyCapacityData(userKey);
  data.naukriReportedLimitReached = false;
  data.naukriReportedLimitReason = null;
  saveDailyCapacityData(userKey, data);
  return getDailyCapacity(userKey);
}

function setDailyTarget(userKey = 'default_user', target = 50) {
  const data = loadDailyCapacityData(userKey);
  const parsedTarget = Math.min(50, Math.max(1, parseInt(target, 10) || 50));
  data.dailyTarget = parsedTarget;
  saveDailyCapacityData(userKey, data);
  return getDailyCapacity(userKey);
}

async function reserveApplicationSlot(userKey = 'default_user') {
  const unlock = await acquireMemoryLock(userKey);
  try {
    const data = loadDailyCapacityData(userKey);
    const capacity = getDailyCapacity(userKey);

    if (!capacity.canApply || capacity.remainingCapacity <= 0) {
      return {
        reserved: false,
        reason: data.naukriReportedLimitReached
          ? `Naukri reported limit reached: ${data.naukriReportedLimitReason}`
          : `Daily target of ${data.dailyTarget} applications reached for today.`,
        capacity
      };
    }

    const slotId = `slot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    data.activeReservations = data.activeReservations || {};
    data.activeReservations[slotId] = {
      reservedAt: new Date().toISOString()
    };
    data.reservedSlots = Object.keys(data.activeReservations).length;
    data.applicationsAttempted = (data.applicationsAttempted || 0) + 1;
    saveDailyCapacityData(userKey, data);

    return {
      reserved: true,
      slotId,
      remainingCapacity: Math.max(0, capacity.remainingCapacity - 1),
      capacity: getDailyCapacity(userKey)
    };
  } finally {
    unlock();
  }
}

async function releaseApplicationSlot(userKey = 'default_user', slotId) {
  if (!slotId) return false;
  const unlock = await acquireMemoryLock(userKey);
  try {
    const data = loadDailyCapacityData(userKey);
    if (data.activeReservations && data.activeReservations[slotId]) {
      delete data.activeReservations[slotId];
      data.reservedSlots = Object.keys(data.activeReservations).length;
      saveDailyCapacityData(userKey, data);
      return true;
    }
    return false;
  } finally {
    unlock();
  }
}

async function commitApplicationSlot(userKey = 'default_user', slotId, outcome = 'VERIFIED') {
  const unlock = await acquireMemoryLock(userKey);
  try {
    const data = loadDailyCapacityData(userKey);
    if (slotId && data.activeReservations && data.activeReservations[slotId]) {
      delete data.activeReservations[slotId];
      data.reservedSlots = Object.keys(data.activeReservations).length;
    }

    if (outcome === 'VERIFIED') {
      data.applicationsVerified = (data.applicationsVerified || 0) + 1;
    } else if (outcome === 'FAILED') {
      data.applicationsFailed = (data.applicationsFailed || 0) + 1;
    } else if (outcome === 'UNCONFIRMED') {
      data.applicationsUnconfirmed = (data.applicationsUnconfirmed || 0) + 1;
    }

    saveDailyCapacityData(userKey, data);
    return getDailyCapacity(userKey);
  } finally {
    unlock();
  }
}

module.exports = {
  getDailyCapacityFilePath,
  getDailyCapacity,
  setDailyTarget,
  setNaukriLimitReached,
  resetDailyLimitReached,
  reserveApplicationSlot,
  releaseApplicationSlot,
  commitApplicationSlot
};
