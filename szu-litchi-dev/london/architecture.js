function portlandBlock(lot,floors,spacing=2.9,base=0,tower=false) {
  const stone='#d0c7b4', cornice='#e0d7c3', plinth='#8f887c', frame='#a49c8c';
  const {w,depth,height}=lot, pitch=(height-1)/floors;
  lotBox(lot,0,base+height/2,0,w,height,depth,stone);
  if(!base) lotBox(lot,0,.38,0,w+.18,.76,depth+.18,plinth);
  lotBox(lot,0,base+height-.14,0,w+.28,.30,depth+.28,cornice);
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side), count=Math.max(2,Math.round((face.width-1.3)/spacing));
    const bay=(face.width-1.3)/count;
    for(let level=0;level<floors;level++) {
      const y=base+.68+(level+.54)*pitch;
      for(let column=0;column<count;column++) {
        const u=(column+.5-count/2)*bay+(tower&&column>0&&column<count-1?((column%3)-1)*bay*.15:0);
        face.panel(u,y,bay*.51,pitch*.69,frame,.027);
        face.panel(u,y,bay*.40,pitch*.61,level%4===1?'#657073':'#4d585d',.040);
        face.panel(u,y-pitch*.36,bay*.55,.105,cornice,.071);
        face.panel(u,y,.048,pitch*.62,'#9b988d',.058);
      }
      if(!tower&&level===1) face.panel(0,y+pitch*.40,face.width,.095,cornice,.044);
    }
  }
}

function senateHouseBuilding(lot) {
  const atrium=lot.parts.at(-1);
  for(const part of lot.parts.slice(0,-1)) portlandBlock(part,part.height>16?5:4);
  lotBox(atrium,0,2.85,0,atrium.w,5.7,atrium.depth,'#797f78');
  for(let i=0;i<8;i++) {
    const section=(k,v)=>lotPoint(atrium,(k/8-.5)*atrium.w,5.75+1.65*Math.sin(k*Math.PI/8),v);
    const front=atrium.depth/2;
    masonry.quad(section(i,-front),section(i,front),section(i+1,front),section(i+1,-front),'#829e9e',[0,1,0]);
    masonry.tube(section(i,-front),section(i,front),.075,.075,'#b6bab1',4);
  }
  // Holden's tower rises in setbacks above the cross-axis and the courtyard ranges.
  for(const [w,d,bottom,top,floors] of [[20.5,49,21,27,2],[17.9,41,27,39,5],[16,33,39,45,2],
    [14.4,24,45,49.4,2],[12.8,19,49.4,51.2,1]]) {
    const floor=lotPart(lot,0,0,w,d,top-bottom);
    portlandBlock(floor,floors,2.18,bottom,true);
  }
  for(const side of [-1,1]) {
    lotBox(lot,side*10.6,12.2,0,5.2,24.4,8.1,'#c1b7a5');
    lotBox(lot,side*9,17.5,0,4.4,35,6.3,'#d6ceb9');
    uclFixtures.push(lotPart(lot,side*10.6,0,5.2,8.1,24.4));
    const buttress=facadeOf(lotPart(lot,side*10.6,0,5.2,8.1,24.4),side===1?1:3);
    for(let level=0;level<7;level++) for(let bay=-1;bay<=1;bay++) {
      const y=3.7+level*2.95;
      buttress.panel(bay*1.77,y,1.05,1.98,'#7f7a6c',.06);
      buttress.panel(bay*1.77,y,.81,1.76,'#4e5450',.14);
    }
  }
  for(const quarter of [1,3]) for(const side of [-1,1]) {
    const facade=facadeOf(lot.parts[0],quarter);
    const u=side*8.4;
    facade.panel(u,2.15,5.4,4.3,'#484c45',.045);
    for(const mullion of [-1.65,-.53,.53,1.65]) facade.panel(u+mullion,2.10,.115,3.79,'#928b70',.065);
    masonry.box(facade.point(u,4.49,1.13),[6.55,.33,2.57],'#e3d9c3',facade.yaw);
    plate(shopSign('SENATE HOUSE','#b7ad99','#333b3c'),facade.point(u,4.99,.12),5.7,.64,facade.yaw);
  }
  for(const side of [-1,1]) {
    const z=lot.z+side*17;
    masonry.box([lot.x-53,1.3,z],[1.25,2.6,1.32],'#bcb19c');
    masonry.box([lot.x-53,2.70,z],[1.49,.23,1.52],'#d3c7ad');
    scenery.box([lot.x-53,3.03,z],[.35,.48,.35],'#aea078');
  }
}

