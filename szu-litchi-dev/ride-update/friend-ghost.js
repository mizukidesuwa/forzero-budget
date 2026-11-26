const GHOST_FORMAT = 'litchi-ghost';
const GHOST_VERSION = 1;
const MAX_GHOST_BYTES = 2200000;
const MAX_REPLAY_SAMPLES = 8200;

function validReplay(record, gateCount) {
  return record && Number.isFinite(record.time) && record.time > 0 && Number.isSafeInteger(Math.ceil(record.time)) &&
    gateCount >= 2 && Array.isArray(record.splits) && record.splits.length === gateCount &&
    record.splits.every((time,i)=>Number.isFinite(time)&&time>=0&&time<=record.time&&(i===0||time>record.splits[i-1])) &&
    Array.isArray(record.samples) && record.samples.length >= 2 && record.samples.length <= MAX_REPLAY_SAMPLES &&
    record.samples.every((sample,i)=>Array.isArray(sample)&&sample.length===8&&sample.every(Number.isFinite)&&
      sample[0]>=0&&sample[0]<=record.time+1&&(i===0||sample[0]>record.samples[i-1][0]));
}

function ghostCourseKey(event) {
  // Quantize coordinates so browser math rounding does not change the course identity.
  let hash = 2166136261;
  const addNumber = value => { hash = Math.imul(hash^Math.round(value*100),16777619); };
  addNumber(event.length);
  addNumber(event.path.rows.length);
  for (const {p:[x,,z]} of event.path.rows) { addNumber(x); addNumber(z); }
  for (const gate of event.gates) {
    for (const field of [gate.distance,gate.p[0],gate.p[2],gate.f[0],gate.f[2],gate.rise,
      gate.minCross??-gate.half,gate.maxCross??gate.half]) addNumber(field);
  }
  return (hash>>>0).toString(16).padStart(8,'0');
}

function makeGhostFile(event, run, profile) {
  if(run?.unranked) throw new GhostFileError('这场成绩仅用于娱乐或独立结算，无法导出官方影子。');
  const appearance = run.appearance??(run.vehicle==='bike'&&profile.look?bicycleAppearance(profile,run.bike):null);
  return {
    format:GHOST_FORMAT,version:GHOST_VERSION,
    course:{campus:event.campus,id:event.id,seed:event.seed??null,layout:ghostCourseKey(event)},
    rider:{name:riderName(profile.name),vehicle:run.vehicle,paint:knownPaint(appearance?.paint??profile.paint),
      ...(appearance?{look:bicycleStyle(appearance.look),bike:{tyres:appearance.tyres,frame:appearance.frame}}:{})},
    run:{time:run.time,splits:run.splits,samples:run.samples,corners:run.corners}
  };
}

class GhostFileError extends Error {}

function readGhostFile(text) {
  let file;
  try { file = JSON.parse(text); }
  catch { throw new GhostFileError('文件内容无法读取，请选择游戏导出的影子文件。'); }
  if (file?.format !== GHOST_FORMAT) throw new GhostFileError('请选择 FORZERO: BUDGET（或荔园环骑）导出的影子文件。');
  if (file.version !== GHOST_VERSION) throw new GhostFileError('这个影子文件需要兼容的游戏版本。');

  const {course,rider,run} = file;
  if (typeof course?.campus !== 'string' || !Object.hasOwn(campuses,course.campus) || typeof course.id !== 'string' ||
      typeof course.layout !== 'string' || !/^[0-9a-f]{8}$/.test(course.layout)) {
    throw new GhostFileError('影子文件里的地图信息不完整。');
  }
  const {campus,id,seed} = course;
  const knownCourse = seed === null
    ? coursesByCampus[campus].some(event=>event.id===id)
    : typeof seed === 'string' && seed.length<=15 && readSeedCode(seed,campus)===seed && id==='seed-'+seed;
  if (!knownCourse) throw new GhostFileError('找不到影子文件指定的赛道或种子。');
  if (typeof rider?.name !== 'string' || rider.name.length>48 ||
      typeof rider.vehicle !== 'string' || !Object.hasOwn(vehicleChoices,rider.vehicle) || !vehicleChoices[rider.vehicle].race) {
    throw new GhostFileError('影子文件里的骑手或车型信息无效。');
  }
  const bounds = campus==='ucl'?uclBounds:cityExtent;
  if (!validReplay(run,run?.splits?.length) || run.samples[0][0]!==0 ||
      Math.abs(run.samples.at(-1)[0]-run.time)>1 ||
      Math.abs(run.splits.at(-1)-run.time)>1 ||
      !run.samples.every(([,x,y,z,heading,speed,travel,steer])=>
        x>=bounds.minX-10&&x<=bounds.maxX+10&&z>=bounds.minZ-10&&z<=bounds.maxZ+10&&
        Math.abs(y)<=40&&Math.abs(heading)<=Math.PI+.01&&Math.abs(speed)<=50&&
        Math.abs(travel)<=run.time*.05+10&&Math.abs(steer)<=1.01)) {
    throw new GhostFileError('影子文件里的骑行轨迹或计时数据无效。');
  }
  return file;
}

function loadFriendGhost({course,rider,run}) {
  const {campus,id,seed,layout} = course;
  const current = seedCourses[campus];
  const event = seed===null ? coursesByCampus[campus].find(item=>item.id===id) :
    current?.seed===seed ? current : makeSeedCourse(seed,campus);
  if (!event || event.campus!==activeCampus || ghostCourseKey(event)!==layout || run.splits.length!==event.gates.length) {
    throw new GhostFileError('这个影子使用的赛道布局与当前游戏版本不同。');
  }
  const name = riderName(rider.name), vehicle = rider.vehicle;
  const corners = validCornerScores(run.corners,event.corners.length,run.time)
    ? run.corners : referenceCornerScores(event,run,vehicle);
  return {event,opponent:{
    name,vehicle,paint:typeof rider.paint==='string'?knownPaint(rider.paint):'classic',
    ...(vehicle==='bike'&&rider.look?{look:bicycleStyle(rider.look),bike:{
      tyres:Object.hasOwn(tyreChoices,rider.bike?.tyres)?rider.bike.tyres:'stock',
      frame:Object.hasOwn(frameChoices,rider.bike?.frame)?rider.bike.frame:'stock',
    }}:{}),
    kind:name+'的影子',time:run.time,splits:run.splits,samples:run.samples,corners
  }};
}
