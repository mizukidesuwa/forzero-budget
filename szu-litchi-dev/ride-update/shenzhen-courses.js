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