function lasdunBlock(lot,{floors,stories,base=0,bays=2.75}) {
  const {w,depth,height}=lot, pitch=(height-base)/floors;
  const concrete='#aaa398', edges='#c4bcaf', window='#475358';
  lotBox(lot,0,height/2,0,w,height,depth,concrete);
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side), count=Math.max(1,Math.floor(face.width/bays));
    const gap=face.width/count;
    for(let floor=0;floor<floors;floor++) {
      const y=base+(floor+.53)*pitch;
      face.panel(0,y,face.width-.28,pitch*.66,window);
      face.panel(0,y-pitch*.43,face.width+.2,pitch*.12,edges,.172);
      for(let i=0;i<=count;i++) {
        const u=(i/count-.5)*face.width;
        face.panel(u,y,.11,pitch*.71,i%4===0?'#aaa69b':'#777c79',.039);
      }
      if(stories) face.panel(0,y+.26,face.width-.38,.052,'#868780',.041);
    }
  }
  lotBox(lot,0,height-.15,0,w+.36,.43,depth+.52,edges);
}

function bedfordSlab(lot,isSpine=false) {
  const {w,depth,height}=lot,base=3.87,step=(height-base)/5;
  const concrete='#a6a39b', slab='#c0bab0', bronze='#73665f', glass='#4e6065';
  lotBox(lot,0,(height+base)/2,0,w,height-base,depth,concrete);
  lotBox(lot,-1.43,base/2,0,w-2.94,base,depth-.10,'#626970');
  lotBox(lot,0,base,0,w+.32,.41,depth+.37,slab);
  lotBox(lot,0,height+.03,0,w+.35,.31,depth+.40,slab);
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side),span=face.width;
    const width=span-.59,bays=Math.max(3,Math.round(width/1.81));
    for(let floor=0;floor<5;floor++) {
      const y=base+step*(floor+.48);
      face.panel(0,y,width,step*.69,bronze,.052);
      face.panel(0,y+.11,width-.095,step*.56,glass,.108);
      for(let bay=0;bay<bays;bay++) {
        const u=(bay/bays-.5)*width;
        const mullion=bay%3===0?slab:'#778082';
        face.panel(u,y+.10,bay%3===0?.134:.072,step*.65,mullion,.152);
      }
      face.panel(0,y-step*.45,span+.10,.126,slab,.20);
    }
  }
  const street=facadeOf(lot,1);
  for(let u=-street.width/2+1.4;u<street.width/2-1;u+=isSpine?5.10:3.72)
    masonry.box(street.point(u,1.90,-.24),[.53,3.80,.66],'#bfb9af',street.yaw);
}

