import { ROAD_Y, add, clamp, scale } from '../../../core/math.js';
import {
  along, courseFrame, joinTrack, makeCourse, namedCourse, offsetVertex, pointDistance, section, street, travelTable,
} from '../../geometry.js';
import {
  betweenLakes, campusGates, canghaiStreets, cityLinks, dujuanCrest, dujuanFoot, dujuanPass, eastEnd,
  eastTeachingCrossing, hillReturn, hospitalCrossing, lakeRim, learningLink, lectureCross, libraryEastConnector,
  librarySouth, northSpine, northToSouth, openStreets, parkWalks, researchConnector, roads, southConnector,
  southToLake, sportsConnector, teachingConnector, throughCenter, westEnd, westReturn, westToNorth,
} from './layout.js';
import { flyover, hillHeight } from './terrain.js';

const lakeRoute=joinTrack([
  section(southConnector,[1,72],[-2,91]),section(lakeRim),section(betweenLakes,[-66,103],[-62,188]),
  section(southToLake,[-62,188],[-114,203]),section(westReturn)
]);
const libraryRoute=joinTrack([
  section(throughCenter,[-52,15],[24,18]),section(southConnector,[24,18],[-3,107]),
  section(librarySouth,[-3,107],[77,75]),section(libraryEastConnector),
  section(northToSouth,[138,60],[143,0]),section(hospitalCrossing,[143,0],[84,12]),
  section(eastTeachingCrossing,[84,12],[90,-21]),section(northSpine,[90,-21],[-46,-20])
]);
const teachingRoute=joinTrack([
  section(teachingConnector,[-91,-158],[11,-149]),section(lectureCross),section(learningLink),
  section(northSpine,[-46,-20],[90,-21]),section(researchConnector,[90,-21],[86,-134]),
  section(westToNorth,[86,-134],[130,-171]),section(sportsConnector)
]);

const ringPath=travelTable([
  ...westToNorth.rows.map(r=>r.p),...northToSouth.rows.slice(1).map(r=>r.p),...southToLake.rows.slice(1).map(r=>r.p)
]);
const ringLength=eastEnd+southToLake.length*.635;

function enduranceFlyoverParts(nanhaiSouth) {
  const {path,from,to,crossing}=flyover;
  const laneOffset=11, turnAt=from-36;
  const eased=t=>{
    const p=clamp(t,0,1);
    return p*p*(3-2*p);
  };
  const roadPoint=(d,offset)=>offsetVertex(courseFrame(path,d),offset,ROAD_Y);
  const xy=([x,,z])=>[x,z];
  const westbound=travelTable(path.rows.map(({distance:d})=>
    roadPoint(d,-6.15*eased((d-to-7)/44)-laneOffset*eased((from-5-d)/27))));
  const eastbound=travelTable(path.rows.map(({distance:d})=>roadPoint(d,laneOffset)));
  const turnFrame=courseFrame(path,turnAt);
  const turning=travelTable(Array.from({length:41},(_,i)=>{
    const angle=i*Math.PI/40;
    return add(turnFrame.p,add(scale(turnFrame.side,-laneOffset*Math.cos(angle)),
      scale(turnFrame.f,-laneOffset*Math.sin(angle))));
  }));
  const turnBack=xy(along(turning,turning.length/2));
  const turnSouth=roadPoint(pointDistance(path,[-163,-241]),laneOffset);
  const joinSouth=along(nanhaiSouth,pointDistance(nanhaiSouth,[-139,-212]));
  const exit=street([xy(turnSouth),[-154,-230.4],[-147,-227.8],[-141.7,-221.7],xy(joinSouth)]);
  const bridgeApproach=xy(roadPoint(to+12,-1));
  return {joinSouth:xy(joinSouth),parts:[
    {...section(westbound,[135,-242.7],bridgeApproach),check:{xy:bridgeApproach,name:'立交东侧引道'}},
    {...section(westbound,bridgeApproach,xy(roadPoint(turnAt,-laneOffset))),
      check:{xy:xy(along(path,crossing)),name:'深南立交桥面'}},
    {...section(turning),check:{xy:turnBack,name:'立交西侧折返',half:4.5}},
    section(eastbound,xy(roadPoint(turnAt,laneOffset)),xy(turnSouth)),
    {...section(exit),check:{xy:xy(joinSouth),name:'立交出弯并线'}}
  ]};
}

