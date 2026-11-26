// Yuehai aerial references: https://www.thepaper.cn/newsDetail_forward_18845502
// Each building stays inside its mapped lot. Window faces share the static masonry mesh.
function glazedQuad(a,b,c,d,normal,low,high) {
  const first=masonry.vertex(a,normal,rgb(low));
  masonry.vertex(b,normal,rgb(low));masonry.vertex(c,normal,rgb(high));masonry.vertex(d,normal,rgb(high));
  masonry.indices.push(first,first+1,first+2,first,first+2,first+3);
}

function huiyuanPlan(w,d) {
  // The curved northwest elevation faces the sundial. The rear elevations meet at a right angle.
  const x=w*.18,z=d*.15,rx=x+w/2,rz=z+d/2;
  const points=[[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
  for(let i=0;i<=14;i++) {
    const a=Math.PI+i*Math.PI/28;
    points.push([x+rx*Math.cos(a),z+rz*Math.sin(a)]);
  }
  return points;
}

function insidePlan(u,v,points,padding) {
  return points.every(([x,z],i)=>{
    const [x2,z2]=points[(i+1)%points.length];
    return (x2-x)*(v-z)-(z2-z)*(u-x)>=-padding*Math.hypot(x2-x,z2-z);
  });
}

function huiyuanBuilding(block) {
  const white='#ebe9df', stone='#cdcfc8', sill='#b5bcb5';
  for(let level=0;level<5;level++) {
    const y=level*2.06, retreat=[0,.18,.54,1.64,3.16][level];
    const plan=huiyuanPlan(block.w-2*retreat,block.depth-1.62*retreat);
    const at=(p,h,factor=1)=>lotPoint(block,p[0]*factor+retreat*.67,h,p[1]*factor+retreat*.47);
    const center=at([0,0],y+2.06);
    for(let i=0;i<plan.length;i++) {
      const a=plan[i],b=plan[(i+1)%plan.length];
      const n=normalize([b[1]-a[1],0,a[0]-b[0]]);
      const band=(bottom,top,factor,color)=>masonry.quad(at(a,bottom,factor),at(b,bottom,factor),
        at(b,top,factor),at(a,top,factor),color,n);
      band(y,y+.43,1,white);
      glazedQuad(at(a,y+.43,.988),at(b,y+.43,.988),at(b,y+1.71,.988),at(a,y+1.71,.988),
        n,level%2?'#475f62':'#52686c','#86999c');
      band(y+1.71,y+2.06,1,white);
      masonry.quad(at(a,y+1.71,1),at(b,y+1.71,1),at(b,y+1.71,.988),at(a,y+1.71,.988),sill,[0,-1,0]);
      masonry.quad(at(a,y+.43,1),at(b,y+.43,1),at(b,y+.43,.988),at(a,y+.43,.988),stone);
      masonry.triangle(center,at(b,y+2.06),at(a,y+2.06),stone);
      const span=Math.hypot(b[0]-a[0],b[1]-a[1]),bays=Math.max(1,Math.round(span/1.9));
      for(let j=0;j<bays;j++) {
        const p=t=>[mix(a[0],b[0],t),mix(a[1],b[1],t)];
        const from=p(j/bays),to=p(j/bays+.115/span);
        masonry.quad(at(from,y+.42,.997),at(to,y+.42,.997),at(to,y+1.72,.997),at(from,y+1.72,.997),'#c6ccc7',n);
      }
    }
  }
  lotBox(block,3.5,10.48,2.1,8.10,.36,3.88,'#d6d7cd');
  const entry=facadeOf(block,1);
  facadeName(entry,'汇元楼','',1.89,3.4,.53,white,'#574a3d');
}

function huiwenBuilding(block) {
  const {w,depth,floors,wing}=block;
  const brick=wing%2?'#a7503d':'#aa5945', ivory='#efebe0', glass='#465d60';
  const pitch=2.36, h=floors*pitch+.68;
  const body=lotPart(block,0,0,w-1.5,depth-1.0,h);
  lotBox(body,0,h/2,0,body.w,h,body.depth,brick);
  for(const side of [0,2]) {
    const face=facadeOf(body,side), cols=Math.max(4,Math.round(w/2.35));
    for(let floor=0;floor<floors;floor++) {
      const y=1.53+floor*pitch;
      face.panel(0,y,face.width-.34,1.52,glass);
      for(let col=1;col<cols;col++) face.panel(face.width*(col/cols-.5),y,.12,1.54,'#d1d4cb',.04);
      const v=(side===0?1:-1)*(depth/2-.19);
      lotBox(block,0,y-.92,v,w-.08,.27,.83,ivory);
      lotBox(block,0,y-.61,v,w-.14,.45,.16,brick);
    }
    for(let col=0;col<=cols;col++) {
      const x=(col/cols-.5)*(w-.42);
      lotBox(block,x,h*.50,(side===0?1:-1)*(depth/2-.20),.18,h,.39,ivory);
    }
  }
  // Tall brick bookends, white vertical reveals and a narrow glazed stair slot.
  for(const side of [1,3]) {
    const dir=side===1?1:-1;
    lotBox(block,dir*(w/2-.29),h*.51,0,.58,h*1.02,depth,brick);
    const end=facadeOf(block,side);
    end.panel(0,h*.51,depth*.29,h*.98,ivory);
    end.panel(0,h*.52,depth*.19,h*.88,'#43595c',.044);
    for(let floor=1;floor<floors;floor++) end.panel(0,floor*pitch+.15,depth*.2,.09,'#98a8a4',.064);
  }
  lotBox(block,0,h+.08,0,w+.22,.22,depth+.18,ivory);
  lotBox(block,0,h+.22,0,w-.48,.12,depth-.56,'#a7a9a1');
  lotBox(block,(wing%2?1:-1)*w*.27,h+.79,-depth*.17,2.68,1.05,2.95,'#dcdcd1');
  facadeName(facadeOf(block),`汇文楼 H${wing}`,'',2.23,3.2,.56,ivory,'#724636');
}

function huiziBuilding(block) {
  const {w,depth,floors,wing}=block;
  const brick='#ab654e', white='#ece9dc', pitch=2.19, h=.36+floors*pitch;
  const inner=lotPart(block,0,0,w-1.66,depth-1.40,h);
  lotBox(inner,0,h/2,0,inner.w,h,inner.depth,'#7b5043');
  for(let side=0;side<4;side++) {
    const face=facadeOf(inner,side), width=face.width;
    for(let i=0;i<floors;i++) {
      face.panel(0,1.34+i*pitch,width-.2,1.37,'#535e5b');
      face.panel(0,.88+i*pitch,width-.18,.18,'#8b6252',.04);
    }
    const streetFace=facadeOf(block,side,.09);
    const bays=Math.max(3,Math.round(streetFace.width/2.46));
    for(let j=0;j<=bays;j++) {
      const point=streetFace.point((j/bays-.5)*(streetFace.width-.36),h/2);
      masonry.box(point,[.29,h,.33],brick,streetFace.yaw);
    }
  }
  for(let i=0;i<=floors;i++) {
    const y=.26+i*pitch;
    lotBox(block,0,y,0,w+.19,.25,depth+.19,white);
    if(i===floors) break;
    for(const side of [0,1,2,3]) {
      const face=facadeOf(block,side);
      face.panel(0,y+.41,face.width-.23,.55,brick);
      face.panel(0,y+.72,face.width-.24,.09,white,.043);
    }
  }
  const lantern=lotPart(block,-w*.17,-depth*.08,w*.47,depth*.49,1.58);
  lotBox(lantern,0,h+.74,0,lantern.w,1.48,lantern.depth,brick);
  for(let side=0;side<4;side++) glazing(facadeOf(lantern,side),h+.94,4,'#445958',.64);
  lotBox(lantern,0,h+1.62,0,lantern.w+.56,.26,lantern.depth+.65,white);
  facadeName(facadeOf(block),`汇紫楼 ${wing} 座`,'',2.53,w*.46,.60,white);
}

function huixingBuilding(block) {
  const {w,depth}=block, silver='#bac5c7', sill='#d8dfe0', blue='#526e80';
  const podium=lotPart(block,0,0,w,depth,5.6);
  lotBox(podium,0,2.8,0,w,5.6,depth,silver);
  for(let side=0;side<4;side++) for(let floor=0;floor<4;floor++)
    glazing(facadeOf(podium,side),.88+floor*1.28,Math.ceil((side%2?depth:w)/2.0),blue,.80);
  lotBox(block,0,5.67,0,w+.3,.24,depth+.32,sill);
  const tower=lotPart(block,1.3,-.46,w*.69,depth*.80,23.05);
  const lo=13.3, hi=19.75, base=5.77, top=tower.height;
  const gapW=tower.w*.51,gapD=tower.depth*.43;
  lotBox(tower,0,(lo+base)/2,0,tower.w,lo-base,tower.depth,silver);
  lotBox(tower,0,(top+hi)/2,0,tower.w,top-hi,tower.depth,silver);
  const pierW=(tower.w-gapW)/2,pierD=(tower.depth-gapD)/2;
  for(const a of [-1,1]) for(const b of [-1,1])
    lotBox(tower,a*(gapW+pierW)/2,(lo+hi)/2,b*(gapD+pierD)/2,pierW,hi-lo,pierD,silver);
  for(let side=0;side<4;side++) {
    const face=facadeOf(tower,side), count=side%2?8:11, bay=face.width/count;
    const gap=side%2?gapD:gapW;
    for(let floor=0;floor<10;floor++) {
      const y=6.69+floor*1.65;
      for(let col=0;col<count;col++) {
        const u=(col+.5-count/2)*bay;
        if(y+.58>lo && y-.58<hi && Math.abs(u)-bay*.31<gap/2) continue;
        face.panel(u,y,bay*.68,1.11,(col+floor)%4===0?'#76909c':blue);
      }
    }
  }
  lotBox(tower,0,top+.08,0,tower.w+.18,.21,tower.depth+.20,sill);
  lotBox(tower,-tower.w*.22,top+.42,-tower.depth*.15,5.2,.57,3.00,'#aab6bc');
  for(let i=0;i<4;i++) lotBox(block,0,.085*(i+1),10.64-i*.44,11.4,.17*(i+1),.45,'#b7bfba');
  lotBox(block,0,.011,12.6,12.5,.039,3.07,'#c1c1af',pavement);
  facadeName(facadeOf(block),'汇星楼','科技楼',3.22,5.20,.78,silver);
}

function huidianBuilding(block) {
  const {w,depth}=block, white='#e9e5d9', stone='#d3cdbd', glass='#567379';
  const levels=[
    {width:w,deep:depth,bottom:0,top:7.5},
    {width:w-2.2,deep:depth-1.6,bottom:7.5,top:11.63},
    {width:w-4.8,deep:depth-3.65,bottom:11.63,top:14.20}
  ];
  // Four wings enclose a common lightwell through all three roof terraces.
  const courtW=5.3,courtD=3.35;
  for(const level of levels) {
    const {width,deep,bottom,top}=level,h=top-bottom,y=(top+bottom)/2;
    const sideW=(width-courtW)/2,endD=(deep-courtD)/2;
    for(const sign of [-1,1]) {
      lotBox(block,sign*(courtW+sideW)/2,y,0,sideW,h,deep,stone);
      lotBox(block,0,y,sign*(courtD+endD)/2,courtW,h,endD,stone);
      lotBox(block,sign*(width/2-.10),top+.10,0,.20,.28,deep,white);
      lotBox(block,0,top+.10,sign*(deep/2-.10),width,.28,.20,white);
    }
    const shell=lotPart(block,0,0,width,deep,top);
    for(let side=0;side<4;side++) {
      const face=facadeOf(shell,side), cols=Math.max(3,Math.floor((face.width-.7)/2.35));
      const bay=(face.width-.9)/cols;
      const rows=bottom===0?[1.26,3.75,6.02]:bottom===7.5?[8.55,10.49]:[12.80];
      for(const row of rows) for(let i=0;i<cols;i++) {
        const u=(i+.5-cols/2)*bay;
        if(side===0 && Math.abs(u)<width*.24 && bottom<11) continue;
        const hw=bay*.34,hh=.56;
        const a=face.point(u-hw,row-hh,.035),b=face.point(u+hw,row-hh,.035);
        const c=face.point(u+hw,row+hh,.035),d=face.point(u-hw,row+hh,.035);
        const outer=(x,y)=>face.point(u+x,row+y,.19);
        glazedQuad(a,b,c,d,face.normal,glass,'#899c9c');
        masonry.quad(outer(-hw-.09,hh+.11),outer(hw+.09,hh+.11),c,d,'#b4b4a9',[0,-1,0]);
        masonry.quad(outer(-hw-.09,-hh-.12),outer(hw+.09,-hh-.12),b,a,white);
        masonry.quad(outer(-hw-.09,-hh-.12),a,d,outer(-hw-.09,hh+.11),stone,face.normal);
        masonry.quad(b,outer(hw+.09,-hh-.12),outer(hw+.09,hh+.11),c,white,face.normal);
      }
      if(side===0 && bottom<11) {
        const upper=top-.39,lower=bottom===0?2.06:bottom;
        face.panel(0,(upper+lower)/2,width*.43,upper-lower,'#5b8288');
        for(let j=-3;j<=3;j++) face.panel(j*width*.055,(upper+lower)/2,.067,upper-lower,'#bdc7be',.041);
        for(let y=lower+1.58;y<upper;y+=1.70) face.panel(0,y,width*.43,.10,white,.044);
      }
    }
  }
  lotBox(block,0,.26,0,courtW,.52,courtD,'#a4aba0');
  const front=depth/2;
  lotBox(block,0,1.98,8.27,17.95,.37,1.71,white);
  for(const u of [-7.3,-3.65,0,3.65,7.3]) lotBox(block,u,.91,8.41,.52,1.82,.58,stone);
  for(const dir of [-1,1]) for(let n=0;n<10;n++) {
    const h=(n+1)*.215;
    lotBox(block,dir*9.20,h/2,front+2.17-n*.255,2.64,h,.27,n%2?stone:white);
  }
  for(const dir of [-1,1]) {
    const x=dir*10.39;
    masonry.tube(lotPoint(block,x,.64,front+2.27),lotPoint(block,x,2.82,front-.24),.045,.045,'#9baba6',6);
    for(let i=0;i<4;i++) lotBox(block,x,.37+i*.67,front+2.19-i*.78,.065,.72,.065,'#889a95');
  }
  facadeName(facadeOf(block),'深圳大学图书馆','',2.50,8.8,.70,white,'#624334');
}
