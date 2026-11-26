const MAX_ROAD_SPEED=11.85;
const MAX_SPRINT_SPEED=15.35;
const MAX_GRASS_SPEED=6.65;

const tyreChoices = {
  stock:{name:'均衡胎',note:'公路与短草地都容易掌控。',
    road:1,grass:1,grip:1,loose:1,drag:1,grassDrag:1.82,grassSlowdown:4.25},
  race:{name:'竞速胎',note:'长直道更快，急弯和草地更容易滑。',
    road:1.029,grass:.91,grip:.88,loose:.88,drag:.93,grassDrag:2.02,grassSlowdown:4.85},
  traction:{name:'越野胎',note:'急弯、草地和湿地更稳，铺装路极速低 1.5%。',
    road:.985,grass:1.18,grip:1.19,loose:1.24,drag:1.025,grassDrag:1.46,grassSlowdown:2.90,wetMitigate:.55},
  usedSlick:{name:'二手光头胎',note:'干地极速高、滚阻低。湿地抓地和碎石表现很差。',
    road:1.048,grass:.76,grip:.89,loose:.64,drag:.86,grassDrag:2.35,grassSlowdown:5.6,rainGrip:.58},
  glue:{name:'超级胶水胎',note:'全地形极限抓地、草地与积水近乎无损。',
    road:1,grass:2.3,grip:2.8,loose:4.9,drag:.97,grassDrag:.92,grassSlowdown:1.2}
};
const gearChoices = {
  stock:{name:'标准齿比',note:'起步与巡航均衡。',force:1,highForce:1,top:1},
  short:{name:'短链 · 低齿比',note:'低速、坡起和出弯更有力，铺装路极速低 3%。',force:1.29,highForce:1.05,top:.97},
  long:{name:'长齿比',note:'铺装路极速高 8%，低速重新起步更慢。',force:.79,highForce:.98,top:1.08}
};
const brakeChoices = {
  stock:{name:'均衡刹车',note:'制动力和带刹转向均衡。',power:1,turnLoss:.145},
  control:{name:'渐进刹车',note:'带刹入弯和湿地制动更从容，直线停车距离更长。',power:.88,turnLoss:.073,wetBrakeMitigate:.55},
  power:{name:'强力刹车',note:'直线减速更快，重刹时更需要先摆正车身。',power:1.13,turnLoss:.228}
};
const frameChoices = {
  stock:{name:'综合车架',note:'直线、弯道与爬坡均衡。',top:1,sprintTop:1,force:1,grip:1,steer:1,drag:1},
  aero:{name:'气动车架',note:'高速风阻低、冲刺极速高 3.5%，急弯转向与极限抓地略降。',top:1.01,sprintTop:1.035,force:.97,grip:.95,steer:.88,drag:.91},
  agile:{name:'轻量爬坡架',note:'爬坡与低速推力高 7%、转向更敏捷，铺装极速低 2.5%。',top:.975,sprintTop:.98,force:1.07,grip:1.03,steer:1.15,drag:1.04},
  usedFrame:{name:'二手改装轻框',note:'轻量爬坡推力好，侧风下抓地明显降低。',top:.99,sprintTop:1,force:1.17,grip:.96,steer:1.06,drag:1.05},
  gravity:{name:'反重力碳纤架',note:'上坡几乎忽略重力，低速推力大幅提高。',top:1.15,sprintTop:1.21,force:1.36,grip:1,steer:1.06,drag:.84}
};
const sprintChoices = {
  stock:{name:'均衡输出',note:'标准冲刺推力与耐力消耗。',force:1,top:1,drain:1,recover:1},
  burst:{name:'爆发冲刺',note:'冲刺推力高 14%、极速高 3%，耐力消耗快 35% 且恢复更慢。',force:1.14,top:1.03,drain:1.35,recover:.85},
  endurance:{name:'耐力巡航',note:'冲刺耗能降 28%、回复快 22%，瞬间爆发与冲刺极速略低。',force:.90,top:.975,drain:.72,recover:1.22},
  rocket:{name:'火箭助推',note:'踩下冲刺后以超常推力突破巡航极速。',force:2.8,top:1.92,drain:1.3,recover:1.15},
  capacitor:{name:'无限电容',note:'技能储备持续回复，长时间冲刺。',force:1.12,top:1.08,drain:.18,recover:3}
};
const bikeKey='szu-litchi-bike-1';
const tuningKey='szu-litchi-tuning-1';