function enduranceCourse() {
  const [nanhai,,baishi,cityEast]=openStreets.map(({path})=>path);
  const [lideNorth,,,ligong,,liye,lixin]=cityLinks.map(({path})=>path);
  const [southLoop,zhiyuan,zhihe]=canghaiStreets.map(({path})=>path);
  const lane=(road,offset)=>travelTable(road.rows.map(row=>
    offsetVertex(courseFrame(road,row.distance),offset,ROAD_Y)));
  const nanhaiSouth=lane(nanhai,5.7);
  const bridge=enduranceFlyoverParts(nanhaiSouth);
  const baishiEast=lane(baishi,4.20), baishiWest=lane(baishi,-4.35), eastNorth=lane(cityEast,-3.65);
  const turn=(nodes)=>section(street(nodes));
  const check=(part,xy,name)=>({...part,check:{xy,name}});
  const legs=[
    {name:'汇文连弯',color:'#c7e687',parts:[
      section(teachingConnector,[-86,-160],[11,-149]),
      check(section(lectureCross),[-3,-110],'汇文连续弯'),
      section(learningLink),
      check(section(northSpine,[-46,-20],[90,-21]),[54,-23],'中央教学道'),
      section(researchConnector,[90,-21],[86,-134]),
      section(westToNorth,[86,-134],[130,-171]),
      check(section(sportsConnector),[171,-119],'体育场西侧'),
      section(northToSouth,[192,-56],[149,-185]),
      check(section(roads[8]),[150,-201],'立功门内')
    ]},
    {name:'深南立交',color:'#f4d079',parts:[
      section(ligong),
      turn([[151,-235],[150.2,-239],[145,-241.9],[135,-242.7]]),
      ...bridge.parts
    ]},
    {name:'双湖内环',color:'#97dbea',parts:[
      check(section(nanhaiSouth,bridge.joinSouth,[-128.6,5]),[-132,-56],'南海大道'),
      turn([[-128.6,5],[-127,12],[-124,17],[-119,20.5],[-113,22]]),
      check(section(lideNorth,[-113,22],[-92.35,22.3]),[-95,19.5],'立德门'),
      section(throughCenter,[-92,25],[-68,24]),
      turn([[-68,24],[-65.4,27.5],[-65.6,34],[-64,44]]),
      check(section(betweenLakes,[-64,44],[-62,188]),[-65,138],'双湖之间'),
      check(section(southToLake,[-62,188],[-191,230]),[-126,207],'西岸长弯'),
      section(roads[11]),
      check(section(liye),[-208,232],'立业门')
    ]},
    {name:'白石路冲刺',color:'#f5c3a0',parts:[
      section(nanhai,[-213.4,230],[-217.9,244]),
      turn([[-217.9,244],[-219.6,252],[-216.7,259.8],[-207,265.5],[-195,268.1]]),
      check(section(baishiEast,[-195,268],[162,180.6]),[-48,273],'白石路西段'),
      turn([[162,180.6],[170,180.3],[175.3,181.3],[178.3,184.2]]),
      check(section(zhihe,[178.3,184.2],[184,208]),[182.6,198.8],'致和门')
    ]},
    {name:'南区绕行',color:'#ddc0fc',parts:[
      check({path:southLoop,start:southLoop.length,end:pointDistance(southLoop,[225,193])},[306,240],'南区看台弯'),
      check(section(zhiyuan),[232,175.5],'致远门')
    ]},
    {name:'东侧回城',color:'#f4db8b',parts:[
      turn([[232.7,162.85],[231,160.9],[227,159.7],[220,161.3]]),
      section(baishiWest,[220,161.3],[193,166.9]),
      turn([[193,166.9],[189.6,162.5],[188.5,154],[190.4,145]]),
      check(section(eastNorth,[190.4,145],[282.8,-126.9]),[210,-19],'东侧联络路'),
      turn([[282.8,-126.9],[285.5,-131.1],[285.3,-133.5],[282.14,-134.8]]),
      check(section(lixin,[282.14,-134.8],campusGates[5].xy),[270,-140.5],'立心门')
    ]},
    {name:'双馆决胜',color:'#a8e4a8',parts:[
      section(roads[12],campusGates[5].xy,[247,-142]),
      check(section(northToSouth,[247,-142],[138,60]),[155,-22],'东区回旋'),
      section(libraryEastConnector,[138,60],[77,75]),
      check(section(librarySouth,[77,75],[-3,107]),[20,109],'南馆外环'),
      section(southConnector,[-3,107],[24,18]),
      section(throughCenter,[24,18],[-70,24])
    ]}
  ];
  const parts=legs.flatMap(leg=>leg.parts), starts=[];
  const path=joinTrack(parts,starts);
  const spec=[[0,'汇文楼发车']];
  let startGate=0, partIndex=0;
  const stages=legs.map(({name,color,parts},index)=>{
    for(const part of parts) {
      if(part.check) {
        const {xy:[x,z],name,half}=part.check;
        let nearest=null, best=Infinity;
        for(let i=starts[partIndex];i<(starts[partIndex+1]??path.rows.length);i++) {
          const row=path.rows[i], error=(row.p[0]-x)**2+(row.p[2]-z)**2;
          if(error<best) {nearest=row;best=error;}
        }
        spec.push([nearest.distance,name,half]);
      }
      partIndex++;
    }
    if(index===legs.length-1) spec.push([path.length,'时光广场']);
    const finishGate=spec.length-1;
    const stage={index,name,color,startGate,finishGate,from:spec[startGate][0],to:spec[finishGate][0]};
    startGate=finishGate;
    return stage;
  });
  const event=makeCourse('endurance','荔园环城耐力赛',
    '深南立交单独计段：桥面长直道适合高齿比，西侧折返可走内线或外侧晚切，出弯后到并线点结算。随后经双湖、白石路和立心门回校。',
    path,spec,path.length,{absolute:true,cityAccess:true,flyover:true,revision:7,thresholds:[.966,1.10,1.30]});
  event.stages=stages;
  for(const stage of stages) event.gates[stage.finishGate].color=stage.color;
  return event;
}

