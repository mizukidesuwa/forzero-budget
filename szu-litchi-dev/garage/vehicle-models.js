function mudguard(mesh,hub,radius,width,color,start=.36,end=Math.PI-.24) {
  const p=(a,s)=>[hub[0]+radius*Math.cos(a),hub[1]+radius*Math.sin(a),hub[2]+s*width*.50];
  for(let i=0;i<14;i++) {
    const a=mix(start,end,i/14),b=mix(start,end,(i+1)/14);
    mesh.quad(p(a,-1),p(b,-1),p(b,1),p(a,1),color,[Math.cos((a+b)/2),Math.sin((a+b)/2),0]);
  }
}

function frontBasket(mesh,x,y,d,w,h,color) {
  const bottom=(i,j)=>[x+i*d*.44,y,j*w*.42], top=(i,j)=>[x+i*d*.53,y+h,j*w*.5];
  mesh.box([x,y-.009,0],[d*.90,.024,w*.86],color);
  for(const side of [-1,1]) {
    for(const end of [-1,1]) mesh.tube(bottom(side,end),top(side,end),.008,.010,color,6);
    mesh.tube(top(side,-1),top(side,1),.010,.010,color,6);
    mesh.tube(top(-1,side),top(1,side),.010,.010,color,6);
    for(const i of [-.68,-.34,0,.34,.68]) {
      mesh.tube(bottom(i,side),top(i,side),.004,.004,color,4,false);
      mesh.tube(bottom(side,i),top(side,i),.004,.004,color,4,false);
    }
  }
}

function poweredWheel(radius,width,rim,tread=false,castor=false) {
  const mesh=new Shape(), tyre=castor?.019:tread?.045:.035;
  mesh.torus(radius-tyre,tyre,'#303433',32,8,width/(tyre*2));
  mesh.torus(radius-2*tyre-.007,.010,rim,30,5,1.5);
  mesh.tube([0,0,-width*.52],[0,0,width*.52],radius*.25,radius*.25,'#626b68',14);
  for(let i=0;i<8;i++) {
    const a=i*TAU/8, p=[Math.cos(a),Math.sin(a),0];
    mesh.tube(scale(p,radius*.22),scale(p,radius-tyre*2),.008,.012,rim,5,false);
  }
  if(tread) for(let i=0;i<22;i++) {
    const a=TAU*i/22;
    mesh.box([Math.cos(a)*(radius-.006),Math.sin(a)*(radius-.006),0],[.014,.037,width*.89],
      i%2?'#393a36':'#464541',0,a);
  }
  return mesh;
}

function seatedBody(pose) {
  const mesh=new Shape(), {hip,shoulder,head,foot,hand,feetWidth,seatWidth,armsWidth,helmet}=pose;
  mesh.ellipsoid(hip,[.135,.094,seatWidth],shorts,12,7);
  mesh.tube(add(hip,[0,.045,0]),shoulder,.142,.177,shirt,12);
  mesh.ellipsoid(shoulder,[.128,.105,seatWidth+.025],shirt,13,8);
  mesh.tube(shoulder,head,.054,.052,skin,9);
  mesh.ellipsoid(head,[.103,.13,.094],skin,15,9);
  mesh.ellipsoid(add(head,[.05,-.035,0]),[.075,.070,.082],skin,12,7);
  mesh.ellipsoid(add(head,[.006,.064,0]),[.111,.077,.102],hair,12,8);
  mesh.ellipsoid(add(head,[.025,.088,0]),[.145,.077,.113],helmet,16,8);
  mesh.ellipsoid(add(head,[.139,.049,0]),[.061,.016,.096],helmet,12,6);
  for(const side of [-1,1]) {
    const arm=add(shoulder,[0,0,side*armsWidth]);
    const palm=[hand[0],hand[1],side*hand[2]];
    const elbow=[mix(arm[0],palm[0],.48)-.035,mix(arm[1],palm[1],.61)-.065,side*(hand[2]+.029)];
    mesh.tube(arm,lerpPoint(arm,elbow,.63),.066,.052,sleeve,9);
    mesh.tube(lerpPoint(arm,elbow,.60),elbow,.045,.039,skin,8);
    mesh.tube(elbow,palm,.040,.026,skin,8);
    mesh.ellipsoid(palm,[.045,.032,.034],skin,10,6);
    mesh.ellipsoid(add(head,[.114,.022,side*.056]),[.008,.009,.007],hair,7,5);
    const upper=add(hip,[0,0,side*(seatWidth*.60)]), ankle=add(foot,[0,.041,side*feetWidth]);
    const knee=[mix(upper[0],ankle[0],.74)+.16,lerpPoint(upper,ankle,.42)[1]+.12,side*(feetWidth+.004)];
    mesh.tube(upper,knee,.082,.055,shorts,10);
    mesh.tube(knee,ankle,.049,.033,skin,9);
    mesh.ellipsoid(add(ankle,[.031,-.022,0]),[.104,.048,.052],'#d9dacb',12,6);
  }
  return mesh;
}

