const vehicleSkills={
  bike:{action:'冲刺',meter:'冲刺耐力'},
  trail:{action:'甩尾',meter:'牵引储备'},
  ebike:{action:'超频',meter:'电量 / 温控'},
  chair:{action:'爆发',meter:'扭矩储备'}
};

function updateVehicleSkill(rider,input,dt) {
  const held=Boolean(input.sprint), speed=Math.max(0,rider.speed);
  rider.skill='';
  rider.skillForce=rider.skillLimit=rider.skillYaw=1;
  rider.regenDrag=0;
  if(rider.vehicle==='trail') {
    const drifting=held&&Boolean(input.left)!==Boolean(input.right)&&speed>=5&&!input.brake&&rider.energy>.025;
    if(!held&&rider.skillHeld&&rider.driftTime>=.4&&rider.energy>.08) {
      rider.exitBoost=1.2;
      rider.energy-=.08;
    }
    rider.driftTime=drifting?(rider.driftTime??0)+dt:held?(rider.driftTime??0):0;
    rider.exitBoost=Math.max(0,(rider.exitBoost??0)-dt);
    if(drifting) {
      rider.skill='手刹甩尾'; rider.skillYaw=1.34; rider.skillForce=.91;
      rider.energy-=.24*dt;
    } else if(rider.exitBoost>0) {
      rider.skill='出弯牵引'; rider.skillForce=1.24; rider.skillLimit=1.045;
    } else rider.energy+=.07*dt;
  } else if(rider.vehicle==='ebike') {
    rider.overheat=Math.max(0,(rider.overheat??0)-dt);
    if(!held) rider.overclockLocked=false;
    const windingDown=speed>1&&(!input.gas||input.brake);
    if(windingDown) rider.regenDrag=.46;
    if(held&&input.gas&&!input.brake&&!rider.overclockLocked&&rider.overheat===0&&rider.energy>.02) {
      rider.skill='超频'; rider.skillForce=rider.skillLimit=1.18;
      rider.energy-=.42*dt;
      if(rider.energy<=.02) {
        rider.energy=0; rider.overheat=2.5; rider.overclockLocked=true;
      }
    } else {
      rider.energy+=(windingDown?.32:held?.02:.15)*dt;
      if(rider.overheat>0) {
        rider.skill='过热保护'; rider.skillForce=.77; rider.skillLimit=.89;
      } else if(windingDown) rider.skill='动能回收';
    }
  } else {
    rider.skillYaw=mix(1.72,1,clamp((speed-2)/7,0,1));
    if(held&&input.gas&&!input.brake&&rider.energy>.025) {
      rider.skill='双电机爆发';
      rider.skillForce=mix(1.78,1.04,clamp(speed/8,0,1));
      rider.skillLimit=1.025;
      rider.energy-=.34*dt;
    } else rider.energy+=.12*dt;
  }
  rider.skillHeld=held;
  rider.energy=clamp(rider.energy,0,1);
}

function speedFov(rider,prior,dt) {
  const speed=clamp((rider.speed-8)/10,0,1);
  const boost=rider.sprinting||rider.drafting||rider.downwindDescent||(rider.skillForce??1)>1.06;
  const target=clamp(speed*.072+(boost?.049:0),0,7*Math.PI/180);
  return mix(prior?.speedFov??0,target,1-Math.exp(-4.8*dt));
}