function hillCourse(id,name,description,sections,start,stations,finish,thresholds) {
  const path=joinTrack(sections);
  const event=namedCourse(id,name,description,path,start,stations,finish,thresholds);
  const profile=path.rows.map(({p,distance})=>[distance,hillHeight(p[0],p[2])]);
  const gain=profile.slice(1).reduce((sum,[,h],i)=>sum+Math.max(0,h-profile[i][1]),0);
  const loss=profile.slice(1).reduce((sum,[,h],i)=>sum+Math.max(0,profile[i][1]-h),0);
  return Object.assign(event,{revision:6,elevation:{profile,gain,loss}});
}

function hillCourses() {
  return [
    hillCourse('dujuan-climb','杜鹃山爬坡赛','从立德门经南馆到坡脚，顺着缓弯转上山腰，再沿直坡冲过山脊。',
      [section(throughCenter,[-86,24],[24,18]),section(southConnector,[24,18],dujuanFoot),
        section(dujuanPass,null,dujuanCrest)],
      '立德门内侧',[[[-47,14],'时光广场'],[[24,24],'中央联络道'],[[1,76],'南馆外道'],
        [dujuanFoot,'坡脚入口'],[[5,128],'上山缓弯'],[[21,139],'山腰直坡']], '杜鹃山脊',[.97,1.10,1.28]),
    hillCourse('dujuan-descent','杜鹃山下坡赛','从山脊沿直坡提速，坡脚顺着宽弯收速，再经上文山湖转入林荫道。',
      [section(dujuanPass,dujuanCrest,dujuanFoot),section(southConnector,dujuanFoot,[-2,91]),
        section(lakeRim),section(betweenLakes,[-66,103],[-64,44]),section(hillReturn)],
      '杜鹃山脊',[[[21,139],'山腰直坡'],[[5,128],'下山缓弯'],[dujuanFoot,'坡脚并线'],
        [[-3,103],'双湖路口'],[[-37,94],'上湖长弯'],[[-65,82],'湖间北上'],[[-39,54],'林荫路']],
      '南馆西侧',[.96,1.10,1.30])
  ];
}