function makeEbike() {
  const frame=new Shape(), steering=new Shape(), rubber='#303936', trim='#93aa9f', shell='#dce4cc';
  const rear=[-.63,.286,0],front=[.69,.286,0],pivot=[.46,.61,0],fork=p=>subtract(p,pivot);
  frame.tube(rear,[-.24,.55,0],.051,.057,'#6d897c',10);
  frame.tube([-.23,.53,0],[.22,.34,0],.064,.059,'#547d6d',10);
  frame.tube([.22,.34,0],[.46,.63,0],.063,.049,'#668b78',10);
  frame.tube([-.245,.50,0],[-.23,.78,0],.027,.027,trim,9);
  frame.ellipsoid([-.24,.805,0],[.205,.041,.122],rubber,15,7);
  frame.box([-.39,.49,0],[.21,.289,.161],'#354e47',0,-.32);
  frame.box([-.365,.53,0],[.052,.193,.167],'#425d51',0,-.32);
  frame.box([.091,.355,0],[.341,.063,.20],'#526458');
  frame.box([-.71,.625,0],[.43,.039,.21],'#7d9590');
  frame.box([-.923,.622,0],[.052,.044,.124],'#b45740');
  mudguard(frame,rear,.315,.085,shell);
  mudguard(steering,fork(front),.319,.096,shell);
  steering.tube(fork([.47,.56,0]),fork([.44,1.012,0]),.029,.022,trim,10);
  for(const s of [-1,1]) {
    steering.tube(fork([.455,.61,s*.051]),fork([.69,.29,s*.065]),.024,.024,trim,9);
    steering.tube(fork([.44,1.01,0]),fork([.398,1.027,s*.266]),.018,.018,rubber,9);
  }
  frontBasket(steering,.687-pivot[0],.691-pivot[1],.325,.364,.183,'#52665b');
  steering.box(fork([.817,.635,0]),[.079,.081,.127],'#e9e7cb');
  return {frame,steering,pivot,body:seatedBody({
    hip:[-.24,.871,0],shoulder:[-.182,1.19,0],head:[-.095,1.401,0],foot:[.089,.405,0],
    hand:[.398,1.038,.25],feetWidth:.125,seatWidth:.166,armsWidth:.142,helmet:'#e6e2c5'
  }),wheels:poweredWheel(.286,.060,'#aab6a9'),mounts:[{center:rear,radius:.286},{center:front,radius:.286,steer:true}],
    tagHeight:1.76};
}

function makeWheelchair() {
  const frame=new Shape(), frameColor='#677f87', fabric='#343c45', pad='#536673';
  const rear=[-.15,.263,0], chairs=[];
  for(const side of [-1,1]) {
    const p=(x,y,z)=>[x,y,z*side];
    frame.tube(p(-.40,.24,.21),p(.46,.20,.20),.026,.024,frameColor,8);
    frame.tube(p(-.34,.44,.26),p(-.43,.95,.26),.023,.021,frameColor,8);
    frame.tube(p(-.30,.31,.235),p(-.14,.702,.244),.023,.024,frameColor,8);
    frame.tube(p(.183,.68,.248),p(.183,.38,.248),.020,.023,frameColor,8);
    frame.box(p(-.029,.70,.275),[.411,.05,.10],pad);
    frame.tube(p(.421,.26,.213),p(.447,.099,.232),.016,.017,frameColor,7);
    frame.tube(p(-.405,.235,.22),p(-.56,.108,.24),.015,.014,frameColor,7);
    mudguard(frame,p(rear[0],rear[1],.325),.280,.096,frameColor,.36,2.81);
    chairs.push({center:p(rear[0],rear[1],.325),radius:.263},{center:p(.449,.099,.232),radius:.099,caster:true});
  }
  frame.box([-.131,.31,0],[.487,.20,.389],'#435a59');
  frame.box([-.107,.482,0],[.495,.103,.465],fabric);
  frame.box([-.340,.715,0],[.104,.438,.455],fabric,0,.12);
  frame.box([-.393,.748,0],[.037,.375,.435],pad,0,.12);
  frame.box([.415,.137,0],[.286,.042,.388],'#78868a');
  frame.box([.217,.728,.269],[.135,.054,.099],'#303a3d');
  frame.tube([.201,.747,.269],[.212,.817,.269],.012,.021,'#57676a',8);
  frame.ellipsoid([.213,.822,.269],[.024,.020,.023],'#2f3b3d',10,6);
  return {frame,body:seatedBody({
    hip:[-.201,.571,0],shoulder:[-.205,.925,0],head:[-.155,1.12,0],foot:[.42,.163,0],
    hand:[.214,.786,.269],feetWidth:.109,seatWidth:.160,armsWidth:.141,helmet:'#e6e2c5'
  }),wheels:poweredWheel(.263,.075,'#8b9d9d'),casters:poweredWheel(.099,.049,'#80908e',false,true),
    mounts:chairs,tagHeight:1.50};
}