function buildBike(tyres='stock',gears='stock',brakes='stock',frame='stock',sprint='stock') {
  if(!Object.hasOwn(tyreChoices,tyres)) tyres='stock';
  if(!Object.hasOwn(gearChoices,gears)) gears='stock';
  if(!Object.hasOwn(brakeChoices,brakes)) brakes='stock';
  if(!Object.hasOwn(frameChoices,frame)) frame='stock';
  if(!Object.hasOwn(sprintChoices,sprint)) sprint='stock';
  const t=tyreChoices[tyres],g=gearChoices[gears],b=brakeChoices[brakes],f=frameChoices[frame],s=sprintChoices[sprint];
  return {
    tyres,gears,brakes,frame,sprint,
    roadSpeed:MAX_ROAD_SPEED*t.road*g.top*f.top,
    sprintSpeed:MAX_SPRINT_SPEED*t.road*g.top*f.sprintTop*s.top,
    grassSpeed:MAX_GRASS_SPEED*t.grass,
    force:g.force*f.force,highForce:g.highForce,roadGrip:11.15*t.grip*f.grip,grassGrip:6.62*t.loose,
    cornerPace:Math.sqrt(t.grip*f.grip),rolling:t.drag*f.drag,grassRolling:t.grassDrag,grassSlowdown:t.grassSlowdown,
    brakePower:b.power,brakeTurnLoss:b.turnLoss,
    steerScale:f.steer,sprintForce:s.force,sprintDrain:s.drain,sprintRecover:s.recover,
    wetMitigate:t.wetMitigate??0,wetBrakeMitigate:b.wetBrakeMitigate??0,rainGrip:t.rainGrip??1,
    ...tuningTraits({tyres,frame,sprint})
  };
}
const stockBike=buildBike();
const maxBikeSpeed=buildBike('race','long','stock','aero','burst').sprintSpeed;
const bicycleGravelSpeed=bike=>Math.min(bike.roadSpeed,bike.grassSpeed*1.32);

function savedBike() {
  try {
    const chosen=JSON.parse(localStorage.getItem(bikeKey));
    return buildBike(chosen?.tyres,chosen?.gears,chosen?.brakes,chosen?.frame,chosen?.sprint);
  } catch { return stockBike; }
}

