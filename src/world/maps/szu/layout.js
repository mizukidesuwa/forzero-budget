import { add, scale } from '../../../core/math.js';
import { along, courseFrame, indexStreets, pointDistance, street, travelTable } from '../../geometry.js';

// Local north-up projection of public map anchors. Game distances use 0.36 of the mapped horizontal scale.
const MAP_SCALE = .36;
const MAP_ORIGIN = [22.53350,113.93540];
const geo = (lat,lng) => [
  (lng - MAP_ORIGIN[1]) * 111320 * Math.cos(MAP_ORIGIN[0] * Math.PI / 180) * MAP_SCALE,
  (MAP_ORIGIN[0] - lat) * 111132 * MAP_SCALE
];

const campusGates = [
  {name:'立德门', part:'西门', xy:geo(22.532902,113.932798), facing:[-1,0,0]},
  {name:'立志门', part:'', xy:geo(22.538843,113.936449), facing:[0,0,-1]},
  {name:'立功门', part:'北门', xy:geo(22.538743,113.939440), facing:[0,0,-1]},
  {name:'立言门', part:'南门', xy:geo(22.529426,113.938036), facing:[0,0,1]},
  {name:'立业门', part:'小西门', xy:geo(22.527690,113.929970), facing:[-.8,0,.6]},
  {name:'立心门', part:'', xy:geo(22.537020,113.942573), facing:[1,0,0]}
];

const centralSquare = geo(22.532854,113.934321);
const sportsCenter = geo(22.530456,113.938038);
const campusBoundary = {minX:-207,maxX:346,minZ:-223,maxZ:264};
const perimeter = [
  [-115,-219],[-54,-223],[37,-218],[104,-220],[154,-215],[219,-206],[253,-184],
  [270,-155],[269,-127],[245,-84],[215,-46],[185,-13],[168,31],[158,68],[151,103],[131,145],[105,173],
  [56,195],[21,232],[-16,245],[-67,247],[-153,248],[-204,241],[-190,193],[-162,143],[-123,78],
  [-100,32],[-110,-7],[-117,-65],[-122,-121],[-124,-170]
];

const westToNorth = street([
  [-92,39],[-92,25],[-97,13],[-103,-7],[-104,-29],[-101,-49],[-85,-64],
  [-59,-73],[-33,-78],[-7,-88],[21,-94],[49,-92],[70,-104],[86,-134],[103,-153],[130,-171],[149,-185]
],4.1);
const northToSouth = street([
  [149,-185],[173,-177],[198,-167],[223,-152],[247,-142],[253,-122],[241,-97],
  [218,-76],[192,-56],[171,-38],[153,-20],[143,0],[142,30],[138,60],[134,89],[127,114],[118,136],[107,151]
],4.15);
const southToLake = street([
  [107,151],[88,156],[62,162],[35,169],[8,176],[-26,183],[-62,188],[-88,194],[-114,203],
  [-141,213],[-168,223],[-191,230]
],4.05);
const westReturn = street([
  [-114,203],[-126,182],[-132,158],[-129,135],[-120,114],[-111,91],[-101,66],[-92,39]
],3.7);
const teachingConnector = street([
  [-103,-7],[-109,-38],[-110,-86],[-106,-132],[-91,-158],[-69,-163],[-42,-160],
  [-16,-153],[11,-149],[45,-148],[78,-154],[103,-153]
],3.65);
const throughCenter = street([
  [-92,25],[-68,24],[-52,15],[-24,13],[5,16],[24,18],[51,24],[63,13],[84,12],[102,13],[124,22],[142,30]
],3.9);
const betweenLakes = street([
  [-52,15],[-64,44],[-66,77],[-66,103],[-65,126],[-64,152],[-67,176],[-62,188]
],3.45);
const southConnector = street([
  [24,18],[22,40],[12,57],[1,72],[-2,91],[-3,107],[2,125],[10,147],[8,176]
],3.55);
const roads = [
  westToNorth,northToSouth,southToLake,westReturn,teachingConnector,throughCenter,betweenLakes,southConnector,
  street([[149,-185],[150,-198],campusGates[2].xy],3.55),
  street([[11,-149],[23,-178],[38,-199],campusGates[1].xy],3.5),
  street([[107,151],[103,158],campusGates[3].xy],3.5),
  street([[-191,230],campusGates[4].xy],3.3),
  street([[247,-142],[257,-142.5],campusGates[5].xy],3.6)
];
const westEnd = westToNorth.length;
const eastEnd = westEnd + northToSouth.length;

// South campus lies across Baishi Road from Liyan Gate.
const canghaiPerimeter = [[168,194],[234,181],[303,170],[334,174],[345,215],[322,251],[256,263],[185,244]];
const campusOutlines = [perimeter,canghaiPerimeter];

