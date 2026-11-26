const bicycleStyles = {
  category:{label:'自行车门类',choices:{campus:'校园通勤',road:'气动公路',climb:'轻量爬坡',gravel:'砾石越野'}},
  rim:{label:'轮组',choices:{auto:'随门类',spokes:'经典辐条',deep:'深框碳刀'}},
  sidewall:{label:'胎壁',choices:{black:'经典全黑',tan:'复古黄边'}},
  accessory:{label:'配饰',choices:{none:'无配饰',bottle:'车架水壶',basket:'校园前篮',computer:'码表支架'}},
  trim:{label:'把带与坐垫',choices:{coal:'深炭黑',brown:'复古棕',orange:'亮橙'}}
};

function bicycleStyle(look) {
  return Object.fromEntries(Object.entries(bicycleStyles).map(([key,{choices}])=>{
    const value=look?.[key];
    return [key,typeof value==='string'&&Object.hasOwn(choices,value)?value:Object.keys(choices)[0]];
  }));
}

const bicyclePresets = {
  aero:{name:'深南气动公路',parts:['race','long','stock','aero','burst'],paint:'bay',look:{category:'road',rim:'deep',accessory:'computer'}},
  climb:{name:'杜鹃轻量爬坡',parts:['stock','short','power','agile','burst'],paint:'red',look:{category:'climb',rim:'spokes',accessory:'bottle'}},
  gravel:{name:'全地形越野瓜车',parts:['traction','short','control','stock','endurance'],paint:'white',look:{category:'gravel',rim:'spokes',sidewall:'tan',accessory:'bottle',trim:'brown'}},
  campus:{name:'经典荔园校园',parts:['stock','stock','stock','stock','stock'],paint:'shared',look:{category:'campus',rim:'spokes',sidewall:'tan',accessory:'basket',trim:'brown'}}
};

const bicyclePartKeys=['tyres','gears','brakes','frame','sprint'];
const bicycleAppearance = (profile,bike) => ({paint:knownPaint(profile?.paint),look:bicycleStyle(profile?.look),
  tyres:Object.hasOwn(tyreChoices,bike?.tyres)?bike.tyres:'stock',frame:Object.hasOwn(frameChoices,bike?.frame)?bike.frame:'stock'});

function bicycleAbility(bike) {
  return [bike.roadSpeed/stockBike.roadSpeed, bike.sprintForce*bike.force, bike.roadGrip/stockBike.roadGrip,
    bike.force/bike.rolling, (bike.grassGrip/stockBike.grassGrip+bike.grassSpeed/stockBike.grassSpeed+bike.wetMitigate*.3)/2,
    bike.brakePower];
}

const workshopSpeed=speed=>(speed*3.6).toFixed(1)+' km/h';

const bikePartOptions={tyres:tyreChoices,gears:gearChoices,brakes:brakeChoices,frame:frameChoices,sprint:sprintChoices};
const workshopPartLabels={tyres:'轮胎',gears:'传动',brakes:'刹车',frame:'车架',sprint:'冲刺',
  wheels:'驱动轮',motor:'电机',caster:'前轮阻尼',suspension:'悬挂'};

function workshopPartTitle(vehicle,slot,key,name) {
  const price=tuning190.prices[vehicle][slot][key];
  return `${name} · ¥${price}${tuning190.illegalParts.has(key)?' · 违禁':''}`;
}

function selectedParts(trial,vehicle=trial.rider.vehicle) {
  if(vehicle==='bike') return trial.bike;
  if(trial.rider.vehicle===vehicle&&trial.rider.tuning?.parts) return trial.rider.tuning.parts;
  return typeof vehicleTunings==='undefined'?null:vehicleTunings[vehicle];
}

function soloBudget(trial) {
  const mode=typeof preferences==='undefined'?'open':preferences.soloBudget;
  const limit=tuning190.budgetLimit(mode), vehicle=trial.entryVehicle;
  const build=tuning190.summarize(vehicle,selectedParts(trial,vehicle));
  return {...build,limit,over:limit===null?0:Math.max(0,build.total-limit)};
}

