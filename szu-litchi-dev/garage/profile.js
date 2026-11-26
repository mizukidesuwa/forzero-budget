const bicyclePaints = {
  classic:{name:'荔园青', color:'#29746d', shade:'#245449', highlight:'#3a887b'},
  shared:{name:'共享单车黄', color:'#e8ad25', shade:'#9e7420', highlight:'#f1cc46'},
  bay:{name:'海湾蓝', color:'#3f79b1', shade:'#2b4b71', highlight:'#6da8da'},
  red:{name:'赤霞红', color:'#b95544', shade:'#77352e', highlight:'#dc7463'},
  white:{name:'云白', color:'#d7d8ce', shade:'#a5ab9e', highlight:'#f2f0e5'}
};

const vehicleChoices = {
  bike:{name:'自行车', race:true},
  ebike:{name:'电动自行车 · 新国标', race:true, roadSpeed:25/3.6, grassSpeed:13/3.6,
    force:.66, roadGrip:9.35, grassGrip:5.38, rolling:1.12, recordLimit:21*60000, recordInterval:185},
  chair:{name:'电动轮椅', race:true, roadSpeed:10/3.6, grassSpeed:5/3.6,
    force:.43, roadGrip:7.55, grassGrip:3.8, rolling:1.3, recordLimit:38*60000, recordInterval:300},
  trail:{name:'越野小摩托', race:false, roadSpeed:48/3.6, grassSpeed:34/3.6,
    force:1.24, roadGrip:12.5, grassGrip:10.35, rolling:1.02}
};

const DRIVER_KEY = 'szu-litchi-driver-1';
const DEFAULT_RIDER_NAME = '狼';
const knownVehicle = id => Object.hasOwn(vehicleChoices,id)?id:'bike';
const knownPaint = id => Object.hasOwn(bicyclePaints,id)?id:'classic';

function riderName(value) {
  if(typeof value!=='string') return DEFAULT_RIDER_NAME;
  const clean=value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu,'').trim();
  return Array.from(clean).slice(0,12).join('')||DEFAULT_RIDER_NAME;
}

function readDriverProfile() {
  let saved;
  try { saved=JSON.parse(localStorage.getItem(DRIVER_KEY)); } catch {}
  return {name:riderName(saved?.name),vehicle:knownVehicle(saved?.vehicle),paint:knownPaint(saved?.paint)};
}

function storeDriverProfile(profile) {
  try { localStorage.setItem(DRIVER_KEY,JSON.stringify(profile)); } catch {}
}

function chairCheerClock(random=Math.random) {
  let movingTime=0, next=42+random()*28, remaining=0, message='';
  return (dt,moving)=>{
    remaining=Math.max(0,remaining-dt);
    if(!moving) return '';
    movingTime+=dt;
    if(movingTime>=next) {
      message=random()<.56?'冲刺♿':'冲otto冲♿';
      remaining=2.25;
      next=movingTime+115+random()*105;
    }
    return remaining>0?message:'';
  };
}