function ioeBuilding(lot) {
  bedfordSlab(ioeSpine,true);
  bedfordSlab(bedfordNorth,true);
  for(const end of ioeEnds) bedfordSlab(end);
  for(const [index,core] of [...ioeCores,bedfordCore].entries()) {
    const concrete='#a19d95', trim='#b7afa3';
    lotBox(core,0,core.height*.5,0,core.w,core.height,core.depth,concrete);
    lotBox(core,-1.46,core.height+.37,0,core.w-3.7,.73,core.depth-1.45,trim);
    const front=facadeOf(core,3), side=facadeOf(core,index===0?2:0);
    front.panel(0,core.height*.51,1.16,core.height-3.6,'#4e5658',.068);
    for(let floor=0;floor<8;floor++) {
      const y=3.3+floor*3.13;
      front.panel(0,y,1.17,.17,trim,.137);
      if(floor<7) side.panel(-side.width*.31,y,.95,1.51,'#656d6e',.041);
    }
    lotBox(core,-core.w*.42,core.height*.49,core.depth*.41,1.55,core.height*.98,1.08,trim);
  }

  // The teaching wing steps down in section toward the pedestrian precinct.
  for(let level=0;level<5;level++) {
    const setBack=level*2.85, width=ioeWestWing.w-setBack;
    const story=lotPart(ioeWestWing,setBack/2,0,width,ioeWestWing.depth-level*.68,3.12);
    const base=level*3.4;
    lotBox(story,0,base+1.56,0,width,3.12,story.depth,'#5e544a');
    for(const side of [0,2,3]) {
      const face=facadeOf(story,side);
      face.panel(0,base+1.76,face.width-.24,1.62,'#435357',.06);
      for(let u=-face.width/2+.85;u<face.width/2;u+=1.85)
        face.panel(u,base+1.72,.12,1.85,'#a49b8b',.14);
    }
    lotBox(story,0,base+3.18,0,width+.40,.40,story.depth+.65,'#c1bbae');
  }
  lasdunBlock(ioeAnnex,{floors:2,base:1.6,bays:2.0});
  const west=facadeOf(ioeWestWing,3);
  for(let level=0;level<4;level++) {
    const x=-ioeWestWing.w/2+level*2.85, y=level*3.4+.5;
    for(const side of [-1,1]) {
      const z=side*ioeWestWing.depth*.47;
      for(let tread=0;tread<10;tread++)
        lotBox(ioeWestWing,x+tread*.285,y+tread*.34,z,1.38,.40,1.52,'#bab5a7');
      masonry.tube(lotPoint(ioeWestWing,x,y+.83,z+side*.64),
        lotPoint(ioeWestWing,x+2.85,y+4.23,z+side*.64),.13,.13,'#aaa597',4);
    }
  }
  for(let i=-1;i<=1;i++) {
    const center=lotPoint(ioeAnnex,-.60,ioeAnnex.height+.04,i*6.14),[x,y,z]=center;
    const ridge=[x,y+.96,z],corners=[[x-1.8,y,z-1.7],[x+1.8,y,z-1.7],
      [x+1.8,y,z+1.7],[x-1.8,y,z+1.7]];
    for(let j=0;j<4;j++) masonry.triangle(corners[j],ridge,corners[(j+1)%4],'#78949a');
  }

  const east=facadeOf(ioeSpine,1);
  const entry=-6.8;
  masonry.box(east.point(entry,3.01,.64),[10.4,.33,2.53],'#c0bab0',east.yaw);
  masonry.box(east.point(entry,1.45,-.79),[8.9,2.90,1.65],'#3e565e',east.yaw);
  for(const u of [-4.26,-2.14,0,2.14,4.26])
    masonry.box(east.point(entry+u,1.47,.056),[.086,2.93,.093],'#b5b6ae',east.yaw);
  plate(shopSign('IOE  ·  20 BEDFORD WAY','#3a454b','#f2eee3'),
    east.point(entry,3.03,2.02),8.87,.62,east.yaw);
  pavement.box(east.point(entry,.023,1.69),[16.2,.046,4.27],'#bab4a8',east.yaw);
  facadeName(west,'IOE','Woburn Square',3.18,7.62,.79,'#3e4e58','#efede2');
}

function soasLibrary(lot) {
  const [core,reading]=lot.parts;
  lotBox(core,0,core.height/2,0,core.w,core.height,core.depth,'#8c8a80');
  lotBox(reading,0,9.35,0,reading.w,10.5,reading.depth,'#b6afa1');
  for(let side=0;side<4;side++) for(const [body,levels] of [[core,[2.2,16,18.3]],[reading,[5.8,9.2,12.6]]]) {
    const face=facadeOf(body,side),bay=face.width/9;
    for(const y of levels) {
      face.panel(0,y,face.width-.40,1.98,'#4d5858',.035);
      for(let i=0;i<9;i++) {
        const u=(i-4)*bay;
        face.panel(u,y,.12,2.13,'#787c72',.105);
        masonry.box(face.point(u-bay*.46,y,.15),[.34,2.35,.46],'#aca79a',face.yaw);
      }
      face.panel(0,y-1.20,face.width+.15,.36,'#cbc4b5',.28);
    }
  }
  for(let i=-2;i<=2;i++) for(let j=-2;j<=2;j++) {
    const x=(i-j)*2.8,z=(i+j)*2.65;
    const p=(u,y,v)=>lotPoint(core,x+u,core.height+y,z+v);
    masonry.quad(p(-1.67,.12,-1.58),p(-1.67,.91,1.58),p(1.67,.91,1.58),p(1.67,.12,-1.58),'#879b9c',[0,1,0]);
  }
}

