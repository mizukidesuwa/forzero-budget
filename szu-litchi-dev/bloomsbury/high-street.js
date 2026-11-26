// Fictional businesses on the commercial frontages. Upper floors are separate terraces.
const shopRuns=[
  {street:'Tottenham Court Road',edge:-168.1,side:1,start:-79,end:-64,shops:[
    ['S&M Foodhall','food'],['Warren Coffee','coffee']
  ]},
  {street:'Tottenham Court Road',edge:-168.1,side:1,start:-51,end:43,shops:[
    ['Rowan Pharmacy','health'],['Double Shot','coffee'],['Wren Kitchen','meal'],
    ['Grafton Books','book'],['Elm Bakery','coffee'],['Corner Pantry','food'],
    ['The Warren Arms','pub'],['London Press','book'],['Copper Spoon','meal'],
    ['North & Field','food'],['Pocket Noodles','meal'],['The Print Shop','book']
  ]},
  {street:'Tottenham Court Road',edge:-168.1,side:1,start:59,end:111,shops:[
    ['Rye & Butter','coffee'],['Staple House','food'],['Goodge Cycles','cycle'],['Faraday Records','book'],
    ['Bramble Flowers','flower'],['Woven & Co.','book'],['Tea Yard','coffee']
  ]},
  {street:'Tottenham Court Road',edge:-168.1,side:1,start:126,end:147,shops:[
    ['The Goodge Tap','pub'],['Little Bento','meal'],['Fitzroy Pantry','food']
  ]},
  {street:'Tottenham Court Road',edge:-168.1,side:1,start:163,end:181,shops:[
    ['Goodge Bakery','coffee'],['Northside Deli','meal']
  ]},
  {street:'Tottenham Court Road',edge:-149.9,side:3,start:32,end:45,shops:[
    ['lesgo','market'],['The Olive Counter','meal']
  ]},
  {street:'Tottenham Court Road',edge:-149.9,side:3,start:58,end:79,shops:[
    ['Blue Kettle','coffee'],['Capper News','book'],['Cedar Deli','meal']
  ]},
  {street:'Tottenham Court Road',edge:-149.9,side:3,start:96,end:111,shops:[
    ['Borough Kitchen','meal'],['Bloomsbury Market','food']
  ]},
  {street:'Tottenham Court Road',edge:-149.9,side:3,start:126,end:147,shops:[
    ['Mallow Café','coffee'],['The Spoke','cycle'],['Chenies Books','book']
  ]},
  {street:'Grafton Way',edge:-52.5,side:2,start:-223,end:-197,shops:[
    ['West End Provisions','food'],['Grafton Grocer','market'],['Vine Café','coffee']
  ]},
  {street:'Warren Street',edge:-79.5,side:2,start:-224,end:-198,shops:[
    ['Morning Fold','coffee'],['Warren Florist','flower'],['Warren Corner','book']
  ]},
  {street:'University Street',edge:18.5,side:0,start:-149,end:-126,shops:[
    ['Quad Coffee','coffee'],['Uni Stationery','book'],['Huntley Lunch','meal']
  ]},
  {street:'Torrington Place',edge:94.6,side:2,start:-135.5,end:-122,shops:[
    ['Torrington Books','book'],['Torrington Cycles','cycle']
  ]},
  {street:'Goodge Street',edge:162.4,side:2,start:-222,end:-169,shops:[
    ['Goodge Corner','food'],['Fitzrovia Books','book'],['Linden Café','coffee'],
    ['Cocoa & Rye','coffee'],['North Street Kitchen','meal'],['Little Green Stop','flower']
  ]}
];
const shopStyles={
  food:{frame:'#294a40',trim:'#c5aa76',glass:'#536562',display:['#b27c53','#d0ba74','#9b915d']},
  market:{frame:'#324536',trim:'#d5e2ac',glass:'#576b62',display:['#c39d70','#b6bd86','#d4bd7e']},
  coffee:{frame:'#4d332c',trim:'#e6d5ad',glass:'#6c655b',display:['#a37450','#c7ac84','#e0cbaa']},
  meal:{frame:'#713b2e',trim:'#e1bf86',glass:'#646358',display:['#bb7650','#9f724d','#d6b477']},
  pub:{frame:'#493643',trim:'#dcbd80',glass:'#5d5f5c',display:['#a37854','#caac68','#a17e4d']},
  book:{frame:'#394750',trim:'#d3c4a6',glass:'#656765',display:['#a9846c','#b5a983','#8b9d93']},
  health:{frame:'#314950',trim:'#d5e5c9',glass:'#728581',display:['#bbc7ab','#a7b7b2','#c2bca8']},
  cycle:{frame:'#443d35',trim:'#d2be8c',glass:'#626965',display:['#8e9b91','#c0b086','#975e46']},
  flower:{frame:'#5b4052',trim:'#dccfae',glass:'#657162',display:['#ad7488','#c3a66b','#80a17a']}
};

