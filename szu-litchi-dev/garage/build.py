from pathlib import Path

here = Path(__file__).parent
baseline = (here.parent / 'road-junctions' / 'szu-litchi-loop.html').read_text(encoding='utf-8')
markup, body = baseline.split('<script>\n', 1)
script, tail = body.rsplit('</script>', 1)


def swap(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f'Expected one source anchor for {before[:130]!r}')
    return text.replace(before, after, 1)


def js(before, after):
    global script
    script = swap(script, before, after)


def html(before, after):
    global markup
    markup = swap(markup, before, after)


def source(name):
    return (here / name).read_text(encoding='utf-8').rstrip() + '\n\n'


js('function makeRider() {', source('profile.js') + source('vehicle-models.js') +
   "function makeRider(paint='classic') {")
js("  const teal = '#29746d', tealShaded = '#245449', chrome = '#90a69c', rubber = '#242d2b';",
   "  const {color:teal,shade:tealShaded,highlight}=bicyclePaints[paint];\n"
   "  const chrome='#90a69c',rubber='#242d2b';")
js("frame.tube(seatTube, head, .028, .034, '#3a887b', 10);",
   "frame.tube(seatTube,head,paint==='shared'?.035:.028,.034,highlight,10);")
js('''  return { frame, wheels, steering, body, pivot };''',
   '''  if(paint==='shared') {
    frontBasket(steering,.66-pivot[0],.756-pivot[1],.38,.405,.207,'#384a41');
    mudguard(frame,REAR,.379,.08,'#d1a739');
    mudguard(steering,toFork(FRONT),.379,.08,'#d1a739');
    frame.box([-.531,.348,.052],[.293,.145,.049],'#d4a22b',0,-.045);
  }
  return {frame,wheels,steering,body,pivot};''')

js('const recordKey=event=>event.id===\'ring\'?\'szu-yuehai-courses-4:ring\':\'szu-yuehai-long-courses-5:\'+event.id;',
   '''function recordKey(event,vehicle='bike') {
  const key=event.id==='ring'?'szu-yuehai-courses-4:ring':'szu-yuehai-long-courses-5:'+event.id;
  return vehicle==='bike'?key:key+':'+vehicle;
}''')
js('function makeCyclist(event, bike = stockBike) {',
   "function makeCyclist(event,bike=stockBike,vehicle='bike') {")
js('''  return {bike,position:event.spawn.slice()''',
   '''  return {bike,vehicle,position:event.spawn.slice()''')
js('''  const {paved,bike}=rider;''',
   '''  const {paved,vehicle}=rider, cycling=vehicle==='bike';
  const bike=cycling?rider.bike:vehicleChoices[vehicle];''')
js('''  rider.sprinting=paved && !input.brake''',
   '''  rider.sprinting=cycling && paved && !input.brake''')
js('''  const bank=clamp(Math.atan2(Math.max(0,rider.speed)*rider.yawRate,16.1),-.40,.40);''',
   '''  const bank=vehicle==='chair'?0:clamp(Math.atan2(Math.max(0,rider.speed)*rider.yawRate,16.1),-.40,.40);''')
js('''function referenceCornerScores(event, record) {''',
   '''function referenceCornerScores(event,record,vehicle='bike') {
  const sampleGap=Math.max(300,recordingRules(vehicle).interval*1.75);''')
js('b[0] - a[0] > 300 || b[6] <= a[6]', 'b[0] - a[0] > sampleGap || b[6] <= a[6]')
js('''function makeBenchmark(event) {
  const samples=[],splits=[],dt=.034,path=event.path;''',
   '''function makeBenchmark(event,vehicle='bike') {
  const samples=[],splits=[],dt=.034,path=event.path;
  const tuning=vehicleChoices[vehicle], cycling=vehicle==='bike';
  const top=cycling?11.55:tuning.roadSpeed*.96;
  const acceleration=cycling?4.86:4.34*tuning.force;
  const interval=recordingRules(vehicle).interval;''')
js('''    const pace=Math.min(11.55,plannedSpeed(event,distance+1.2)*.96+.22);
    speed+=clamp(pace-speed,-6.85*dt,4.86*dt);''',
   '''    const pace=Math.min(top,plannedSpeed(event,distance+1.2)*.96+.22);
    speed+=clamp(pace-speed,-6.85*dt,acceleration*dt);''')
js('if (time-last>=SAMPLE_MS&&distance<event.length)', 'if(time-last>=interval&&distance<event.length)')
js('''function readRecord(event,key) {''',
   '''function readRecord(event,key,vehicle='bike') {''')
js('r.time>MAX_RUN_MS||', 'r.time>recordingRules(vehicle).limit||')
js('''      ? r.corners : referenceCornerScores(event, r);''',
   '''      ? r.corners : referenceCornerScores(event,r,vehicle);''')