function buildPerimeterCourse(id,name,description,legs,startLabel,finishLabel,thresholds) {
  const parts=[],starts=[];
  for(const leg of legs) for(const part of leg.parts) parts.push(part);
  const path=joinTrack(parts,starts);
  const spec=[[0,startLabel]];
  for(const [index,part] of parts.entries()) {
    if(!part.check) continue;
    const [x,z]=part.check.xy;
    let best=null,err=Infinity;
    for(let i=starts[index];i<(starts[index+1]??path.rows.length);i++) {
      const row=path.rows[i],gap=(row.p[0]-x)**2+(row.p[2]-z)**2;
      if(gap<err) {best=row;err=gap;}
    }
    spec.push(part.check.half?[best.distance,part.check.name,part.check.half]:[best.distance,part.check.name]);
  }
  spec.push([path.length,finishLabel]);
  const event=makeCourse(id,name,description,path,spec,path.length,{absolute:true,cityAccess:true,revision:8,thresholds});
  if(legs.length>1) {
    let startGate=0;
    event.stages=legs.map((leg,index)=>{
      const finishGate=index===legs.length-1?event.gates.length-1:event.gates.findIndex(gate=>gate.name===leg.end);
      const stage={index,name:leg.name,color:leg.color,startGate,finishGate,
        from:event.gates[startGate].distance,to:event.gates[finishGate].distance};
      event.gates[finishGate].color=leg.color;
      startGate=finishGate;
      return stage;
    });
  }
  return event;
}

function perimeterCourses() {
  const [nanhai,shennan,baishi,cityEast]=openStreets.map(street=>street.path);
  const [lideNorth,,lizhi,,liyan,,lixin]=cityLinks.map(street=>street.path);
  const [southLoop,zhiyuan,zhihe]=canghaiStreets.map(street=>street.path);
  const lane=(road,offset)=>travelTable(road.rows.map(row=>offsetVertex(courseFrame(road,row.distance),offset,ROAD_Y)));
  const turn=nodes=>section(street(nodes));
  const check=(part,xy,name,half)=>({...part,check:{xy,name,half}});

  const nanhaiNorth=lane(nanhai,-5.7), shennanEast=lane(shennan,11.0);
  const baishiEast=lane(baishi,4.20), baishiWest=lane(baishi,-4.35), eastNorth=lane(cityEast,-3.65);
  const dIn=pointDistance(parkWalks[0],[-167,-125]), dOut=pointDistance(parkWalks[0],[-234,-192]);

  const lixiang=buildPerimeterCourse('lixiang-park','荔香公园城景环线',
    '从时光广场经立德门北上南海大道，绕行荔香公园步道与南山明珠，再沿深南大道掠过 Southizzahut 大厦，从立志门冲回汇文楼。',
    [
      {parts:[
        section(throughCenter,[-52,15],[-92,25]),
        check(section(lideNorth,[-92.35,22.3],[-113,22]),[-105,20.5],'立德门'),
        turn([[-113,22],[-116,18],[-117,11],[-117,2]]),
        check(section(nanhaiNorth,[-117,2],[-125,-112]),[-120,-56],'南海大道'),
        turn([[-125,-112],[-126,-119],[-128,-123],[-131,-124]]),
        section(parkWalks[1],[-131,-124],[-167,-125]),
        check({path:parkWalks[0],start:dIn,end:dOut},[-224,-67],'荔香公园南环',1.95),
        check(section(parkWalks[2],[-234,-192],[-227.5,-223]),[-230,-206],'荔香公园北口',1.95),
        turn([[-227.5,-223],[-226.5,-228.5],[-222.5,-231.2],[-216,-232],[-206,-232]]),
        check(section(shennanEast,[-206,-232],[30,-233]),[-12,-234],'Southizzahut 大厦 · 深南大道'),
        turn([[30,-233],[36.5,-232.2],[39.5,-229],[40,-224]]),
        check(section(lizhi,[40,-224],campusGates[1].xy),[38.7,-219],'立志门'),
        check(section(roads[9],campusGates[1].xy,[11,-149]),[24,-181],'北门林荫道'),
        section(lectureCross,[11,-149],[-33,-78])
      ]}
    ],'时光广场','汇文楼广场',[.96,1.10,1.29]);

  const canghai=buildPerimeterCourse('canghai-tech','白石科创城际冲刺',
    '自汇紫楼南侧出立言门，沿白石路掠过软件产业基地，穿行沧海校区与深圳虚拟大学园，从立心门冲回体育馆北侧。',
    [
      {parts:[
        section(libraryEastConnector,[77,75],[138,60]),
        check(section(northToSouth,[138,60],[107,151]),[125,112],'南馆东环'),
        section(roads[10],[107,151],campusGates[3].xy),
        check(section(liyan,campusGates[3].xy,[99.1,186.8]),[96,175],'立言门'),
        turn([[99.1,186.8],[105,191],[114,191.5],[124,189.2]]),
        check(section(baishiEast,[124,189.2],[162,180.6]),[146,184.5],'软件基地 · 白石路'),
        turn([[162,180.6],[170,180.3],[175.3,181.3],[178.3,184.2]]),
        check(section(zhihe,[178.3,184.2],[184,208]),[182.6,198.8],'致和门'),
        check({path:southLoop,start:southLoop.length,end:pointDistance(southLoop,[225,193])},[306,240],'沧海看台弯'),
        check(section(zhiyuan),[232,175.5],'致远门'),
        turn([[232.7,162.85],[231,160.9],[227,159.7],[220,161.3]]),
        section(baishiWest,[220,161.3],[193,166.9]),
        turn([[193,166.9],[189.6,162.5],[188.5,154],[190.4,145]]),
        check(section(eastNorth,[190.4,145],[202,-13]),[195,65],'东侧联络路'),
        check(section(eastNorth,[202,-13],[281.5,-124]),[260,-84],'深圳虚拟大学园'),
        turn([[281.5,-124],[283,-130],[282.14,-134.8]]),
        check(section(lixin,[282.14,-134.8],campusGates[5].xy),[270.2,-140.5],'立心门'),
        section(roads[12],campusGates[5].xy,[247,-142]),
        check(section(northToSouth,[247,-142],[192,-56]),[219,-103],'东侧环道'),
        section(sportsConnector,[192,-56],[130,-171])
      ]}
    ],'汇紫楼南侧','体育馆北侧',[.96,1.10,1.29]);

  return [lixiang,canghai];
}