function workshopBudget(trial) {
  const room=typeof onlineRoom==='undefined'?null:onlineRoom?.state;
  if(!room) return soloBudget(trial);
  const vehicle=trial.rider.vehicle;
  const build=tuning190.summarize(vehicle,selectedParts(trial,vehicle));
  const limit=room.tuning?.budget??room.round?.budget??tuning190.budgetLimit(room.budget);
  return {...build,limit,over:limit===null?0:Math.max(0,build.total-limit)};
}

function renderWorkshopBudget() {
  const {total,limit,over,illegal}=workshopBudget(race);
  setText(ui.budgetReadout,`已用 ¥${total} / ${limit===null?'不限预算':`预算 ¥${limit}`}${over?` · 超额 ¥${over}`:''}`);
  ui.budgetReadout.dataset.over=String(over>0);
  ui.budgetHighlight.hidden=over===0;
  ui.budgetNotice.hidden=!illegal;
  setText(ui.budgetNotice,onlineRoom&&onlineRoom.state.budget!=='party'?'此房间禁止违禁魔改件':'违禁魔改 · 娱乐不计榜');
  ui.budgetPicker.disabled=Boolean(onlineRoom)||race.phase==='count'||race.phase==='race';
  ui.budgetPicker.value=tuning190.normalizeBudget(preferences.soloBudget);
  for(const select of ui.bikeSettings.querySelectorAll('[data-over-budget]')) delete select.dataset.overBudget;
}

function highlightBudgetParts() {
  const {items,over}=workshopBudget(race);
  const vehicle=race.rider.vehicle;
  const selects=vehicle==='bike'
    ?[ui.bikeTyres,ui.bikeGears,ui.bikeBrakes,ui.bikeFrame,ui.bikeSprint]:[ui.vehSlot0,ui.vehSlot1,ui.vehSlot2];
  let excess=over;
  items.map((item,index)=>({...item,select:selects[index]})).sort((a,b)=>b.price-a.price).forEach(item=>{
    if(excess<=0) return;
    item.select.dataset.overBudget='true';
    const group=item.select.closest('details');
    if(group) group.open=true;
    excess-=item.price;
  });
  const first=selects.find(select=>select.dataset.overBudget);
  first?.focus();
}

function renderWorkshopAbility(panel,ratios) {
  ratios.forEach((ratio,index)=>{
    const row=panel.children[index];
    const delta=Math.round((ratio-1)*100);
    row.dataset.change=delta>0?'up':delta<0?'down':'even';
    row.querySelector('meter').value=clamp(ratio,0,1.5);
    setText(row.querySelector('output'),delta===0?'持平':`${delta>0?'+':''}${delta}%`);
  });
}

function renderPoweredWorkshop(vehicle,tuned) {
  const stock=buildVehicleTuning(vehicle);
  setText(ui.vehTopSpeed,workshopSpeed(tuned.roadSpeed));
  setText(ui.vehGravel,workshopSpeed(tuned.gravelSpeed));
  setText(ui.vehGrass,workshopSpeed(tuned.grassSpeed));
  renderWorkshopAbility(ui.vehAbility,[
    tuned.roadGrip/stock.roadGrip,tuned.gravelGrip/stock.gravelGrip,tuned.force/stock.force,
    tuned.brakePower/stock.brakePower,tuned.steerScale/stock.steerScale
  ]);
}

function renderWorkshop(bike,locked) {
  const look=bicycleStyle(driverProfile.look);
  for(const select of ui.bikeStyles.querySelectorAll('select')) {
    select.value=look[select.name];
    select.disabled=locked;
  }
  const preset=Object.entries(bicyclePresets).find(([,option])=>option.paint===driverProfile.paint&&
    option.parts.every((value,index)=>value===bike[bicyclePartKeys[index]])&&
    Object.entries(bicycleStyle(option.look)).every(([key,value])=>look[key]===value));
  setText(ui.bikePresetName,preset?.[1].name??'自定义构筑');
  for(const button of ui.bikePresets.querySelectorAll('button')) {
    button.disabled=locked;
    button.setAttribute('aria-pressed',String(button.dataset.preset===preset?.[0]));
  }
  setText(ui.bikeGravel,workshopSpeed(bicycleGravelSpeed(bike)));
  renderWorkshopAbility(ui.bikeAbility,bicycleAbility(bike));
}

