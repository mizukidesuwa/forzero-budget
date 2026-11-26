const zhiyi = landmark('致艺楼','艺术学部','zhiyi',221,211,26,15,4,.18,limestone,14);
zhiyi.parts = [
  lotPart(zhiyi,-6.32,1.83,13.20,11.20,10.80),
  lotPart(zhiyi,7.9,2.15,8.86,10.9,11.18),
  lotPart(zhiyi,1.60,-4.46,22.56,5.32,8.95)
];
const canghaiBuildings = [
  zhiyi,
  landmark('致真楼','教学楼','academic',262,208,24,14,4,-.13,limestone,8),
  landmark('致理楼','公共教学楼','academic',299,209,28,17,5,-.14,sage,8),
  landmark('致信楼','教学楼','academic',270,232,23,11,3,.13,limestone,8)
];

function zhiyiBuilding(block) {
  const white='#eeeee4';
  for(const part of block.parts.slice(0,2)) {
    lotBox(part,0,part.height/2,0,part.w,part.height,part.depth,'#dadcd3');
    for(let side=0;side<4;side++) {
      const face=facadeOf(part,side);
      for(let floor=0;floor<4;floor++) glazing(face,1.57+2.4*floor,Math.ceil(face.width/1.72),'#647a7a',1.10);
    }
  }
  const front=block.parts[2], inner=lotPart(front,0,1.60,front.w,1.95,front.height);
  lotBox(inner,0,front.height/2,0,inner.w,front.height,inner.depth,'#b6c2bd');
  for(let floor=0;floor<4;floor++) {
    const y=1.15+floor*2.10;
    glazing(facadeOf(inner,2),y,12,'#4a6770',1.38);
    lotBox(front,0,y-.96,-.13,front.w,.20,front.depth,white);
  }
  lotBox(front,0,front.height+.03,-.13,front.w+.16,.33,front.depth+.08,white);
  for(const side of [-1,1]) lotBox(front,side*(front.w/2-.15),front.height/2,-.15,.32,front.height,front.depth,white);
  const bay=1.84, row=2.10, cols=12, edge=bay*cols/2;
  for(let i=0;i<4;i++) for(let j=0;j<cols;j++) {
    const u=(j-(cols-1)*.5)*bay, y=1.18+i*row;
    const shift=((j*13+i*7)%5-2)*.12;
    const open=.80+((j*7+i*5)%4)*.23;
    const h=.77+((j*3+i*11)%4)*.22, v=-front.depth/2+.06;
    lotBox(front,u+(shift-open/2-bay/2)/2,y,v,bay/2+shift-open/2,row,.27,white);
    lotBox(front,u+(shift+open/2+bay/2)/2,y,v,bay/2-shift-open/2,row,.27,white);
    lotBox(front,u+shift,y+(row+h)/4,v,open,(row-h)/2,.27,white);
    lotBox(front,u+shift,y-(row+h)/4,v,open,(row-h)/2,.27,white);
  }
  for(const s of [-1,1]) lotBox(front,s*(edge+front.w/2)/2,4.34,-front.depth/2+.06,front.w/2-edge,8.68,.27,white);
  facadeName(facadeOf(front,2,-.09),'致艺楼','艺术学部',.72,4.7,.65,white);
}

function canghaiGrounds() {
  const plaza=campusFootprint(252,223,24.5,8.3,-.14);
  lotBox(plaza,0,.01,0,plaza.w,.042,plaza.depth,'#d4ccbb',pavement);
  lotBox(zhiyi,0,.011,-10.50,16,.041,6.80,'#d8d2c1',pavement);
  for(const [x,z,s] of [[183,222,.93],[193,213,1.0],[201,218,1.28],[215,230,1.16],
    [237,247,.98],[265,246,1.33],[289,234,1.12],[317,223,1.31],[318,193,1.1],[284,197,1.02],
    [273,194,1.18],[202,226,1.18],[301,226,1.14],[328,209,1.06]]) {
    if(!buildingAt(x,z,1.5)&&!cityStreetAt(x,z)) deciduous(x,z,s,Math.round(s*12)%3);
  }
}
