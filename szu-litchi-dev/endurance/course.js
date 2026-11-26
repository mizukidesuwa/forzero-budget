function enduranceCourse() {
  const [nanhai,shennan,baishi,cityEast]=openStreets.map(({path})=>path);
  const [lideNorth,,,ligong,,liye,lixin]=cityLinks.map(({path})=>path);
  const [southLoop,zhiyuan,zhihe]=canghaiStreets.map(({path})=>path);
  const lane=(road,offset)=>travelTable(road.rows.map(row=>
    offsetVertex(courseFrame(road,row.distance),offset,ROAD_Y)));
  const shennanWest=lane(shennan,-6.15), nanhaiSouth=lane(nanhai,5.7);
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
    {name:'深南大道长直',color:'#f4d079',parts:[
      section(ligong),
      turn([[151,-235],[150.2,-239],[145,-241.9],[135,-242.7]]),
      check(section(shennanWest,[135,-242.7],[-118,-247]),[7,-251],'深南大道'),
      turn([[-118,-247],[-126.5,-246],[-134.5,-242],[-138.2,-235],[-138.5,-221]]),
      check(section(nanhaiSouth,[-138.5,-221],[-128.6,5]),[-132,-56],'南海大道'),
      turn([[-128.6,5],[-127,12],[-124,17],[-119,20.5],[-113,22]]),
      check(section(lideNorth,[-113,22],[-92.35,22.3]),[-95,19.5],'立德门')
    ]},
    {name:'双湖内环',color:'#97dbea',parts:[
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
        const {xy:[x,z],name}=part.check;
        let nearest=null, best=Infinity;
        for(let i=starts[partIndex];i<(starts[partIndex+1]??path.rows.length);i++) {
          const row=path.rows[i], error=(row.p[0]-x)**2+(row.p[2]-z)**2;
          if(error<best) {nearest=row;best=error;}
        }
        spec.push([nearest.distance,name]);
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
    '汇文发车，经深南大道、双湖和白石路进入南区，再从立心门回校冲线。冲刺耐力恢复较慢。',
    path,spec,path.length,{absolute:true,cityAccess:true,thresholds:[.966,1.10,1.30]});
  event.stages=stages;
  for(const stage of stages) event.gates[stage.finishGate].color=stage.color;
  event.sprintRecovery=.66;
  return event;
}

function activeStage(event,nextGate) {
  return event.stages?.find(stage=>nextGate<=stage.finishGate)??event.stages?.at(-1);
}
