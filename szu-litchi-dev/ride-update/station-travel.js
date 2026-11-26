function requestTravel() {
  if(!canTravel()||ui.travelDialog.open) return;
  clearInput();
  if(!atTravelPoint()) { arriveAtStation();updateHud();return; }
  setText(ui.travelStation,campuses[activeCampus].station);
  const choices=Object.entries(campuses).filter(([id])=>id!==activeCampus).map(([id,site])=>{
    const button=document.createElement('button');
    button.type='button';button.className='action';button.dataset.destination=id;
    button.textContent=site.name+' · '+site.station;
    button.addEventListener('click',()=>{
      if(!canTravel()||!atTravelPoint()||!ui.travelDialog.open) return;
      ui.travelDialog.close();
      pendingCampus={destination:id,at:performance.now()+90};
      ui.notice.hidden=false;setText(ui.notice,'正在前往'+site.name+'…');updateHud();
    });
    return button;
  });
  ui.travelChoices.replaceChildren(...choices);
  ui.travelDialog.showModal();
}
function updateTravelButton() {
  ui.travel.hidden=race.phase!=='free';
  ui.travel.disabled=!canTravel();
  setText(ui.travel,atTravelPoint()?'选择目的地':'到'+campuses[activeCampus].station);
}
function updateCampusLabels() {
  const info=campuses[activeCampus];
  stage.dataset.campus=activeCampus;setText(ui.campusName,info.name);
  setText(ui.miniButton.querySelector('span'),activeCampus==='shunde'?'顺峰山导览':activeCampus==='ucl'?'街区小地图':'校园小地图');
  setText(ui.mapTitle,{szu:'校园俯视地图',ucl:'Bloomsbury 地图',shunde:'顺峰山公园导览图'}[activeCampus]);
  ui.szuReferences.hidden=activeCampus!=='szu';
  ui.uclReference.hidden=activeCampus!=='ucl';
  canvas.setAttribute('aria-label',info.name+'三维骑行地图');
}