// Called after the map provider registers its terrain and checkpoint queries.
function createSzuCourses() {
  return [
    namedCourse('libraries','双馆穿行','从时光广场过双馆，经东侧联络道折回中央教学区。',libraryRoute,
      '时光广场',[[[-4,15],'汇典楼'],[[-2,91],'汇智楼'],[[57,92],'南馆外环'],[[77,75],'汇紫楼南侧'],
      [[139,53],'东侧联络道'],[[117,5],'东侧横街'],[[78,-22],'中部教学路']],'演会中心',[.94,1.09,1.27]),
    namedCourse('lakes','双湖冲刺','从南馆附近出发，穿过双湖之间，沿西岸返回立德门内侧。',lakeRoute,
      '南馆联络路',[[[-30,94],'上文山湖'],[[-65,138],'双湖之间'],[[-91,194],'下文山湖'],
      [[-132,158],'西岸弯道'],[[-110,91],'西侧林荫道']],'立德门内侧',[.93,1.11,1.31]),
    namedCourse('teaching','汇文技术赛','穿过汇文楼群和中央教学区，经北段连弯抵达体育馆外侧。',teachingRoute,
      '北区教学道',[[[-34,-158],'汇文楼组团'],[[-5,-108],'北区连续弯'],[[-52,-47],'教学楼夹道'],[[1,-17],'汇典楼北侧'],
      [[91,-60],'东侧教学道'],[[111,-158],'北侧环校道'],[[172,-117],'体育馆外侧']],'东侧联络道',[.96,1.12,1.30]),
    makeCourse('ring','粤海环校赛','从立德门出发，经立功门、立心门，最后到文山湖。',
        ringPath,[[0,'立德门'],[westToNorth.length*.207,'教育学部'],[westToNorth.length*.605,'汇星楼'],[westEnd,'立功门'],
          [westEnd+northToSouth.rows[96].distance,'立心门'],[westEnd+northToSouth.rows[288].distance+12,'校医院'],
          [eastEnd-18,'南区运动广场'],[eastEnd+southToLake.length*.285,'南侧环校道'],[ringLength,'文山湖']],
        ringLength,{absolute:true,oldKey:'szu-yuehai-clockwise-v3',thresholds:[.936,1.08,1.22]}),
    enduranceCourse(), ...hillCourses(), ...perimeterCourses()
  ];
}

export {
  lakeRoute, libraryRoute, teachingRoute, ringPath, ringLength, enduranceFlyoverParts,
  enduranceCourse, hillCourse, hillCourses, buildPerimeterCourse, perimeterCourses, createSzuCourses,
};