js('''function loadBest(event) {
  return readRecord(event,recordKey(event))??(event.oldKey?readRecord(event,event.oldKey):null);
}''',
   '''function loadBest(event,vehicle='bike') {
  return readRecord(event,recordKey(event,vehicle),vehicle)??
    (vehicle==='bike'&&event.oldKey?readRecord(event,event.oldKey):null);
}''')
js('''for(const event of courses) {
  event.corners = brakingCorners(event);''',
   source('records.js') + '''for(const event of courses) {
  event.corners = brakingCorners(event);''')
js('''function medalName(event,ms) {
  if(ms<=event.medalTimes.gold) return '金牌';
  if(ms<=event.medalTimes.silver) return '银牌';
  if(ms<=event.medalTimes.bronze) return '铜牌';''',
   '''function medalName(event,ms,vehicle='bike') {
  const {medals}=vehicleBenchmark(event,vehicle);
  if(ms<=medals.gold) return '金牌';
  if(ms<=medals.silver) return '银牌';
  if(ms<=medals.bronze) return '铜牌';''')

js('''  constructor(event, bike = stockBike) {
    this.bike = bike;''',
   '''  constructor(event,bike=stockBike,vehicle='bike') {
    this.bike=bike;
    this.vehicle=knownVehicle(vehicle);''')
js('''    this.bestRun = this.sessionRecords.get(event.id) ?? loadBest(event);
    this.best = this.bestRun?.time ?? null;
    this.abandon();''',
   '''    this.abandon();''')
js('''  get ghost()''',
   '''  get entryVehicle() { return vehicleChoices[this.vehicle].race?this.vehicle:'bike'; }

  setVehicle(vehicle) {
    if(this.phase==='race'||this.phase==='count'||!Object.hasOwn(vehicleChoices,vehicle)) return false;
    if(this.vehicle!==vehicle) {
      this.vehicle=vehicle;
      this.freeRide();
    }
    return true;
  }

  get ghost()''')
js('''    this.rider = makeCyclist(this.event,this.bike);
    this.freeRide();
    this.phase = 'count';''',
   '''    this.freeRide();
    this.rider=makeCyclist(this.event,this.bike,this.entryVehicle);
    this.phase = 'count';''')
js('''    this.nextRecording = SAMPLE_MS;''', '''    this.nextRecording=this.recordRules.interval;''')
js('''  freeRide() {
    this.phase = 'free';''',
   '''  freeRide() {
    if(this.rider.vehicle!==this.vehicle) {
      const {position,heading,paved}=this.rider;
      this.rider={...makeCyclist(this.event,this.bike,this.vehicle),position,heading,paved};
    }
    const entry=this.entryVehicle;
    const key=recordKey(this.event,entry);
    const {run,medals}=vehicleBenchmark(this.event,entry);
    this.recordRules=recordingRules(entry);
    this.bestRun=this.sessionRecords.get(key)??loadBest(this.event,entry);
    this.best=this.bestRun?.time??null;
    this.medalTimes=medals;
    this.phase = 'free';''')
js('this.reference = this.bestRun ?? this.event.benchmark;', 'this.reference=this.bestRun??run;')
js('''    this.rider = makeCyclist(this.event,this.bike);
    this.moved = false;''',
   '''    this.rider=makeCyclist(this.event,this.bike,this.vehicle);
    this.moved = false;''')
js('''    const ride = makeCyclist(this.event,this.bike);''',
   '''    const ride=makeCyclist(this.event,this.bike,this.rider.vehicle);''')
js('''    this.nextRecording = this.elapsed + SAMPLE_MS;
    this.routeMark''',
   '''    this.nextRecording=this.elapsed+this.recordRules.interval;
    this.routeMark''')
js('''&& time <= MAX_RUN_MS;''','''&&time<=this.recordRules.limit;''')
js('''    this.sessionRecords.set(this.event.id, this.bestRun);
    try { localStorage.setItem(recordKey(this.event), JSON.stringify(this.bestRun)); } catch {}''',
   '''    const key=recordKey(this.event,this.rider.vehicle);
    this.sessionRecords.set(key,this.bestRun);
    try { localStorage.setItem(key,JSON.stringify(this.bestRun)); } catch {}''')
js('''    if (this.elapsed >= this.nextRecording && this.elapsed <= MAX_RUN_MS) {
      this.frames.push(packPose(this.elapsed, this.rider));
      this.nextRecording = this.elapsed + SAMPLE_MS;
    }''',
   '''    if(this.elapsed>=this.nextRecording&&this.elapsed<=this.recordRules.limit) {
      this.frames.push(packPose(this.elapsed,this.rider));
      this.nextRecording=this.elapsed+this.recordRules.interval;
    }''')

ui = (here / 'garage-ui.py').read_text(encoding='utf-8')
exec(compile(ui, str(here / 'garage-ui.py'), 'exec'))

(here / 'game.js').write_text(script, encoding='utf-8', newline='\n')
(here / 'szu-litchi-loop.html').write_text(markup+'<script>\n'+script+'</script>'+tail,
                                         encoding='utf-8', newline='\n')
