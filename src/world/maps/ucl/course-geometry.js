import { joinTrack, makeCourse, section } from '../../geometry.js';
import { londonRoads } from './layout.js';

function londonSection(road,from,to,checkpoint=null) {
  return {...section(londonRoads.get(road),from,to),checkpoint};
}

function makeLondonCourse(id,name,description,parts,start,finish,stageEnds=[]) {
  const starts=[];
  const path=joinTrack(parts,starts);
  const spec=[[0,start]];
  for(const [index,part] of parts.entries()) {
    if(!part.checkpoint) continue;
    const [x,z,label]=part.checkpoint;
    let nearest=null,error=Infinity;
    for(let i=starts[index];i<(starts[index+1]??path.rows.length);i++) {
      const row=path.rows[i], gap=(row.p[0]-x)**2+(row.p[2]-z)**2;
      if(gap<error) {nearest=row;error=gap;}
    }
    spec.push([nearest.distance,label]);
  }
  spec.push([path.length,finish]);
  const event=makeCourse(id,name,description,path,spec,path.length,{
    absolute:true,campus:'ucl',thresholds:[.965,1.11,1.29]
  });
  if(stageEnds.length) {
    let startGate=0;
    event.stages=stageEnds.map(([name,station,color],index)=>{
      const finishGate=event.gates.findIndex(gate=>gate.name===station);
      const stage={index,name,color,startGate,finishGate,
        from:event.gates[startGate].distance,to:event.gates[finishGate].distance};
      event.gates[finishGate].color=color;
      startGate=finishGate;
      return stage;
    });
  }
  return event;
}

export { londonSection, makeLondonCourse };