const londonShops=shopRuns.flatMap(run=>{
  const {start,end,side,edge,shops,street}=run;
  const bay=(end-start)/shops.length, depth=side%2?12.2:11;
  return shops.map(([name,kind],i)=>{
    const offset=start+(i+.5)*bay, inward=side===1||side===0?-1:1;
    const [x,z]=side%2?[edge+inward*depth/2,offset]:[offset,edge+inward*depth/2];
    const height=10.8+(i%3)*.68;
    const width=side%2?depth:bay-.14, length=side%2?bay-.14:depth;
    return {...campusFootprint(x,z,width,length,0,height),name,use:street,kind,side,style:'shop',row:i};
  });
});
const uclBuildings=[...uclLots,...londonShops];

function shopSign(name,background,ink) {
  return signCanvas(384,84,(ctx,w,h)=>{
    ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
    ctx.fillStyle=ink;ctx.fillRect(7,6,w-14,1.5);ctx.fillRect(7,h-7,w-14,1.5);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=name==='lesgo'?'700 58px Georgia,serif':'600 47px Georgia,serif';
    ctx.fillText(name,w/2,h/2+2,w-24);
  });
}

function placeShopSigns(labels) {
  const columns=8, cellWidth=256, cellHeight=56, bleed=1;
  const totalWidth=columns*cellWidth,totalHeight=Math.ceil(labels.length/columns)*cellHeight;
  const image=signCanvas(totalWidth,totalHeight,ctx=>{
    for(const [i,{name,background,ink}] of labels.entries()) {
      const x=i%columns*cellWidth,y=Math.floor(i/columns)*cellHeight;
      ctx.fillStyle=background;ctx.fillRect(x,y,cellWidth,cellHeight);
      ctx.fillStyle=ink;ctx.fillRect(x+6,y+4,cellWidth-12,1);ctx.fillRect(x+6,y+cellHeight-5,cellWidth-12,1);
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font=name==='lesgo'?'700 38px Georgia,serif':'600 29px Georgia,serif';
      ctx.fillText(name,x+cellWidth/2,y+cellHeight/2+1,cellWidth-15);
    }
  });
  const shape=new Shape(), white=rgb('#ffffff');
  for(const [i,{face,width}] of labels.entries()) {
    const x=i%columns*cellWidth,y=Math.floor(i/columns)*cellHeight;
    const u=(x+bleed)/totalWidth,u2=(x+cellWidth-bleed)/totalWidth;
    const v=1-(y+cellHeight-bleed)/totalHeight,v2=1-(y+bleed)/totalHeight;
    const p=(sign,dy)=>face.point(sign*width/2,3.54+dy,.368);
    const start=shape.vertex(p(-1,-.29),face.normal,white,u,v);
    shape.vertex(p(1,-.29),face.normal,white,u2,v);
    shape.vertex(p(1,.29),face.normal,white,u2,v2);
    shape.vertex(p(-1,.29),face.normal,white,u,v2);
    shape.indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  signs.push({shape,canvas:image});
}

function shopFront(lot,shopLabels) {
  const face=facadeOf(lot,lot.side), {width}=face, style=shopStyles[lot.kind];
  const {frame,trim,glass,display}=style, doorWidth=1.13;
  const box=(u,y,v,w,h,d,color)=>masonry.box(face.point(u,y,v),[w,h,d],color,face.yaw);
  londonFront(lot,lot.row%3===2?'stone':'brick',{side:lot.side,width:face.width,height:4.17});
  const glazingWidth=(width-doorWidth-.56)/2;
  const glazingCenter=(glazingWidth+doorWidth)/2;
  box(0,1.89,.094,width-.08,3.76,.18,frame);
  for(const side of [-1,1]) {
    const u=side*glazingCenter;
    face.panel(u,1.69,glazingWidth-.16,1.70,glass,.195);
    face.panel(u,.84,glazingWidth-.14,.12,trim,.21);
    face.panel(u,1.76,.055,1.62,trim,.215);
    face.panel(u,2.30,glazingWidth-.17,.045,'#a3aa98',.22);
    for(let i=0;i<4;i++) {
      const itemU=u+(i-1.5)*(glazingWidth-.35)/4;
      face.panel(itemU,1.08+(i%2)*.09,.16+(i%3)*.11,.39+(i%2)*.18,display[i%display.length],.209);
    }
  }
  face.panel(0,1.26,doorWidth-.14,2.40,glass,.199);
  face.panel(0,2.42,doorWidth-.14,.10,trim,.214);
  face.panel(.263,1.18,.068,.38,trim,.215);
  for(const side of [-1,1]) {
    box(side*(width/2-.17),1.88,.16,.24,3.74,.24,frame);
    box(side*(width/2-.17),.37,.19,.29,.73,.27,trim);
  }
  box(0,3.54,.23,width-.31,.68,.26,frame);
  shopLabels.push({name:lot.name,face,width:width-.50,background:frame,ink:trim});
  if(['coffee','meal','flower','food'].includes(lot.kind)&&lot.row%3!==1) {
    const count=Math.floor(width/.46), span=(width-.5)/count;
    for(let i=0;i<count;i++) {
      const a=(i-count/2)*span,b=a+span;
      masonry.quad(face.point(a,2.95,.23),face.point(b,2.95,.23),face.point(b,2.65,.98),
        face.point(a,2.65,.98),i%2?frame:trim,[0,.96,.28]);
    }
    box(0,2.61,.975,width-.5,.12,.065,frame);
  }
}

const streetSigns=[
  [-72.1,-58,0,'GOWER STREET','WC1'],[-58.1,-59,Math.PI/2,'GOWER PLACE','WC1'],
  [-72.1,80,0,'TORRINGTON PLACE','WC1'],[-58.1,48,0,'GOWER STREET','WC1'],
  [-124,-70,0,'GRAFTON WAY','WC1'],[-124,-55,Math.PI/2,'HUNTLEY STREET','WC1'],
  [-151,-106,0,'EUSTON ROAD','NW1'],[-165,-78,Math.PI/2,'TOTTENHAM COURT RD','W1'],
  [-167,147,0,'GOODGE STREET','W1'],[-151,110,Math.PI/2,'TOTTENHAM COURT RD','W1'],
  [53.1,14,Math.PI/2,'GORDON STREET','WC1'],[116.5,61,0,'GORDON SQUARE','WC1']
];

function londonStreetSigns() {
  for(const [x,z,yaw,street,postcode] of streetSigns) {
    const canvas=signCanvas(512,118,(ctx,w,h)=>{
      ctx.fillStyle='#e7e5da';ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#413c38';ctx.fillRect(8,7,w-16,3);ctx.fillRect(8,h-10,w-16,3);
      ctx.font='700 50px Arial,sans-serif';ctx.fillText(street,15,62,w-30);
      ctx.font='700 23px Arial,sans-serif';ctx.fillStyle='#a05449';ctx.fillText(postcode,16,93);
    });
    const lot=campusFootprint(x,z,0,0,yaw);
    lotBox(lot,0,1.04,0,.068,2.08,.068,'#3e4747',scenery);
    lotBox(lot,0,1.96,0,2.55,.44,.07,'#e7e5da',scenery);
    plate(canvas,lotPoint(lot,0,1.96,.042),2.51,.416,yaw);
    plate(canvas,lotPoint(lot,0,1.96,-.042),2.51,.416,yaw+Math.PI);
  }
}