function londonTerraceRange(lot) {
  const face=facadeOf(lot,lot.side), h=lot.height, houses=Math.max(2,Math.round(face.width/5.65));
  const width=face.width/houses, buff='#c8beab', brick='#827262';
  lotBox(lot,0,h/2,0,lot.w,h,lot.depth,brick);
  lotBox(lot,0,h-.21,0,lot.w+.26,.30,lot.depth+.26,buff);
  face.panel(0,1.63,face.width,3.23,'#c9c2b2',.05);
  for(let i=0;i<houses;i++) {
    const center=(i+.5-houses/2)*width;
    face.panel(center,h-.36,width-.12,.54,i%3?'#b9afa0':'#c7b79e',.10);
    masonry.box(face.point(center-width*.46,h+.70,-3.8),[.82,1.54,1.36],brick,face.yaw);
    for(const du of [-.21,.21]) masonry.tube(face.point(center-width*.46+du,h+1.46,-3.8),
      face.point(center-width*.46+du,h+1.98,-3.8),.13,.16,'#9c7159',6);
    for(let bay=0;bay<3;bay++) {
      const u=center+(bay-1)*width*.30;
      for(let floor=0;floor<4;floor++) {
        const door=bay===0&&floor===0, y=door?1.35:[1.72,5.06,8.38,11.62][floor]*h/14.7;
        const pane=width*(door?.22:.20), tall=door?2.64:floor===1?2.08:1.62;
        face.panel(u,y,pane+.23,tall+.24,buff,.08);
        face.panel(u,y,pane,tall,door?['#344744','#3c3936','#504744'][i%3]:'#4c575a',.16);
        if(door) {
          masonry.box(face.point(u,.16,.39),[pane+.64,.26,.76],buff,face.yaw);
        } else {
          face.panel(u,y,pane,.09,'#b5b2a8',.19);
          face.panel(u,y-tall/2-.12,pane+.39,.13,'#d7cebd',.23);
        }
      }
    }
    for(const y of [.34,.88]) masonry.box(face.point(center+.65,y,.70),
      [width*.62,.075,.07],'#424544',face.yaw);
    for(let j=0;j<7;j++) masonry.box(face.point(center+.65+(j/6-.5)*width*.62,.50,.70),
      [.055,.98,.06],'#454844',face.yaw);
  }
}

function byngChurch(lot) {
  const stone='#c3b9a3', slate='#655d59';
  lotBox(lot,0,5.45,0,lot.w,10.9,lot.depth,stone);
  for(const side of [-1,1]) {
    const point=(x,y,z)=>lotPoint(lot,x,y,z);
    const eave=side*lot.depth/2, end=lot.w/2;
    masonry.quad(point(-end,10.9,eave),point(end,10.9,eave),point(end,16,0),point(-end,16,0),slate);
    masonry.triangle(point(side*end,10.88,-lot.depth/2),point(side*end,16,0),point(side*end,10.88,lot.depth/2),stone,[side,0,0]);
    const face=facadeOf(lot,side===1?0:2);
    for(let i=0;i<7;i++) {
      const u=(i-3)*lot.w/7;
      for(const offset of [-.68,.68]) {
        face.panel(u+offset,6.1,.95,4.7,'#555c58',.06);
        masonry.triangle(face.point(u+offset-.475,8.43,.10),face.point(u+offset,9.62,.10),
          face.point(u+offset+.475,8.43,.10),'#555c58',face.normal);
      }
      masonry.box(face.point(u+2.4,4.15,.24),[.64,8.3,.56],stone,face.yaw);
    }
  }
  for(const s of [-1,1]) {
    const p=lotPoint(lot,lot.w/2-.48,0,s*(lot.depth/2-.48));
    masonry.tube(p,add(p,[0,13,0]),.85,.74,stone,8);
    masonry.tube(add(p,[0,13,0]),add(p,[0,15.2,0]),.74,.05,stone,8);
  }
}

