const tuning190=(()=>{
  const prices={
    bike:{
      tyres:{stock:0,race:280,traction:180,usedSlick:60,glue:380},
      gears:{stock:0,short:140,long:220},brakes:{stock:0,control:160,power:210},
      frame:{stock:0,aero:360,agile:280,usedFrame:80,gravity:400},
      sprint:{stock:0,burst:260,endurance:200,rocket:400,capacitor:360}
    },
    trail:{
      tyres:{stock:0,road:220,mud:180,usedSlick:60,glue:380},
      gears:{stock:0,climb:160,speed:220,rocket:400,capacitor:360},
      suspension:{stock:0,stiff:230,soft:210,usedFrame:80,gravity:400}
    },
    ebike:{
      tyres:{stock:0,slick:160,grip:180,usedSlick:60,glue:380},
      motor:{stock:0,standard:120,torque:230,smooth:190,rocket:400,capacitor:360},
      brakes:{stock:0,disc:220,combo:170}
    },
    chair:{
      wheels:{stock:0,indoor:150,outdoor:180,usedSlick:60,glue:380},
      motor:{stock:0,climb:210,cruise:170,rocket:400,capacitor:360},
      caster:{stock:0,agile:160,steady:220,usedFrame:80,gravity:400}
    }
  };
  const illegalParts=new Set(['rocket','glue','gravity','capacitor']);
  const budgetPolicies={400:400,700:700,party:null};
  const blindBudgetTiers=[300,400,500,600,700];
  const normalizeBudget=value=>Object.hasOwn(budgetPolicies,String(value))?String(value):'open';
  const budgetLimit=value=>budgetPolicies[normalizeBudget(value)]??null;
  const sanitize=(vehicle,parts)=>Object.fromEntries(Object.entries(prices[vehicle]??prices.bike).map(([slot,options])=>{
    const key=parts?.[slot];
    return [slot,typeof key==='string'&&Object.hasOwn(options,key)?key:'stock'];
  }));
  function summarize(vehicle,parts) {
    const clean=sanitize(vehicle,parts), catalog=prices[vehicle]??prices.bike;
    const items=Object.entries(clean).map(([slot,key])=>({slot,key,price:catalog[slot][key],illegal:illegalParts.has(key)}));
    return {items,total:items.reduce((sum,item)=>sum+item.price,0),illegal:items.some(item=>item.illegal)};
  }
  function violation(vehicle,parts,policy,limit=budgetLimit(policy)) {
    const build=summarize(vehicle,parts);
    if(build.illegal&&normalizeBudget(policy)!=='party') return '装有违禁魔改件';
    if(limit!==null&&build.total>limit) return `超预算 ¥${build.total-limit}`;
    return '';
  }
  return {protocol:3,prices,illegalParts,blindBudgetTiers,normalizeBudget,budgetLimit,sanitize,summarize,violation};
})();

if(typeof module!=='undefined'&&module.exports) module.exports=tuning190;
