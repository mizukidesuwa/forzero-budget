const bicycleTrim={coal:'#242d2b',brown:'#925c38',orange:'#e28532'};
const bicycleBars={campus:[.43,1.052,.238],road:[.545,.945,.171],climb:[.510,.986,.171],gravel:[.529,.975,.220]};
let refreshBicycleModels=()=>{};

function makeBicycleBar(shape,toFork,look) {
  const handle=bicycleBars[look.category], trim=bicycleTrim[look.trim];
  for(const side of [-1,1]) {
    const part=(x,y,z)=>toFork([x,y,side*z]);
    const center=part(.438,1.033,0), top=part(.485,1.047,handle[2]*.73);
    shape.tube(center,top,.016,.017,'#90a69c',8);
    if(look.category==='campus') {
      shape.tube(top,part(...handle),.018,.020,trim,8);
      shape.tube(part(.455,1.034,.160),part(.495,1.014,.226),.009,.008,'#849386',7);
    } else {
      const hood=part(handle[0],1.032,handle[2]*.88), bottom=part(handle[0]-.068,handle[1]-.033,handle[2]*1.07);
      shape.tube(top,hood,.019,.020,trim,8);
      shape.tube(hood,part(...handle),.019,.016,trim,8);
      shape.tube(part(...handle),bottom,.016,.016,trim,8);
      shape.tube(hood,part(handle[0]+.024,handle[1]-.006,handle[2]*.90),.010,.008,'#849386',7);
    }
  }
}

function makeBicycleWheel(wheel,look,tyres) {
  const depth=look.rim==='deep'||look.rim==='auto'&&look.category==='road';
  const width=tyres==='traction'||look.category==='gravel'?.030:tyres==='race'?.013:.021;
  wheel.torus(.325,.022,'#242d2b',48,8,width/.022);
  if(look.sidewall==='tan') wheel.torus(.320,.016,'#b77c46',48,7,(width+.003)/.016);
  if(depth) {
    wheel.torus(.277,.030,'#282e30',48,7,.45);
    wheel.torus(.306,.007,'#747a75',48,6,1.55);
  } else {
    wheel.torus(.304,.008,'#9ba79c',48,6,1.2);
    wheel.torus(.297,.004,'#4c5c56',48,5,1.25);
  }
  wheel.tube([0,0,-.062],[0,0,.062],.035,.035,'#596b61',12);
  const radius=depth?.253:.297;
  for(let i=0;i<20;i++) {
    const angle=TAU*i/20, side=i%2===0?-.038:.038;
    wheel.tube([Math.cos(angle+.35)*.032,Math.sin(angle+.35)*.032,side],
      [Math.cos(angle)*radius,Math.sin(angle)*radius,0],.0026,.0028,'#b8bfb0',5,false);
  }
  if(width>=.030) for(let i=0;i<36;i++) {
    const angle=TAU*i/36;
    wheel.box([Math.cos(angle)*.343,Math.sin(angle)*.343,(i%2?.010:-.010)],[.010,.008,.020],'#333936',0,angle);
  }
}

function addBicycleAccessory(frame,steering,pivot,look,paint) {
  if(look.accessory==='bottle') {
    frame.tube([-.09,.530,0],[-.122,.667,.001],.033,.036,'#d5c995',10);
    frame.tube([-.123,.658,0],[-.125,.692,0],.027,.019,'#4a5e53',9);
  }
  if(look.accessory==='basket') frontBasket(steering,.66-pivot[0],.756-pivot[1],.38,.405,.207,'#384a41');
  if(look.accessory==='computer') {
    steering.box(subtract([.493,1.069,0],pivot),[.072,.030,.080],'#303939',0,-.12);
    steering.box(subtract([.493,1.086,0],pivot),[.050,.004,.056],'#8ea6a6',0,-.12);
  }
  if(paint==='shared'&&look.category==='campus') {
    mudguard(frame,REAR,.379,.08,'#d1a739');
    mudguard(steering,subtract(FRONT,pivot),.379,.08,'#d1a739');
    frame.box([-.531,.348,.052],[.293,.145,.049],'#d4a22b',0,-.045);
  }
}

function bicycleRigCache(gpu,capacity=8) {
  const rigs=new Map();
  return {
    prepare(appearance) {
      const {paint,look,tyres,frame}=appearance;
      const key=[paint,tyres,frame,...Object.values(look)].join('/');
      let rig=rigs.get(key);
      if(rig) rigs.delete(key);
      else {
        const shapes=makeRider(paint,look,tyres,frame,false);
        rig={frame:new gpu.Mesh(shapes.frame),fork:new gpu.Mesh(shapes.steering),wheel:new gpu.Mesh(shapes.wheels),
          pivot:shapes.pivot,grip:bicycleBars[look.category]};
      }
      rigs.set(key,rig);
      if(rigs.size>capacity) {
        const [old,build]=rigs.entries().next().value;
        for(const mesh of [build.frame,build.fork,build.wheel]) mesh.dispose();
        rigs.delete(old);
      }
      return rig;
    }
  };
}

function bicycleBodyTransform(pose) {
  const hip=[-.222,.99,0];
  return multiply(placement(add(hip,[pose.tuck*.086+pose.stand*.070,pose.bob+pose.stand*.125,0]),0,0,-.26*pose.tuck+.055*pose.stand),
    placement(scale(hip,-1)));
}

function bicycleRock(rider) {
  return (rider.stand??0)*Math.sin(rider.pedalPhase??0)*.045;
}