const vehicleTuningChoices = {
  trail: [
    { key:'tyres', label:'轮胎', options:{
      stock:{name:'全地形均衡胎',note:'铺装与草地均衡发挥。'},
      road:{name:'公路半热熔',note:'铺装抓地 +10%、滚阻更低，碎石和草地更容易滑。',roadGrip:1.10,rolling:.92,grassSpeed:.85,grassGrip:.84,gravelGrip:.87},
      mud:{name:'泥地钉胎',note:'碎石和湿地抓地更稳，草地极速 +10%，铺装极速低 3.5%。',grassSpeed:1.10,grassGrip:1.12,gravelGrip:1.08,wetMitigate:.50,roadSpeed:.965,rolling:1.10}
    }},
    { key:'gears', label:'传动配比', options:{
      stock:{name:'均衡齿比',note:'低速爬坡与高速巡航均衡。'},
      climb:{name:'攀爬大牙盘',note:'爬坡与出弯推力 +18%，铺装极速低 4%。',force:1.18,highForce:.96,roadSpeed:.96},
      speed:{name:'高速小牙盘',note:'高速段加速更足，低速起步与爬坡推力低 15%。',force:.85,highForce:1.14}
    }},
    { key:'suspension', label:'悬挂与制动', options:{
      stock:{name:'标准悬挂',note:'铺装制动与越野缓冲均衡。'},
      stiff:{name:'竞技硬避震',note:'铺装制动 +12%、转向更利落，碎石和草地抓地下降。',brakePower:1.12,steerScale:1.10,grassSlowdown:1.25,grassGrip:.90,gravelGrip:.94},
      soft:{name:'长行程越野避震',note:'入草减速减 30%，碎石、草地和湿地更稳，转向响应降 10%。',grassSlowdown:.70,grassGrip:1.10,gravelGrip:1.06,wetMitigate:.35,steerScale:.90,brakeTurnLoss:.85}
    }}
  ],
  ebike: [
    { key:'tyres', label:'轮胎', options:{
      stock:{name:'通勤标准胎',note:'城市铺装与湿地均衡。'},
      slick:{name:'低阻公路胎',note:'铺装滚阻降 15%，碎石抓地和草地极速下降。',rolling:.85,brakeTurnLoss:.88,grassSpeed:.86,grassGrip:.88,gravelGrip:.90},
      grip:{name:'宽齿防滑胎',note:'提升碎石、草地和湿地抓地，铺装滚阻增 12%。',grassSpeed:1.08,grassGrip:1.16,roadGrip:1.06,gravelGrip:1.10,wetMitigate:.50,rolling:1.12}
    }},
    { key:'motor', label:'电控输出', options:{
      stock:{name:'原厂配件',note:'铺装限速 25 km/h，碎石和草地输出低于标准电控。',roadSpeed:25/48,grassSpeed:.72},
      standard:{name:'标准输出',note:'48 km/h 极速上限，加速与控弯均衡。'},
      torque:{name:'强扭爬坡',note:'起步与爬坡推力 +24%，弯道更易接近抓地极限。',force:1.24,roadGrip:.94,brakeTurnLoss:1.14},
      smooth:{name:'平顺控弯',note:'过弯与带刹极稳、转向更顺，起步推力降 14%。',force:.86,roadGrip:1.08,brakeTurnLoss:.65,steerScale:1.08}
    }},
    { key:'brakes', label:'刹车系统', options:{
      stock:{name:'标准鼓刹',note:'制动力与转向余量均衡。'},
      disc:{name:'前碟强刹',note:'直线制动 +18%，重刹时带刹转向损失增大。',brakePower:1.18,brakeTurnLoss:1.25},
      combo:{name:'联动渐进刹',note:'带刹转向损失减 45%、湿地更稳，直线制动略降 10%。',brakePower:.90,brakeTurnLoss:.55,wetBrakeMitigate:.50}
    }}
  ],
  chair: [
    { key:'wheels', label:'驱动轮', options:{
      stock:{name:'实心标准轮',note:'36 km/h 极速上限，转向与通行均衡。'},
      indoor:{name:'室内轻阻轮',note:'转向响应 +16%、铺装滚阻降 12%，碎石抓地和草地极速下降。',steerScale:1.16,rolling:.88,grassSpeed:.82,grassGrip:.84,gravelGrip:.87},
      outdoor:{name:'户外越野轮',note:'碎石和湿地抓地更稳，草地极速 +22%，转向响应降 10%。',grassSpeed:1.22,grassGrip:1.18,gravelGrip:1.12,wetMitigate:.50,steerScale:.90,rolling:1.08}
    }},
    { key:'motor', label:'电机调校', options:{
      stock:{name:'标准输出',note:'平路与爬坡均衡。'},
      climb:{name:'爬坡大扭矩',note:'杜鹃山爬坡推力 +25%，平路极速略低 3%。',force:1.25,roadSpeed:.97},
      cruise:{name:'平路巡航',note:'平路更快贴近 36 km/h，爬坡掉速更明显。',force:.90,highForce:1.18}
    }},
    { key:'caster', label:'前轮阻尼', options:{
      stock:{name:'标准阻尼',note:'急弯灵活度与直线稳定均衡。'},
      agile:{name:'灵巧竞速',note:'急弯转向响应 +20%，极限弯道略易侧滑。',steerScale:1.20,roadGrip:.93},
      steady:{name:'稳态直线',note:'高速与湿地抓地 +12%，急弯转向偏慢。',steerScale:.86,roadGrip:1.12,wetMitigate:.40}
    }}
  ]
};

// Speed, grip and rolling resistance interpolate between the existing surface tunings.
const poweredGravel = {
  trail:{speed:.69,grip:.62,rolling:.24,force:5.00,slowdown:1.65,brake:.91},
  ebike:{speed:.45,grip:.46,rolling:.39,force:4.45,slowdown:2.10,brake:.82},
  chair:{speed:.32,grip:.35,rolling:.50,force:4.05,slowdown:2.45,brake:.76}
};

function tuningTraits(parts) {
  const selected=Object.values(parts);
  return {illegal:selected.some(key=>tuning190.illegalParts.has(key)),
    magicGrip:selected.includes('glue'),magicPower:selected.includes('rocket'),
    magicGravity:selected.includes('gravity'),magicEnergy:selected.includes('capacitor'),sideWind:selected.includes('usedFrame')};
}

const extraPoweredParts={
  usedSlick:{name:'二手光头胎',note:'铺装极速较高，碎石、湿地和草地容易滑。',
    roadSpeed:1.04,rolling:.86,grassSpeed:.78,grassGrip:.64,gravelGrip:.73,rainGrip:.58},
  usedFrame:{name:'二手改装轻框',note:'低速爬坡更有力，侧风下抓地下降。',force:1.16,steerScale:1.05},
  glue:{name:'超级胶水胎',note:'全地形极限抓地，湿地和积水几乎无影响。',roadGrip:2.8,grassGrip:3.4,grassSpeed:1.8,gravelGrip:1.8},
  rocket:{name:'暴力解限控制器',note:'高扭矩与超高极速。',force:1.95,highForce:1.95,roadSpeed:1.72,grassSpeed:1.45},
  gravity:{name:'反重力车架',note:'上坡几乎忽略重力。',force:1.27},
  capacitor:{name:'无限电容',note:'技能储备持续回复，高负载时保持输出。'}
};
for(const [vehicle,slots] of Object.entries(vehicleTuningChoices)) {
  for(const {key,options} of slots) {
    for(const id of Object.keys(tuning190.prices[vehicle][key])) {
      if(extraPoweredParts[id]) options[id]=extraPoweredParts[id];
    }
  }
}