const canghaiGates = [
  {name:'致远门',part:'粤海南区',xy:[232.6,182.8],facing:[0,0,-1]},
  {name:'致和门',part:'粤海南区',xy:[181.4,192.0],facing:[0,0,-1]}
];
const canghaiStreets = [
  {name:'粤海南区环线',path:street([[184,208],[197,199],[225,193],[255,189],[288,184],[313,187],
    [330,201],[324,222],[308,239],[285,245],[255,250],[227,245],[200,233],[186,219],[184,208]],2.80)},
  {name:'致远门',path:street([[225,193],[230,189],[232.6,182.8],[232,174],[232.7,162.85]],2.97)},
  {name:'致和门',path:street([[184,208],[182.8,201],[181.4,192],[177,181.4],[175,174.4]],2.91)},
  {name:'南区教学联络路',path:street([[225,193],[240,196],[241.5,215],[239,232],[227,245]],2.30)}
];

const openStreets = [
  {name:'南海大道', path:extendAvenue(street([[-120,-384],[-125,-274],[-133,-226],[-131,-128],[-124,-42],[-122,22],[-139,91],[-173,153],[-208,216],[-234,287],[-252,360]],14.0),44,101)},
  {name:'深南大道', path:street([[-420,-228],[-310,-243],[-225,-243],[-130,-240],[-25,-245],[73,-242],[151,-235],[253,-220],[409,-208]],16.6)},
  {name:'白石路', path:extendAvenue(street([[-271,257],[-205,263],[-121,269],[-48,269],[-2,261],[43,233],[92,189],[172,175],[237,162],[362,149]],11.5),124,0)},
  {name:'', path:street([[295,-218],[287,-174],[285,-145],[268,-100],[239,-58],[199,-13],[189,55],[194,93],[187,136],[172,175]],8.5)}
];

// The eastern connector ends at live junctions. Close only the unused shoulders there.
export const szuRoadClosures = [
  { road: 0, end: 0 }, { road: 0, end: 1 }, { road: 1, end: 0 }, { road: 1, end: 1 },
  { road: 2, end: 0 }, { road: 2, end: 1 }, { road: 3, end: 0, shoulder: 1 }, { road: 3, end: 1, shoulder: -1 },
];

const cityLinks = [
  {name:'立德门', path:street([[-92.35,22.3],[-94.7,19.60],[-100.4,19.55],[-107.5,21.1],[-113,22]],2.14)},
  {name:'立德门', path:street([[-92,25],[-94.7,28.60],[-100.6,28.43],[-107,26.75],[-113,22]],2.11)},
  {name:'立志门', path:street([campusGates[1].xy,[38.7,-222],[38.5,-231],[42.1,-243.6]],3.5)},
  {name:'立功门', path:street([campusGates[2].xy,[149.9,-218],[150.7,-226],[151,-235]],3.65)},
  {name:'立言门', path:street([campusGates[3].xy,[95.35,167.1],[95.63,175.2],[99.1,186.8]],3.48)},
  {name:'立业门', path:street([campusGates[4].xy,[-204.2,232.5],[-208.9,232.2],[-213.4,230]],2.86)},
  {name:'立心门', path:street([campusGates[5].xy,[272,-140.2],[278.2,-138.1],[282.14,-134.8]],3.5)}
];
const cityRoads = new Map(openStreets.concat(cityLinks,canghaiStreets).map(({path, name}, i) =>
  [path, {path,name:name || '东侧联络路', width:path.width, shoulder:i < openStreets.length ? 2.8 : .68}]));
const cityExtent = {minX:-448, maxX:437, minZ:-448, maxZ:485};

export let cityRoadIndex;
export function indexCityRoads() {
  cityRoadIndex ??= indexStreets(cityRoads.keys());
}

function extendAvenue(path,before,after) {
  const tail=(d,amount,direction)=>{
    const frame=courseFrame(path,d), count=Math.ceil(amount/3.2);
    return Array.from({length:count},(_,i)=>add(frame.p,scale(frame.f,direction*amount*(i+1)/count)));
  };
  return travelTable([...tail(0,before,-1).reverse(),...path.rows.map(row=>row.p),...tail(path.length,after,1)],path.width);
}

const northSpine = street([[-103,-7],[-89,-10],[-68,-15],[-46,-20],[-21,-18],[8,-17],[30,-13],[47,-21],[65,-24],[90,-21],[120,-20],[153,-20]],3.48);
const lectureCross = street([[11,-149],[10,-130],[0,-113],[-15,-102],[-28,-92],[-33,-78]],2.89);
const learningLink = street([[-33,-78],[-40,-63],[-48,-52],[-55,-38],[-54,-28],[-46,-20]],2.88);
const lakeRim = street([[-2,91],[-18,95],[-37,94],[-51,94],[-62,99],[-66,103]],3.06);
const librarySouth = street([[-3,107],[13,108],[33,109],[45,106],[51,98],[57,92],[67,89],[76,84],[77,75],[76,62],[76,50],[83,39],[101,33],[120,28]],3.08);

const sportsConnector=street([[130,-171],[148,-156],[159,-139],[169,-123],[175,-106],[178,-88],[186,-71],[192,-56]],3.31);
const researchConnector=street([[86,-134],[91,-120],[88,-101],[92,-80],[91,-61],[89,-48],[90,-37],[90,-21]],2.79);
const eastTeachingCrossing=street([[90,-21],[91,-4],[84,12]],2.72);
const hospitalCrossing=street([[84,12],[94,4],[110,5],[127,6],[143,0]],2.78);
const libraryEastConnector=street([[77,75],[92,71],[112,70],[138,60]],2.92);

