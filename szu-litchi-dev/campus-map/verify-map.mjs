import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const canvas={getContext:()=>new Proxy({}, {get:(_,k)=>k==='measureText'?t=>({width:t.length*12}):()=>{}})};
const boot=source=>{
  const code=readFileSync(new URL(source,import.meta.url),'utf8').split('const mapCache = new WeakMap();')[0];
  const env=vm.createContext({console,document:{createElement:()=>canvas}});
  vm.runInContext(code,env);
  return (expression)=>vm.runInContext(expression,env);
};
const before=boot('../street-riding/game.js'), after=boot('./game.js');
const routeData=`JSON.stringify(courses.map(({id,length,gates})=>[id,length,gates.map(g=>[g.distance,g.half])]))`;
assert.equal(after(routeData),before(routeData),'Existing timing geometry changed');

const badRows=`courses.flatMap(event=>event.path.rows.flatMap(({p,distance})=>{
  const [x,,z]=p;
  if(distance>=event.length||surfaceAt(x,z)&&safeToRide(x,z)) return [];
  return [{id:event.id,x,z,distance,paved:surfaceAt(x,z),inside:inCampus(x,z),water:lakeClearance(x,z),
    block:buildingAt(x,z),tree:treeSites.find(t=>Math.abs(t.x-x)<.28&&Math.abs(t.z-z)<.28)}];
}))`;
const result=after(`(() => {
  campusUrbanWorld();
  const sweep = ({name,path}) => {
    let count=0;
    for(let d=.6;d<path.length-.5;d+=.45) {
      for(const offset of [0,-.64*path.width,.64*path.width]) {
        const [x,,z]=offsetVertex(courseFrame(path,d),offset,ROAD_Y);
        if(!safeToRide(x,z,true)||!surfaceAt(x,z,true)) return {name,d,x,z,block:buildingAt(x,z)?.name??null};
        count++;
      }
    }
    return {name,count};
  };
  return {
    southStreets:canghaiStreets.map(sweep),
    entrances:cityLinks.map(sweep),
    lakeShore:basins.every(b=>[.43,1.14,2.77,3.68,5.19].every(a=>{
      const p=bank(b,a), inner=bank(b,a,1.1),outer=bank(b,a,-1.1);
      return Math.abs(lakeClearance(p[0],p[2]))<.001
        && lakeClearance(inner[0],inner[2])<0 && lakeClearance(outer[0],outer[2])>0;
    }))
  };
})()`);
assert.equal(JSON.stringify(after(badRows)),'[]','Every race centerline should remain rideable');
for(const street of [...result.southStreets,...result.entrances]) assert.ok(street.count,JSON.stringify(street));
assert.ok(result.lakeShore);
console.log(JSON.stringify(result,null,2));
