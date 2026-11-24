function rideTest(event,sprint,seconds=175) {
  const trial=new TimeTrial(event);
  trial.start();
  const input={gas:false,brake:false,left:false,right:false,sprint:false};
  trial.advance(3.001,input);
  const path=event.path;
  let index=0, maxDeviation=0, passed=0, nearTurn=false, reserve=false;
  const tick=1/110;
  for(let t=0;t<seconds&&trial.phase==='race';t+=tick) {
    const r=trial.rider, p=r.position;
    let closest=Infinity;
    for(let i=Math.max(0,index-7);i<Math.min(path.rows.length,index+76);i++) {
      const q=path.rows[i].p;
      const distance=(p[0]-q[0])**2+(p[2]-q[2])**2;
      if(distance<closest){closest=distance;index=i;}
    }
    const progress=path.rows[index].distance;
    if(t>2) maxDeviation=Math.max(maxDeviation,Math.sqrt(closest));
    const forward=along(path,Math.min(event.length,progress+clamp(1.7+r.speed*.29,1.85,5.8)));
    const target=subtract(forward,p);
    let delta=Math.atan2(target[2],target[0])-r.heading-r.yawRate*.085;
    delta=Math.atan2(Math.sin(delta),Math.cos(delta));
    const courseSpeed=plannedSpeed(event,progress+.65);
    if(sprint) {
      const entering=plannedSpeed(event,progress+8.6);
      nearTurn=entering<10.8||Math.abs(delta)>.22;
      if(r.energy>.42) reserve=true;
      if(r.energy<.067) reserve=false;
      input.sprint=!nearTurn&&reserve;
    }
    let goal=Math.min(input.sprint?MAX_SPRINT_SPEED-.15:sprint?11.52:10.80,courseSpeed*(sprint?1.11:1.04));
    if (Math.abs(delta)>.38) goal=Math.min(goal,7.9);
    if (Math.abs(delta)>.75) goal=Math.min(goal,5.4);
    input.gas=r.speed<goal-.06||input.sprint;
    input.brake=r.speed>goal+(sprint?.46:.32);
    input.right=delta>.025;
    input.left=delta<-.025;
    trial.advance(tick,input);
    passed=trial.nextGate;
  }
  return {id:event.id,sprint,phase:trial.phase,passed,elapsed:Math.round(trial.elapsed),medal:medalName(event,trial.elapsed),
    goals:event.medalTimes,deviation:maxDeviation,position:trial.rider.position,progress:trial.progressEstimate};
}

