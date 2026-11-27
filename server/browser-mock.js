(() => {
  const players = [{id:'aa',name:'房主',online:true,ready:false},{id:'bb',name:'访客',online:true,ready:true}];
  let room, events;
  const send = (type,data) => queueMicrotask(()=>events?.dispatchEvent(new MessageEvent(type,{data:JSON.stringify(data)})));
  function response(value) { return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}); }

  window.EventSource = class extends EventTarget {
    constructor() {
      super();
      events = this;
      queueMicrotask(()=>{this.onopen?.(); send('room',room);});
    }
    close() { events = null; }
  };

  window.mockPackets = [];
  let channel;
  const native = window.testNativeWebRtc;
  const pendingCandidates = [];
  const other = native ? new RTCPeerConnection({iceServers:[]}) : null;
  if (other) {
    other.ondatachannel = event=>{
      channel = event.channel;
      channel.binaryType = 'arraybuffer';
      channel.onmessage = event=>window.mockPackets.push(event.data);
    };
    other.onicecandidate = ({candidate})=>{
      if (candidate) send('signal',{from:'bb',data:{type:'candidate',ice:candidate.toJSON()}});
    };
  }
  if (!native) window.RTCPeerConnection = class {
    connectionState = 'new';
    signalingState = 'stable';
    createDataChannel() {
      channel = {readyState:'connecting',bufferedAmount:0,send:value=>window.mockPackets.push(value)};
      return channel;
    }
    async createOffer() { return {type:'offer',sdp:'test offer'}; }
    async setLocalDescription(offer) { this.localDescription = {toJSON:()=>offer}; }
    async setRemoteDescription(description) {
      this.remoteDescription = description;
      this.connectionState = 'connected';
      channel.readyState = 'open';
      channel.onopen();
      this.onconnectionstatechange();
    }
    close() { this.connectionState = 'closed'; this.signalingState = 'closed'; }
  };

  window.sendMockPose = (sequence,epoch,speed) => {
    const packet = new ArrayBuffer(32), view = new DataView(packet);
    view.setUint16(0,1);
    view.setUint16(2,sequence);
    view.setUint16(4,epoch);
    view.setFloat32(24,speed);
    if (native) channel.send(packet);
    else channel.onmessage({data:packet});
  };

  window.fetch = async (url,options) => {
    if (url==='/online/time') return response({now:Date.now()});
    if (url==='/online/host-info') return response({port:8787,addresses:[]});
    if (url==='/online/rooms') {
      room = {code:'ABCD2345',host:'aa',route:window.mockRoute,format:'bo1',phase:'lobby',players,round:null,
        history:[],standing:[],winners:[]};
      return response({id:'aa',token:'test',room,iceServers:[]});
    }
    const body = JSON.parse(options.body);
    switch (body.action) {
      case 'signal':
        if (!native) send('signal',{from:'bb',data:{type:'answer',sdp:'test answer'}});
        else if (body.data.type==='offer') {
          await other.setRemoteDescription(body.data);
          for (const candidate of pendingCandidates.splice(0)) await other.addIceCandidate(candidate);
          await other.setLocalDescription(await other.createAnswer());
          send('signal',{from:'bb',data:other.localDescription.toJSON()});
        } else if (body.data.type==='candidate') {
          if (other.remoteDescription) await other.addIceCandidate(body.data.ice);
          else pendingCandidates.push(body.data.ice);
        }
        break;
      case 'ready': players[0].ready=body.ready; send('room',room); break;
      case 'start':
        room.phase='race';
        room.round={number:1,goAt:Date.now()+3500,results:[]};
        send('room',room);
        break;
      case 'finish':
        room.phase='done';
        room.round.results=[{id:'aa',ms:body.ms},{id:'bb',ms:body.ms+300}];
        room.history=[room.round];
        room.standing=[{id:'aa',name:'房主',wins:1,points:2},{id:'bb',name:'访客',wins:0,points:1}];
        room.winners=['aa'];
        send('room',room);
        break;
      case 'leave': other?.close(); break;
    }
    return response({ok:true});
  };
})();
