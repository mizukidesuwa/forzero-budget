function ovalPoint(lot,angle,width,length,y) {
  const round=width*.5;
  const u=Math.cos(angle)*round;
  const v=Math.sin(angle)*round+Math.sign(Math.sin(angle))*(length-width)*.5;
  return lotPoint(lot,u,y,v);
}

function stadiumBand(mesh,lot,width,length,band,y,color) {
  const edge=(angle,inset)=>ovalPoint(lot,angle,width-inset*2,length-inset*2,y);
  // Include both straight sides so all the lanes share clean joins at the bends.
  const angles=Array.from({length:66},(_,i)=>(i<33?0:-Math.PI)+.00001+(Math.PI-.00002)*(i%33)/32);
  for(let i=0;i<angles.length;i++) {
    const a=angles[i], b=angles[(i+1)%angles.length];
    mesh.quad(edge(a,0),edge(b,0),edge(b,band),edge(a,band),color);
  }
}

function athleticsTrack() {
  const lot=athleticsField, w=lot.w-.64,d=lot.depth-.6;
  lotBox(lot,0,.013,0,lot.w,.033,lot.depth,'#aeb3a0',pavement);
  stadiumBand(pavement,lot,w,d,3.03,.036,'#b86248');
  stadiumBand(pavement,lot,w-6.06,d-6.06,(w-6.06)/2,.036,'#709353');
  for(let i=0;i<=4;i++) stadiumBand(masonry,lot,w-.12-i*1.40,d-.12-i*1.40,.034,.041,'#f0dcbd');
  const pitchW=w-10.5,pitchD=d-13.5;
  for(const s of [-1,1]) {
    lotBox(lot,s*pitchW/2,.042,0,.069,.015,pitchD,'#dbe1bc');
    lotBox(lot,0,.042,s*pitchD/2,pitchW,.015,.069,'#dbe1bc');
    lotBox(lot,0,.042,s*(pitchD/2-2.05),pitchW*.42,.015,.069,'#dbe1bc');
    for(let step=0;step<4;step++)
      lotBox(lot,s*(w/2+.69-step*.38),.26+step*.24,0,.39,.49+step*.48,d*.71,step%2?'#a8b5a8':'#d2d3bf',scenery);
    campusFixtures.push(lotPart(lot,s*(w/2+.04),0,1.64,d*.71,1.72));
  }
  lotBox(lot,0,.042,0,pitchW,.015,.062,'#dbe1bc');
  const name=namedSign('田径运动场','深圳大学','#727e6f','#e8e7d6');
  plate(name,lotPoint(lot,0,.78,d/2+.3),6.84,.75,lot.yaw);
}

function campusGroundDetails() {
  athleticsTrack();
  huiwenWalkways();
  const court=courts.find(({name})=>name==='天人广场');
  const lot=campusFootprint(...court.xy,court.w,court.d,.21);
  lotBox(lot,0,.012,0,lot.w,.040,lot.depth,'#ded2bf',pavement);
  for(let i=-3;i<=3;i++) lotBox(lot,i*2.13,.035,0,.034,.010,lot.depth-.42,'#c1b9a9',pavement);
  for(const s of [-1,1]) {
    lotBox(lot,s*4.85,.042,0,5.58,.036,3.31,'#80965e',pavement);
    lotBox(lot,s*4.86,.332,0,2.28,.60,.47,'#a29b87',scenery);
    campusFixtures.push(lotPart(lot,s*4.86,0,2.28,.47,.63));
  }
}

function landmarkClearance(x,z) {
  return !closeToBlock(x,z,athleticsField,1.9) && !campusFixtures.some(f=>closeToBlock(x,z,f,1.15)) &&
    !treeSetbacks.some(lot=>closeToBlock(x,z,lot)) &&
    !campusGates.some(g=>Math.hypot(x-g.xy[0],z-g.xy[1])<9.7);
}
