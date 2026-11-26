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

function deckRiseAt([x,,z]) {
  const height=flyoverAt(x,z);
  return height===null?0:height-CITY_ASPHALT;
}

function courseGround(event,p,rise=event.flyover?deckRiseAt(p):0) {
  const [x,y,z]=onCampusGround(p);
  return [x,y+rise,z];
}

function raiseDeckPaint(shape) {
  const {vertices}=shape;
  for(let i=0;i<vertices.length;i+=11) {
    vertices[i+1]+=deckRiseAt([vertices[i],0,vertices[i+2]]);
  }
}
