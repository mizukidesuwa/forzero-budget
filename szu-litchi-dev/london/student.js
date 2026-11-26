function studentCentre(lot) {
  const cream='#d5cab7', coping='#e0d8c9', joint='#b7ad9c', frame='#596465';
  const [streetWing,gardenWing]=lot.parts;
  for(const part of lot.parts) {
    lotBox(part,0,part.height/2,0,part.w,part.height,part.depth,cream);
    lotBox(part,0,part.height-.19,0,part.w+.13,.31,part.depth+.12,coping);
    for(const side of [0,2]) {
      const wall=facadeOf(part,side);
      const paneCount=side===0?3:2;
      for(let i=0;i<paneCount;i++) {
        const u=(i+.5-paneCount/2)*wall.width/paneCount;
        for(const y of [6.07,9.51,12.69]) {
          wall.panel(u,y,3.04,2.60,joint);
          wall.panel(u,y,2.75,2.37,frame,.044);
          wall.panel(u,y,.068,2.42,'#a6a39a',.058);
        }
      }
    }
  }
  const street=facadeOf(streetWing,1), bay=street.width/4;
  for(let i=0;i<4;i++) {
    const u=(i-1.5)*bay, width=bay-1.12;
    street.panel(u,9.62,width,10.0,joint,.023);
    for(let floor=0;floor<3;floor++) {
      const y=6.38+floor*3.29;
      street.panel(u,y,width-.29,2.93,floor===2?'#6b7b7d':'#535e64',.049);
      street.panel(u,y,.066,2.93,'#adafa6',.060);
      street.panel(u,y-.47,width-.29,.042,'#979d97',.061);
      street.panel(u,y-1.54,width+.11,.19,coping,.083);
    }
  }
  for(let i=0;i<=4;i++) {
    const u=(i/4-.5)*street.width;
    masonry.box(street.point(u,9.69,.043),[.54,10.96,.12],cream,street.yaw);
    for(let j=0;j<35;j++) street.panel(u,4.43+j*.29,.52,.022,joint,.108);
  }
  const doorHeight=3.60;
  street.panel(0,1.91,street.width-.63,3.72,'#596b6d',.045);
  for(let i=0;i<16;i++) {
    const u=(i-7.5)*street.width/16;
    street.panel(u,1.97,.067,3.82,'#3e4d51',.072);
  }
  const entry=-.06*street.width;
  masonry.box(street.point(entry,1.83,.12),[6.13,doorHeight,.232],'#415764',street.yaw);
  for(const u of [-2.19,-.73,.73,2.19]) {
    street.panel(entry+u,1.82,1.37,3.35,'#677e81',.245);
    street.panel(entry+u,1.32,.029,.46,'#c1bcae',.257);
  }
  masonry.box(street.point(0,3.95,.32),[street.width+.11,.36,.70],coping,street.yaw);
  plate(shopSign('UCL STUDENT CENTRE','#e1d7c4','#363e43'),
    street.point(0,4.02,.677),10.7,.50,street.yaw);
  plate(shopSign('27–28   ·   STUDENT CENTRE','#3f545f','#eee7dc'),
    street.point(entry,2.91,.26),6.06,.38,street.yaw);

  const garden=facadeOf(gardenWing,3), span=garden.width-1.7;
  for(const y of [2.12,5.78,9.29,12.84]) {
    garden.panel(0,y,span,2.75,'#627775');
    for(let i=0;i<=8;i++) {
      const u=(i/8-.5)*span;
      garden.panel(u,y,i%2?.054:.135,2.78,'#d1c7b4',.063);
    }
  }
  for(let i=0;i<5;i++) {
    const u=(i/4-.5)*span;
    masonry.box(garden.point(u,12.93,.34),[.31,3.09,.76],coping,garden.yaw);
  }
  for(const z of [-8.8,-3.1,2.6,8.3]) {
    const left=lotPoint(streetWing,-9.7,16.63,z), right=lotPoint(streetWing,4.58,16.63,z);
    const highRight=add(right,[0,1.04,2.25]), highLeft=add(left,[0,1.04,2.25]);
    masonry.quad(left,right,highRight,highLeft,'#849492',[0,.91,-.41]);
    masonry.quad(highLeft,highRight,add(highRight,[0,-1.02,0]),add(highLeft,[0,-1.02,0]),
      '#b4aea0',[0,0,1]);
  }
}

function studentGardenMeshes() {
  const courtyard=campusFootprint(91.0,37.5,7.0,28.4);
  lotBox(courtyard,0,.027,0,courtyard.w,.054,courtyard.depth,'#bdb09e',pavement);
  for(const z of [-9.3,.45,9.6]) {
    lotBox(courtyard,-2.25,.24,z,1.76,.48,3.74,'#a29480',scenery);
    lotBox(courtyard,-2.25,.495,z,1.62,.042,3.58,'#728358',scenery);
    for(const dz of [-.99,.16,1.05]) {
      const [x,,zz]=lotPoint(courtyard,-2.39,0,z+dz);
      scenery.tube([x,.51,zz],[x+.11,1.45,zz-.10],.063,.031,'#738252',7);
      foliage.ellipsoid([x+.03,1.37,zz],[.38,.45,.42],'#648054',8,5);
    }
  }
  for(const z of [-5.6,4.3]) bench(89.5,37.5+z,Math.PI/2);
}