function makeTrailBike() {
  const frame=new Shape(), steering=new Shape(), red='#cf623a', light='#e8e1cd', steel='#808d8b';
  const rear=[-.68,.317,0],front=[.751,.317,0],pivot=[.48,.67,0],fork=p=>subtract(p,pivot);
  frame.tube(rear,[-.07,.453,0],.047,.042,steel,10);
  frame.tube([-.07,.453,0],[.499,.690,0],.054,.047,steel,10);
  frame.tube(rear,[-.36,.691,0],.030,.035,red,9);
  frame.ellipsoid([.131,.698,0],[.334,.113,.138],red,15,8,-.12);
  frame.ellipsoid([-.340,.772,0],[.289,.048,.106],'#37433c',14,7);
  frame.box([-.056,.453,0],[.243,.225,.210],'#53635e');
  for(let i=0;i<4;i++) frame.box([-.065,.439+i*.027,0],[.245,.010,.242],steel);
  frame.tube([.107,.483,.082],[-.651,.618,.131],.023,.034,'#7a8883',10);
  frame.tube([-.588,.617,.131],[-.833,.624,.131],.047,.050,'#5b6861',11);
  frame.tube([-.183,.391,-.177],[-.183,.391,.177],.021,.021,'#465550',8);
  frame.box([-.500,.662,0],[.186,.126,.189],light);
  mudguard(frame,add(rear,[0,.086,0]),.314,.128,red,.31,2.9);
  mudguard(steering,fork(add(front,[0,.109,0])),.321,.125,red,.19,2.93);
  steering.box(fork([.539,.856,0]),[.053,.195,.179],light,0,-.12);
  steering.box(fork([.571,.822,0]),[.032,.061,.093],'#e5ca84',0,-.10);
  for(const s of [-1,1]) {
    steering.tube(fork([.501,.686,s*.084]),fork([.650,.453,s*.087]),.035,.029,steel,10);
    steering.tube(fork([.650,.453,s*.087]),fork([.751,.317,s*.090]),.023,.022,'#9fa9a2',9);
    steering.tube(fork([.465,1.008,0]),fork([.429,1.041,s*.292]),.023,.025,'#39453f',9);
    steering.box(fork([.488,1.044,s*.252]),[.127,.040,.147],red,0,-.11);
  }
  steering.tube(fork([.478,.698,0]),fork([.46,1.016,0]),.027,.027,steel,9);
  return {frame,steering,pivot,body:seatedBody({
    hip:[-.27,.843,0],shoulder:[-.123,1.166,0],head:[.003,1.376,0],foot:[-.17,.43,0],
    hand:[.429,1.052,.277],feetWidth:.158,seatWidth:.168,armsWidth:.146,helmet:'#dadecb'
  }),wheels:poweredWheel(.317,.092,'#b2b9ad',true),mounts:[{center:rear,radius:.317},{center:front,radius:.317,steer:true}],
    tagHeight:1.76};
}

function uploadPoweredRig(gpu,kind) {
  const model=kind==='ebike'?makeEbike():kind==='chair'?makeWheelchair():makeTrailBike();
  return {...model,frame:new gpu.Mesh(model.frame),body:new gpu.Mesh(model.body),wheels:new gpu.Mesh(model.wheels),
    casters:model.casters?new gpu.Mesh(model.casters):null,steering:model.steering?new gpu.Mesh(model.steering):null};
}

function poweredPose(rig,root,rider) {
  const items=[[rig.frame,root],[rig.body,root]];
  const angle=-.25*rider.steering;
  const turn=rig.steering?placement(rig.pivot,0,angle,0):null;
  const steer=turn?multiply(turn,placement(scale(rig.pivot,-1))):null;
  if(turn) items.push([rig.steering,multiply(root,turn)]);
  for(const {center,radius,steer:swivels,caster} of rig.mounts) {
    const centerPoint=swivels?transform(steer,center):center;
    const yaw=swivels||caster?angle:0;
    items.push([caster?rig.casters:rig.wheels,multiply(root,placement(centerPoint,0,yaw,-rider.travel/radius))]);
  }
  return items;
}