function bruneiGallery(lot) {
  londonFront(lot,'brick');
  const face=facadeOf(lot,2);
  face.panel(0,2.12,face.width*.59,3.42,'#516162',.21);
  masonry.box(face.point(0,3.95,.50),[face.width*.62,.28,.90],'#c6bbab',face.yaw);
  for(const side of [-1,1]) {
    lotBox(lot,side*lot.w*.39,lot.height+.48,0,lot.w*.13,.47,lot.depth*.66,'#9ba189');
    lotBox(lot,side*lot.w*.39,lot.height+.84,0,lot.w*.11,.4,lot.depth*.61,'#647756');
  }
  facadeName(face,'BRUNEI GALLERY','SOAS',4.72,8.8,.75,'#554b40','#e7dcca');
}

function quadStoneRange(lot) {
  const h=lot.height, cream='#d9cebb',cap='#e9e1cf';
  lotBox(lot,0,h/2,0,lot.w,h,lot.depth,cream);
  lotBox(lot,0,h-.32,0,lot.w+.52,.38,lot.depth+.52,cap);
  for(let side=0;side<4;side++) {
    const face=facadeOf(lot,side), n=Math.max(3,Math.round(face.width/3.6)), bay=face.width/n;
    face.panel(0,h*.35,face.width+.22,.32,cap,.14);
    face.panel(0,h*.85,face.width+.22,.24,cap,.14);
    for(let i=0;i<n;i++) {
      const u=(i+.5-n/2)*bay;
      londonArch(face,u,h*.18,bay*.52,h*.23,'#68695f',cap);
      face.panel(u,h*.59,bay*.60,h*.29,'#b1a38c',.09);
      face.panel(u,h*.59,bay*.49,h*.25,'#526062',.16);
      face.panel(u,h*.59,bay*.49,.09,'#c4bcaa',.19);
      face.panel(u,h*.59,.083,h*.25,'#c4bcaa',.19);
      face.panel(u,h*.753,bay*.74,.14,cap,.16);
      face.panel(u,h*.918,bay*.51,.66,'#8c8877',.06);
      if(i%3===0) face.panel(u-bay*.47,h*.60,.33,h*.48,cap,.16);
    }
  }
}

// Batch windows as single quads in the existing masonry cells. Only named
// street fronts need shop bays, canopies or the Cancer Institute's fins.
function londonBlockFront(lot) {
  const skin=lot.skin??lot.style,brick=skin==='brick'||skin==='louvres';
  const wall=brick?'#966b58':skin==='ribbon'?'#ad9580':'#c4bbaa';
  const trim=brick?'#cdb69c':'#d9d1bf';
  for(const part of lot.parts??[lot]) {
    const h=part.height;
    lotBox(part,0,h/2,0,part.w,h,part.depth,wall);
    lotBox(part,0,h-.12,0,part.w+.18,.24,part.depth+.18,trim);
    const floors=Math.max(2,Math.round(h/3.3)),pitch=h/floors;
    for(let side=0;side<4;side++) {
      const face=facadeOf(part,side),front=part===lot&&side===lot.side;
      const bays=Math.max(1,Math.round(face.width/(front?3.2:3.9)));
      const bay=face.width/bays;
      for(let row=0;row<floors;row++) {
        const y=(row+.53)*pitch;
        if(front&&(skin==='ribbon'||skin==='louvres')) {
          face.panel(0,y,face.width-.9,pitch*.59,'#536870');
        } else {
          for(let col=0;col<bays;col++) {
            const isDoor=front&&row===0&&col===Math.floor(bays/2);
            face.panel((col+.5-bays/2)*bay,isDoor?1.22:y,bay*(isDoor?.73:.56),
              isDoor?2.44:pitch*.55,(col+row+side)%5===0?'#778588':'#536164');
          }
        }
      }
      if(front&&skin==='louvres') {
        const count=Math.ceil(face.width/.98);
        for(let i=0;i<count;i++) face.panel(((i+.5)/count-.5)*face.width,h*.56,.24,h*.81,'#b66b4e',.095);
      }
      if(front) face.panel(0,3.07,face.width,.20,trim,.09);
    }
  }
}

