function publicGateSpan(frame) {
  const street=cityStreetAt(frame.p[0],frame.p[2]);
  if(!street) return null;
  const edge=direction=>{
    let inside=0;
    for(let d=.25;d<=42;d+=.25) {
      const [x,,z]=offsetVertex(frame,direction*d,0);
      if(!cityRoadContains(street,x,z,CITY_EDGE_MARGIN)) break;
      inside=d;
    }
    return direction*inside;
  };
  return {minCross:Math.min(-2.75,edge(-1)),maxCross:Math.max(2.75,edge(1))};
}

function timingSpan(frame,cityAccess,fallback,minimum=0) {
  const span=cityAccess?publicGateSpan(frame):null;
  if(span) return {...span,half:Math.max(-span.minCross,span.maxCross)};
  const hit=nearestStreet(frame.p[0],frame.p[2]);
  return {half:Math.max(minimum,(hit.street?.width??fallback)+.34)};
}

function notePublicMarkers(event) {
  for(const marker of event.markers) marker.publicRoads=roadInfoAt(marker.p[0],marker.p[2]);
}

function projectPublicCourse(event,position,direction,covered,gate) {
  const [x,,z]=position, active=roadInfoAt(x,z);
  if(!active.size) return null;
  const roads=[...active], {markers,markerStep}=event;
  const first=Math.max(0,Math.floor((covered-13)/markerStep));
  const last=Math.min(markers.length-1,Math.ceil(Math.min(gate.distance+8,covered+43)/markerStep));
  let best=Infinity, chosen=null;
  for(let i=first;i<last;i++) {
    const a=markers[i],b=markers[i+1];
    if(!roads.some(info=>a.publicRoads.has(info)||b.publicRoads.has(info))) continue;
    const dx=b.p[0]-a.p[0], dz=b.p[2]-a.p[2];
    const span=dx*dx+dz*dz;
    if(span<.01||direction[0]*dx+direction[2]*dz<-.32*Math.sqrt(span)) continue;
    const ux=x-a.p[0],uz=z-a.p[2];
    const t=(ux*dx+uz*dz)/span;
    if(t<-.32||t>1.32) continue;
    const fraction=clamp(t,0,1);
    const distance=mix(a.distance,b.distance,fraction);
    const gap=(ux-dx*fraction)**2+(uz-dz*fraction)**2;
    const score=gap+.015*(distance-covered)**2;
    if(score>=best) continue;
    best=score;
    chosen=distance;
  }
  return chosen===null?null:Math.min(gate.distance,chosen);
}