function initWorkshopAbility(panel,names) {
  for(const name of names) {
    const row=document.createElement('div');
    const label=document.createElement('span'); label.id=panel.id+'-'+panel.children.length; label.textContent=name;
    const meter=document.createElement('meter'); meter.max=1.5; meter.value=1; meter.setAttribute('aria-labelledby',label.id);
    const delta=document.createElement('output');
    row.append(label,meter,delta); panel.append(row);
  }
}

function initBicycleWorkshop() {
  const selects=[ui.bikeTyres,ui.bikeGears,ui.bikeBrakes,ui.bikeFrame,ui.bikeSprint];
  bicyclePartKeys.forEach((slot,index)=>{
    selects[index].replaceChildren(...Object.entries(bikePartOptions[slot]).map(([key,{name}])=>
      new Option(workshopPartTitle('bike',slot,key,name),key)));
  });
  ui.budgetPicker.addEventListener('change',()=>{
    preferences.soloBudget=tuning190.normalizeBudget(ui.budgetPicker.value);
    savePreferences();
    renderWorkshopBudget();
    updateHud();
  });
  ui.budgetHighlight.addEventListener('click',highlightBudgetParts);
  for(const [id,preset] of Object.entries(bicyclePresets)) {
    const button=document.createElement('button');
    button.type='button'; button.className='action'; button.dataset.preset=id; button.textContent=preset.name;
    button.addEventListener('click',()=>{
      if(race.rider.vehicle!=='bike'||race.phase==='race'||race.phase==='count') return;
      [ui.bikeTyres.value,ui.bikeGears.value,ui.bikeBrakes.value,ui.bikeFrame.value,ui.bikeSprint.value]=preset.parts;
      driverProfile.look=bicycleStyle(preset.look);
      driverProfile.paint=preset.paint;
      storeDriverProfile(driverProfile);
      installBikeParts();
    });
    ui.bikePresets.append(button);
  }
  for(const [name,{label,choices}] of Object.entries(bicycleStyles)) {
    const row=document.createElement('div'); row.className='setting-line';
    const title=document.createElement('label'); title.htmlFor='bikeStyle-'+name; title.textContent=label;
    const select=document.createElement('select'); select.id=title.htmlFor; select.name=name;
    for(const [key,caption] of Object.entries(choices)) select.append(new Option(caption,key));
    select.addEventListener('change',()=>{
      if(race.rider.vehicle!=='bike'||race.phase==='race'||race.phase==='count') return;
      driverProfile.look=bicycleStyle({...driverProfile.look,[name]:select.value});
      storeDriverProfile(driverProfile);
      showBikeSetup();
      if (typeof onlineRoom !== 'undefined' && onlineRoom?.state.phase==='tuning') syncOnlineProfile();
    });
    row.append(title,select); ui.bikeStyles.append(row);
  }
  initWorkshopAbility(ui.bikeAbility,['直道巡航','冲刺爆发','弯道抓地','爬坡出弯','越野湿地','直线制动']);
  initWorkshopAbility(ui.vehAbility,['铺装抓地','碎石抓地','低速推力','直线制动','转向响应']);
}

function updateBicyclePosture(rider,input,grade,dt) {
  const speed=rider.speed, turn=input.left||input.right;
  const braking=input.brake||rider.brake>.2;
  const stand=rider.sprinting&&!braking&&speed<9.5&&(grade>.025||speed<6.2||turn);
  const alreadyLow=rider.posture==='tuck';
  const tuck=rider.paved&&!stand&&!braking&&!turn&&Math.abs(rider.steering)<.25&&
    speed>(alreadyLow?8.1:9.1)&&(grade<-.018&&!input.gas||grade<.022&&(input.gas||rider.sprinting));
  const blend=1-Math.exp(-9*dt);
  rider.posture=stand?'stand':tuck?'tuck':'seated';
  rider.tuck=mix(rider.tuck??0,tuck?1:0,blend);
  rider.stand=mix(rider.stand??0,stand?1:0,blend);
  const ratio=WHEEL_TEETH_RATIO*(rider.bike.gears==='short'?.88:rider.bike.gears==='long'?1.12:1);
  const cadence=input.gas&&!braking?60*Math.max(0,speed)/(TAU*TYRE_RADIUS*ratio):0;
  rider.cadence=mix(rider.cadence??0,cadence,blend);
  rider.pedalPhase=((rider.pedalPhase??0)-rider.cadence*(TAU/60)*dt)%TAU;
}
