const friendScoreKey = ['campus','courseId','layout','vehicle','name','time'];
let friendArchive;

function openFriendArchive() {
  if (!friendArchive) {
    friendArchive = new Promise((resolve,reject) => {
      const request = indexedDB.open('szu-litchi-friends',1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('scores',{keyPath:'id',autoIncrement:true}).createIndex('result',friendScoreKey);
        db.createObjectStore('replays');
      };
      request.onerror = () => reject(request.error);
      let blocked = false;
      request.onblocked = () => {
        blocked = true;
        reject(new Error('The friend archive is blocked by another tab.'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => {
          db.close();
          friendArchive = undefined;
        };
        resolve(db);
      };
    }).catch(error => {
      friendArchive = undefined;
      throw error;
    });
  }
  return friendArchive;
}

async function friendArchiveTransaction(stores,mode,operate) {
  const db = await openFriendArchive();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(stores,mode);
    let result;
    transaction.oncomplete = () => resolve(result?.result);
    transaction.onabort = () => reject(transaction.error??new Error('The friend archive transaction was aborted.'));
    try { result = operate(transaction); }
    catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

async function saveFriendGhost({event,opponent}) {
  const {name,paint,corners} = opponent;
  const run = {...opponent,corners:corners.map(score=>score&&{speed:score.speed,duration:score.duration})};
  const ghost = makeGhostFile(event,run,{name,paint,look:opponent.look});
  const {campus,id:courseId,seed,layout} = ghost.course;
  const score = {campus,courseId,seed,layout,name:ghost.rider.name,vehicle:ghost.rider.vehicle,time:run.time};
  const replay = JSON.stringify(ghost);
  const result = await friendArchiveTransaction(['scores','replays'],'readwrite',transaction => {
    const scores = transaction.objectStore('scores'), replays = transaction.objectStore('replays');
    const matches = scores.index('result').openKeyCursor(friendScoreKey.map(field=>score[field]));
    matches.onsuccess = () => {
      const match = matches.result;
      if (!match) {
        const write = scores.add(score);
        write.onsuccess = () => replays.add(replay,write.result);
        return;
      }
      const existing = replays.get(match.primaryKey);
      existing.onsuccess = () => { if (existing.result!==replay) match.continue(); };
    };
  });
  if (typeof scheduleLocalSave === 'function') scheduleLocalSave();
  return result;
}

function readFriendScores() {
  return friendArchiveTransaction('scores','readonly',transaction=>transaction.objectStore('scores').getAll());
}

function readSavedFriendGhost(id) {
  return friendArchiveTransaction('replays','readonly',transaction=>transaction.objectStore('replays').get(id));
}

async function removeSavedFriendGhost(id) {
  const result = await friendArchiveTransaction(['scores','replays'],'readwrite',transaction => {
    transaction.objectStore('scores').delete(id);
    transaction.objectStore('replays').delete(id);
  });
  if (typeof scheduleLocalSave === 'function') scheduleLocalSave();
  return result;
}