function normalizeVehicleParts(vehicle, parts) {
  const slots = vehicleTuningChoices[vehicle];
  if (!slots) return {};
  const out = {};
  for (const slot of slots) {
    const val = parts?.[slot.key];
    out[slot.key] = Object.hasOwn(slot.options, val) ? val : 'stock';
  }
  return out;
}

function buildVehicleTuning(vehicle, parts) {
  const base = vehicleChoices[vehicle];
  if (!base || vehicle === 'bike') return stockBike;
  const slots = vehicleTuningChoices[vehicle] ?? [];
  const clean = normalizeVehicleParts(vehicle, parts);
  let roadSpeed = base.roadSpeed, grassSpeed = base.grassSpeed, force = base.force, highForce = base.force;
  let roadGrip = base.roadGrip, grassGrip = base.grassGrip, rolling = base.rolling, gravelGripScale = 1;
  let grassRolling = base.grassRolling ?? 2.85, grassSlowdown = base.grassSlowdown ?? 8.85;
  let brakePower = 1, brakeTurnLoss = .145, steerScale = 1, wetMitigate = 0, wetBrakeMitigate = 0, rainGrip=1;
  for (const slot of slots) {
    const m = slot.options[clean[slot.key]];
    if (!m) continue;
    if (m.roadSpeed) roadSpeed *= m.roadSpeed;
    if (m.grassSpeed) grassSpeed *= m.grassSpeed;
    if (m.force) force *= m.force;
    if (m.highForce) highForce *= m.highForce;
    if (m.roadGrip) roadGrip *= m.roadGrip;
    if (m.grassGrip) grassGrip *= m.grassGrip;
    if (m.gravelGrip) gravelGripScale *= m.gravelGrip;
    if (m.rolling) rolling *= m.rolling;
    if (m.grassSlowdown) grassSlowdown *= m.grassSlowdown;
    if (m.brakePower) brakePower *= m.brakePower;
    if (m.brakeTurnLoss) brakeTurnLoss *= m.brakeTurnLoss;
    if (m.steerScale) steerScale *= m.steerScale;
    if (m.wetMitigate) wetMitigate = Math.max(wetMitigate, m.wetMitigate);
    if (m.wetBrakeMitigate) wetBrakeMitigate = Math.max(wetBrakeMitigate, m.wetBrakeMitigate);
    if (m.rainGrip) rainGrip *= m.rainGrip;
  }
  // Never exceed each vehicle's nominal road speed cap.
  const traits=tuningTraits(clean);
  if(!traits.magicPower) roadSpeed = Math.min(base.roadSpeed, roadSpeed);
  const gravel=poweredGravel[vehicle];
  return {
    ...base,
    parts: clean,
    roadSpeed, grassSpeed, force, highForce, roadGrip, grassGrip, rolling,
    grassRolling, grassSlowdown, brakePower, brakeTurnLoss, steerScale, wetMitigate, wetBrakeMitigate,
    gravelSpeed:traits.magicGrip?roadSpeed:mix(Math.min(grassSpeed,roadSpeed),roadSpeed,gravel.speed),
    gravelGrip:Math.min(roadGrip,mix(grassGrip,roadGrip,gravel.grip)*gravelGripScale),
    gravelRolling:mix(rolling,grassRolling,gravel.rolling),
    gravelForce:gravel.force,gravelSlowdown:gravel.slowdown,gravelBrake:gravel.brake,
    rainGrip,...traits,
    cornerPace: Math.sqrt(roadGrip / base.roadGrip),
  };
}

function savedVehicleTunings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(tuningKey)) ?? {}; } catch {}
  return {
    trail: normalizeVehicleParts('trail', saved?.trail),
    ebike: normalizeVehicleParts('ebike', saved?.ebike),
    chair: normalizeVehicleParts('chair', saved?.chair),
  };
}

function storeVehicleTunings(tunings) {
  try { localStorage.setItem(tuningKey, JSON.stringify(tunings)); } catch {}
  if (typeof scheduleLocalSave === 'function') scheduleLocalSave();
}