const hillReturn=street([[-64,44],[-43,53],[-25,54],[-13,59],[1,72]],2.81);
const innerSections = [
  northSpine,lectureCross,learningLink,lakeRim,librarySouth,
  street([[-91,-158],[-93,-175],[-88,-193],[-72,-201],[-54,-205],[-36,-205],[-18,-198],[-8,-189],[14,-187],[32,-191]],2.76),
  street([[-69,-163],[-65,-148],[-61,-130],[-49,-113],[-37,-101],[-28,-92]],2.72),
  street([[45,-148],[48,-130],[57,-117],[67,-112],[70,-104]],2.62),
  street([[10,-130],[-7,-129],[-25,-128],[-41,-123],[-49,-113]],2.48),
  street([[-110,-86],[-96,-85],[-82,-88],[-65,-95],[-52,-102],[-37,-101]],2.77),
  street([[-85,-64],[-77,-56],[-67,-54],[-59,-50],[-55,-38]],2.43),
  street([[-59,-73],[-58,-57],[-51,-48],[-40,-46],[-28,-46],[-18,-40],[-21,-18]],2.53),
  street([[8,-17],[17,-29],[21,-47],[21,-62],[20,-76],[22,-85],[21,-94]],2.96),
  street([[65,-24],[65,-40],[65,-56],[66,-72],[68,-88],[70,-104]],2.96),
  sportsConnector,
  street([[173,-177],[183,-158],[205,-146],[224,-123],[230,-112],[241,-97]],2.84),
  street([[175,-106],[161,-99],[148,-88],[144,-78],[139,-67],[133,-52],[133,-41],[153,-20]],3.10),
  researchConnector,
  eastTeachingCrossing,
  street([[47,-21],[43,-6],[42,10],[40,21]],2.48),
  street([[-68,24],[-66,40],[-58,55],[-53,73],[-47,86],[-37,94]],2.66),
  street([[-21,-18],[-25,-8],[-27,3],[-33,14]],2.41),
  hillReturn,
  street([[22,40],[27,49],[28,63],[38,68],[57,70],[77,75]],2.77),
  hospitalCrossing,
  libraryEastConnector,
  street([[76,84],[88,99],[89,116],[85,136],[88,156]],2.76),
  street([[51,98],[50,113],[47,135],[44,151],[35,169]],2.78),
  street([[-120,114],[-112,125],[-93,128],[-77,127],[-65,126]],2.79),
  street([[-2,91],[2,104],[2,125],[-3,142],[-12,157],[8,176]],2.65),
  street([[-64,152],[-65,161],[-62,168],[-56,172],[-43,171],[-26,166],[-12,157]],2.63),
  street([[-101,66],[-98,82],[-86,96],[-75,103],[-66,103]],2.56),
  street([[-114,203],[-107,215],[-97,222],[-75,226],[-53,227],[-34,215],[-26,183]],2.91),
  street([[-97,222],[-117,221],[-137,222],[-168,223]],2.62),
  street([[-34,215],[-18,213],[2,215],[21,210],[30,190],[35,169]],2.88),
  street([[24,18],[35,31],[45,34],[67,35],[84,39]],2.62),
];
roads.push(...innerSections);

const dujuanFoot=[-2,112], dujuanCrest=[33,144];
const [dujuanEntryX,,dujuanEntryZ]=along(southConnector,pointDistance(southConnector,dujuanFoot));
const dujuanPass=street([[dujuanEntryX,dujuanEntryZ],[.35,120],[4.7,128],[11.7,134.8],
  [21.5,139.1],dujuanCrest,[44,151]],3.40);
roads.push(dujuanPass);
innerSections.push(dujuanPass);

const parkWalks=[
  street([[-176,-176],[-191,-190],[-234,-192],[-261,-170],[-267,-119],[-249,-72],
    [-207,-65],[-178,-84],[-167,-125],[-176,-176]],1.55),
  street([[-131,-124],[-157,-125],[-167,-125],[-198,-124],[-222,-122],[-267,-119]],1.7),
  street([[-227,-241],[-228,-210],[-234,-192]],1.55)
];

export {
  geo, campusGates, centralSquare, sportsCenter, campusBoundary, perimeter,
  westToNorth, northToSouth, southToLake, westReturn, teachingConnector, throughCenter, betweenLakes, southConnector,
  roads, westEnd, eastEnd, canghaiPerimeter, campusOutlines, canghaiGates, canghaiStreets, openStreets, cityLinks,
  cityRoads, cityExtent, northSpine, lectureCross, learningLink, lakeRim, librarySouth, sportsConnector, researchConnector,
  eastTeachingCrossing, hospitalCrossing, libraryEastConnector, hillReturn, innerSections, dujuanFoot, dujuanCrest,
  dujuanPass, parkWalks,
};
