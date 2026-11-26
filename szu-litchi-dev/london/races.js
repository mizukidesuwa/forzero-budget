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

const londonCourses=[
  makeLondonCourse('quad-sprint','主庭院冲刺',
    '从 Wilkins 前的 Main Quad 发车，过 Gower Street 和 Gordon Square，从 Bedford Way 冲向 IOE。',
    [
      londonSection('quad',[34,0],junction.quadGate),
      londonSection('gower',junction.quadGate,junction.torringtonGower,[0,28,'Cruciform 对街']),
      londonSection('torrington',junction.torringtonGower,junction.maletTorrington,[33,192,'Torrington Place']),
      londonSection('byng',junction.maletTorrington,junction.byngGordon),
      londonSection('gordon',junction.byngGordon,junction.gordonSW),
      londonSection('gordonSouth',junction.gordonSW,junction.bedfordTavistock,[166,153,'Gordon Square']),
      londonSection('bedford',junction.bedfordTavistock,[259,299],[257,218,'Bedford Way'])
    ],'UCL · Main Quad','IOE · 20 Bedford Way'),
  makeLondonCourse('square-circuit','双广场技术赛',
    '绕过 Gordon Square，在 Russell Square 连过四角，再沿 Thornhaugh Street 穿回 Woburn Square。',
    [
      londonSection('gordonNorth',[145,79],junction.gordonNE),
      londonSection('gordonEast',junction.gordonNE,junction.gordonSE,[214,120,'Gordon Square 东侧']),
      londonSection('gordonSouth',junction.gordonSE,junction.bedfordTavistock),
      londonSection('bedford',junction.bedfordTavistock,junction.russellNW,[258,296,'IOE · Bedford Way']),
      londonSection('russellNorth',junction.russellNW,junction.russellNE,[272,376,'Russell Square 北侧']),
      londonSection('russellEast',junction.russellNE,junction.russellSE,[335,448,'Russell Square 东侧']),
      londonSection('russellSouth',junction.russellSE,junction.russellSW,[279,509,'Russell Square 南侧']),
      londonSection('russellWest',junction.russellSW,junction.russellNW,[213,440,'Russell Square 西侧']),
      londonSection('thornhaugh',junction.russellNW,[185,255],[194,302,'IOE · 西侧步道']),
      londonSection('woburn',[185,255],[164,181])
    ],'Gordon Square 北侧','Woburn Square'),
  makeLondonCourse('bloomsbury-endurance','布卢姆斯伯里耐力赛',
    '从 UCLH 外的 Euston Road 发车，经 Tavistock Square、IOE 和 Senate House，最后回到 UCL 主庭院。',
    [
      londonSection('euston',[-87,-136],junction.eustonGordon,[21,-143,'Euston Road']),
      londonSection('gordon',junction.eustonGordon,junction.gordonNW,[125,33.5,'UCL Student Centre']),
      londonSection('gordonNorth',junction.gordonNW,junction.gordonNE),
      londonSection('endsleighStreet',junction.gordonNE,[217,-56]),
      londonSection('endsleigh',[217,-56],[335,-51],[270,-51,'Endsleigh Gardens']),
      londonSection('woburnPlace',[335,-51],junction.tavistockWoburn),
      londonSection('tavistockSouth',junction.tavistockWoburn,junction.bedfordTavistock,[284,154,'Tavistock Square']),
      londonSection('bedford',junction.bedfordTavistock,junction.russellNW,[259,300,'IOE · 20 Bedford Way']),
      londonSection('russellWest',junction.russellNW,junction.russellSW,[213,443,'Russell Square 西侧']),
      londonSection('montague',junction.russellSW,junction.maletMontague,[150,515,'Montague Place']),
      londonSection('malet',junction.maletMontague,junction.maletTorrington,[70,420,'UoL · Senate House']),
      londonSection('torrington',junction.maletTorrington,junction.torringtonCourt,[1,184,'Torrington Place']),
      londonSection('court',junction.torringtonCourt,junction.universityCourt,[-163,119,'Tottenham Court Road']),
      londonSection('university',junction.universityCourt,junction.universityGower),
      londonSection('gower',junction.universityGower,junction.quadGate),
      londonSection('quad',junction.quadGate,[41,0])
    ],'UCLH · Euston Road','UCL · Main Quad',[
      ['北区街道','Tavistock Square','#e1c0e9'],
      ['学院街区','UoL · Senate House','#ebcb89'],
      ['主庭院冲线','UCL · Main Quad','#bbddd1']
    ]),
  makeLondonCourse('medical-chicane','医学区折返冲刺',
    '从 UCLH 门前经商业街折入医学区发卡连弯，穿越 Paul O’Gorman 与 Drill Hall，沿 Gower Street 冲回主庭院。',
    [
      londonSection('euston',[-87,-136],junction.eustonCourt),
      londonSection('court',junction.eustonCourt,junction.graftonCourt,[-174,-62,'Tottenham Court Rd']),
      londonSection('grafton',junction.graftonCourt,junction.huntleyGrafton,[-139,-35,'Grafton Way']),
      londonSection('huntley',junction.huntleyGrafton,[-103,119],[-104,78,'UCL 医学区 · Huntley St']),
      londonSection('capper',[-103,119],[-164,111]),
      londonSection('court',[-164,111],[-150,280],[-153,237,'Heal’s · 商业街']),
      londonSection('chenies',[-150,280],[5,303],[-75,290,'Drill Hall · Chenies St']),
      londonSection('gower',[5,303],junction.quadGate,[2,216,'Waterstones · Gower St']),
      londonSection('quad',junction.quadGate,[40,0])
    ],'UCLH · Euston Road','UCL · Main Quad'),
  makeLondonCourse('st-pancras-squares','圣潘克拉斯与三广场',
    '绕过圣潘克拉斯教堂与希尔顿，经 Endsleigh 与 Gordon Square，穿行 Tavistock 北侧新通廊，冲向 Russell Square 地铁站。',
    [
      londonSection('euston',[195,-145],junction.eustonWoburn),
      londonSection('woburnPlace',junction.eustonWoburn,[335,-51],[336,-88,'圣潘克拉斯教堂']),
      londonSection('endsleigh',[335,-51],[174,-58],[292,-51,'Hilton · Endsleigh Gdns']),
      londonSection('taviton',[174,-58],[182,79],[178,20,'Taviton St · SSEES']),
      londonSection('gordonNorth',[182,79],junction.gordonNW),
      londonSection('gordon',junction.gordonNW,junction.gordonSW,[120,115,'Gordon Square 西侧']),
      londonSection('gordonSouth',junction.gordonSW,junction.bedfordTavistock,[185,153,'Gordon Square 南侧']),
      londonSection('tavistockWest',junction.bedfordTavistock,[251,79],[252,115,'Tavistock 西侧']),
      londonSection('tavistockNorth',[251,79],[336,78],[294,78,'Tavistock 北侧']),
      londonSection('woburnPlace',[336,78],junction.tavistockWoburn,[336,118,'BMA House · Lynton']),
      londonSection('woburnLower',junction.tavistockWoburn,junction.russellNE,[333,265,'Royal National · Woburn']),
      londonSection('bernard',junction.russellNE,[423,384])
    ],'Friends House · Euston','Russell Square 地铁站'),
  makeLondonCourse('store-museum-gp','商街书店与大英博',
    '沿 Tottenham Court Road 全速伏身破风，转入 Store Street 精品书街与 Keppel Street，掠过大英博物馆冲刺 Russell Square。',
    [
      londonSection('court',[-174,-118],[-162,110],[-173,-50,'Boots · 商业街北']),
      londonSection('court',[-162,110],[-145,391],[-153,237,'Heal’s 家具行']),
      londonSection('store',[-145,391],junction.gowerKeppel,[-52,402,'Store Street 精品街']),
      londonSection('keppel',junction.gowerKeppel,junction.maletKeppel,[40,416,'LSHTM · Keppel St']),
      londonSection('malet',junction.maletKeppel,junction.maletMontague,[71,434,'Senate House']),
      londonSection('montague',junction.maletMontague,junction.russellSW,[148,514,'大英博物馆 · Montague']),
      londonSection('russellSouth',junction.russellSW,junction.russellSE,[286,521,'Russell Square 南侧']),
      londonSection('russellEast',junction.russellSE,[339,396])
    ],'Tottenham Court Rd 北口','Russell Square 东侧'),
  makeLondonCourse('alleyway-slalom','学院穿堂速通赛',
    '从 Malet Place 工程院出发，连穿 SOAS 与 Brunei Gallery 窄道、Woburn 东廊与学生中心，经 Gower Place 冲入主庭院。',
    [
      londonSection('maletPlace',[49,92],junction.maletTorrington,[53,139,'Malet Place']),
      londonSection('byng',junction.maletTorrington,junction.byngTorrington,[90,190,'基督君王教堂']),
      londonSection('torringtonSq',junction.byngTorrington,[126,264],[126,231,'Torrington Square']),
      londonSection('soasWalk',[126,264],[126,331],[126,300,'SOAS 穿堂道']),
      londonSection('galleryWalk',[126,331],[199,331],[162,331,'Brunei Gallery']),
      londonSection('thornhaugh',[199,331],[185,255],[192,287,'IOE 西侧窄廊']),
      londonSection('woburnEast',[185,255],junction.gordonSE,[201,210,'Woburn 东侧巷道']),
      londonSection('gordonSouth',junction.gordonSE,junction.gordonSW,[162,153,'Gordon Square']),
      londonSection('gordon',junction.gordonSW,junction.gowerPlaceEast,[126,18,'UCL 学生中心']),
      londonSection('gowerPlace',junction.gowerPlaceEast,junction.gowerPlaceWest,[58,-85,'Gower Place']),
      londonSection('gower',junction.gowerPlaceWest,junction.quadGate),
      londonSection('quad',junction.quadGate,[40,0])
    ],'Malet Place 工程院','UCL · Main Quad')
];
const coursesByCampus={szu:courses,ucl:londonCourses};
const courseByCampus={szu:courses[0],ucl:londonCourses[0]};

for(const event of londonCourses) {
  event.corners=brakingCorners(event);
  event.benchmark=makeBenchmark(event);
  event.benchmark.corners=referenceCornerScores(event,event.benchmark);
  event.medalTimes=Object.fromEntries(['gold','silver','bronze'].map((name,index)=>
    [name,Math.round(event.benchmark.time*event.thresholds[index]/10)*10]));
}
