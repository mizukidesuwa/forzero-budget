const motorBenchmarks=new WeakMap();

function recordingRules(vehicle) {
  return {limit:vehicleChoices[vehicle].recordLimit??MAX_RUN_MS,
    interval:vehicleChoices[vehicle].recordInterval??SAMPLE_MS};
}

function vehicleBenchmark(event,vehicle) {
  if(vehicle==='bike') return {run:event.benchmark,medals:event.medalTimes};
  let cache=motorBenchmarks.get(event);
  if(!cache) {cache=new Map();motorBenchmarks.set(event,cache);}
  if(!cache.has(vehicle)) {
    const run=makeBenchmark(event,vehicle);
    run.corners=referenceCornerScores(event,run,vehicle);
    const medals=Object.fromEntries(['gold','silver','bronze'].map((name,i)=>
      [name,Math.round(run.time*[.985,1.12,1.30][i]/10)*10]));
    cache.set(vehicle,{run,medals});
  }
  return cache.get(vehicle);
}
