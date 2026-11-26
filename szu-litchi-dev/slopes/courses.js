function hillCourse(id,name,description,sections,start,stations,finish,thresholds) {
  const path=joinTrack(sections);
  const event=namedCourse(id,name,description,path,start,stations,finish,thresholds);
  const profile=path.rows.map(({p,distance})=>[distance,hillHeight(p[0],p[2])]);
  const gain=profile.slice(1).reduce((sum,[,h],i)=>sum+Math.max(0,h-profile[i][1]),0);
  const loss=profile.slice(1).reduce((sum,[,h],i)=>sum+Math.max(0,profile[i][1]-h),0);
  return Object.assign(event,{revision:6,elevation:{profile,gain,loss}});
}

function hillCourses() {
  return [
    hillCourse('dujuan-climb','杜鹃山爬坡赛','从立德门经南馆到坡脚，顺着缓弯转上山腰，再沿直坡冲过山脊。',
      [section(throughCenter,[-86,24],[24,18]),section(southConnector,[24,18],dujuanFoot),
        section(dujuanPass,null,dujuanCrest)],
      '立德门内侧',[[[-47,14],'时光广场'],[[24,24],'中央联络道'],[[1,76],'南馆外道'],
        [dujuanFoot,'坡脚入口'],[[5,128],'上山缓弯'],[[21,139],'山腰直坡']], '杜鹃山脊',[.97,1.10,1.28]),
    hillCourse('dujuan-descent','杜鹃山下坡赛','从山脊沿直坡提速，坡脚顺着宽弯收速，再经上文山湖转入林荫道。',
      [section(dujuanPass,dujuanCrest,dujuanFoot),section(southConnector,dujuanFoot,[-2,91]),
        section(lakeRim),section(betweenLakes,[-66,103],[-64,44]),section(hillReturn)],
      '杜鹃山脊',[[[21,139],'山腰直坡'],[[5,128],'下山缓弯'],[dujuanFoot,'坡脚并线'],
        [[-3,103],'双湖路口'],[[-37,94],'上湖长弯'],[[-65,82],'湖间北上'],[[-39,54],'林荫路']],
      '南馆西侧',[.96,1.10,1.30])
  ];
}

function updateElevationMap() {
  const stats=activeCampus==='szu'?race.event.elevation:null;
  ui.elevationPanel.hidden=!stats||race.phase==='free'&&!zoomMap;
  if(ui.elevationPanel.hidden) return;
  setText(ui.elevationStats,'爬升 '+stats.gain.toFixed(1)+' m · 下降 '+stats.loss.toFixed(1)+' m');
  const canvas=ui.elevationChart,ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const maxHeight=Math.max(...stats.profile.map(item=>item[1]),.1);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#1e3026';ctx.fillRect(0,0,w,h);
  ctx.beginPath();ctx.moveTo(0,h-8);
  for(const [distance,elevation] of stats.profile)
    ctx.lineTo(distance/race.event.length*w,h-8-elevation/maxHeight*(h-17));
  ctx.lineTo(w,h-8);ctx.closePath();
  ctx.fillStyle='#6c8b50';ctx.fill();
  ctx.strokeStyle='#dce8b5';ctx.lineWidth=2;ctx.stroke();
  canvas.setAttribute('aria-label','从起点到终点的路线剖面。累计爬升 '+stats.gain.toFixed(1)+' 米，下降 '+stats.loss.toFixed(1)+' 米');
}
