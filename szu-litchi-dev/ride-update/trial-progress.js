  markCourse() {
    const distance = guideProgressAt(this.event,this.rider.position,this.rider.heading,this.routeAnchor,this.nextGate);
    this.onGuide = distance !== null;
    if (this.onGuide) this.routeAnchor = distance;
  }

  recordCheckpoint(previous) {
    const {gates,flyover} = this.event;
    const gate = gates[this.nextGate];
    const fraction = crossesRaceLine(gate,previous,this.rider.position,flyover);
    if (fraction === null) return false;
    const split = this.elapsed+fraction*STEP_MS;
    this.splits.push(split);
    this.routeAnchor = gate.distance;
    this.nextGate++;
    if (this.nextGate < gates.length) return false;
    this.finishAt(split);
    return true;
  }

  rejoin() {
    if (this.phase !== 'race') return false;
    const {gates} = this.event;
    const last = gates[this.nextGate-1];
    const ride = makeCyclist(this.event,this.bike,this.rider.vehicle);
    const from = last?.distance ?? 0;
    const at = Math.max(from,Math.min(this.routeAnchor-3.1,gates[this.nextGate].distance-6.1));
    if (last) {
      const frame = courseFrame(this.event.path, at);
      ride.position = courseGround(this.event,frame.p);
      ride.heading = Math.atan2(frame.f[2],frame.f[0]);
      ride.paved = surfaceAt(ride.position[0],ride.position[2],activeCampus==='szu');
    }
    ride.energy = this.rider.energy;
    ride.travel = this.rider.travel;
    this.saveReplayFrame(this.elapsed);
    this.rider = ride;
    this.elapsed += REJOIN_MS;
    this.lastRejoin = this.elapsed;
    this.saveReplayFrame(this.elapsed);
    this.nextRecording = this.elapsed+this.replayInterval;
    this.routeAnchor = at;
    this.cornerEntryAt = null;
    this.lastCorner = null;
    this.onGuide = true;
    return true;
  }
