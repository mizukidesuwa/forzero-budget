  for(const offset of [-6.35,6.35]) {
    const court=lotPart(yuehaiSportsPlaza,offset,0,10,21.5,0);
    lotBox(court,0,.078,0,11.8,.02,24.5,'#628374',scenery);
    const line=(u,v,w,d)=>lotBox(court,u,.098,v,w,.012,d,'#e5e5d5',scenery);
    for(const side of [-1,1]) {
      line(side*5,0,.064,21.5);
      line(side*3.76,0,.064,21.5);
      line(0,side*10.75,10,.064);
      line(0,side*5.77,7.52,.064);
      lotBox(court,side*5.36,.52,0,.10,1.04,.10,'#495950',scenery);
    }
    line(0,0,.064,11.54);
    for(let i=0;i<=34;i++) {
      const u=(i/34-.5)*10.72, top=.83+.16*(u/5.36)**2;
      lotBox(court,u,top/2+.08,0,.022,top-.08,.022,'#475950',scenery);
    }
    for(let i=0;i<12;i++) {
      const a=(i/12-.5)*10.72,b=((i+1)/12-.5)*10.72;
      const top=u=>.86+.16*(u/5.36)**2;
      scenery.tube(lotPoint(court,a,top(a),0),lotPoint(court,b,top(b),0),.031,.031,'#efead7',5);
    }
    for(const y of [.26,.48,.69]) lotBox(court,0,y,0,10.72,.019,.021,'#4f5f56',scenery);
    campusFixtures.push(lotPart(court,0,0,10.8,.12,1.04));
  }