function stPancrasChurch() {
  const stone='#d3c9b6',trim='#e2d9c8';
  lotBox(stPancras,0,5,0,stPancras.w,10,stPancras.depth,stone);
  const front=facadeOf(stPancras,3);
  front.panel(0,2.7,3.0,5.4,'#864a3b');
  for(const side of [0,2]) {
    const face=facadeOf(stPancras,side);
    for(let i=-3;i<=3;i++) face.panel(i*4.6,5,1.62,3.7,'#6b7679');
  }
  for(const col of churchColumns) {
    masonry.tube([col.x,0,col.z],[col.x,8.2,col.z],.37,.32,stone,8);
    lotBox(col,0,7.99,0,.90,.42,.90,trim);
  }
  lotBox(churchPorch,0,8.74,0,churchPorch.w,1.08,churchPorch.depth,trim);
  const gable=facadeOf(churchPorch,3);
  masonry.triangle(gable.point(-6.2,9.27),gable.point(6.2,9.27),gable.point(0,10.1),stone,gable.normal);
  for(const [bottom,top,base,cap] of [[10,15,3,3],[15,21,2.65,2.35],[21,25,1.95,1.6],[25,26,1.6,.15]]) {
    masonry.tube([churchTower.x,bottom,churchTower.z],[churchTower.x,top,churchTower.z],base,cap,trim,8);
  }
}

function londonCourtBuilding(lot) {
  for(const part of lot.parts) londonFront(part,'brick');
  const friends=lot.style==='friends', front=facadeOf(lot.parts[0],friends?2:3);
  const y=friends?6.5:5.7;
  for(const u of [-5,-2,2,5]) {
    const p=front.point(u,0,.65);
    masonry.tube(p,add(p,[0,y,0]),.33,.29,'#d2c6ae',10);
  }
  masonry.box(front.point(0,y+.24,.32),[13,.65,2.1],'#d0c5ae',front.yaw);
  if(!friends) {
    const gate=facadeOf(lot,3);
    for(const sign of [-1,1]) {
      for(let i=0;i<8;i++) {
        const pos=gate.point(sign*(3.5+i*.32),1.29,.04);
        scenery.box(pos,[.075,2.6,.081],'#373c39',gate.yaw);
      }
      const [x,,z]=gate.point(sign*4.62,0,.04);
      uclFixtures.push(campusFootprint(x,z,2.32,.09,gate.yaw,2.6));
    }
  }
}

function senateForecourt() {
  const lot=lotPart(senateHouse,-40,0,14.4,20,5.8);
  for(const side of [-1,1]) {
    // The timber stair pavilion frames the view along the central approach.
    for(let i=0;i<15;i++) {
      const h=(i+1)*.344,x=-7.05+i*.92,z=side*8.4;
      lotBox(lot,x,h-.15,z,.96,.30,3.15,i%2?'#b49b78':'#c6ac86',scenery);
      if(i%3===1) for(const edge of [-1,1]) lotBox(lot,x,h/2,z+edge*1.42,.16,h,.16,'#968569',scenery);
    }
    campusCourtRail(lot,side*9.9);
    uclFixtures.push(lotPart(lot,0,side*8.4,14.4,3.15,5.8));
    for(const x of [-8.6,8.6]) {
      const bed=lotPart(lot,x,side*11.8,4.8,3.5,.37);
      lotBox(bed,0,.19,0,bed.w,.38,bed.depth,'#a29c87',scenery);
      for(let i=-1;i<=1;i++) foliage.ellipsoid(lotPoint(bed,i*1.45,.85,.36*(i%2)),
        [1.04,.64,.82],i%2?'#788459':'#929264',7,4);
      uclFixtures.push(bed);
    }
    deciduous(lot.x-8,lot.z+side*14.3,1.85,0);
  }
  lotBox(lot,6.3,4.98,0,2.0,.37,17.2,'#ac9271',scenery);
  for(const x of [5.36,7.22]) {
    lotBox(lot,x,5.94,0,.09,.105,17.2,'#7e776a',scenery);
    for(let i=-8;i<=8;i++) lotBox(lot,x,5.47,i,.055,.89,.065,'#7e776a',scenery);
  }
}

function campusCourtRail(lot,z) {
  const base=lotPoint(lot,-7.2,1.19,z),top=lotPoint(lot,6.72,6.09,z);
  scenery.tube(base,top,.065,.065,'#817867',6);
  for(let i=0;i<=10;i++) {
    const p=lotPoint(lot,-7.2+i*1.392,1.19+i*.49,z);
    scenery.tube(add(p,[0,-.94,0]),p,.038,.038,'#817867',5);
  }
}
