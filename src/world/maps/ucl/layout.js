import { ROAD_Y } from '../../../core/math.js';
import { indexStreets, street } from '../../geometry.js';

// Bloomsbury street grid, calibrated to the UCL Estates map and surveyed landmark positions.
// Local x runs along the Georgian cross streets. Charts rotate it back to geographic north.
const londonNorth=.56;
function londonPoint(lat,lon) {
  const east=(lon+.13455)*69200, south=(51.52435-lat)*111250;
  const c=Math.cos(londonNorth),s=Math.sin(londonNorth);
  return [.80*(c*east-s*south),.80*(s*east+c*south)];
}

const uclBounds = { minX: -273, maxX: 453, minZ: -194, maxZ: 566 };
const uclCampusInfo = {
  name: '伦敦 · Bloomsbury',
  station: 'UCL 旅行站',
  arrival: [11, ROAD_Y, 0],
  heading: 0,
  bounds: uclBounds,
};

const junction={
  eustonGower:[6,-143], eustonGordon:[115,-150], eustonCourt:[-174,-131], eustonWoburn:[337,-126],
  gowerPlaceWest:[1,-81], gowerPlaceEast:[118,-87], quadGate:[0,0],
  graftonGower:[1,-57], graftonCourt:[-173,-39], huntleyGrafton:[-105,-31],
  universityGower:[0,56], universityCourt:[-167,55], universityHuntley:[-104,55],
  torringtonCourt:[-162,178], torringtonGower:[1,184], maletTorrington:[57,197],
  byngGordon:[120,180], byngTorrington:[125,181], byngWoburn:[164,174],
  gordonNW:[120,79], gordonNE:[213,79], gordonSE:[213,152], gordonSW:[120,152],
  bedfordTavistock:[249,153], tavistockWoburn:[336,157],
  maletKeppel:[70,420], maletMontague:[75,505], gowerKeppel:[10,411],
  russellNW:[222,377], russellNE:[327,373], russellSE:[352,513], russellSW:[218,526]
};
const streetDefinitions=[
  ['gower','Gower Street',5.9,junction.eustonGower,junction.gowerPlaceWest,junction.graftonGower,junction.quadGate,
    junction.universityGower,[0,114],junction.torringtonGower,[5,303],junction.gowerKeppel,[15,563]],
  ['gordon','Gordon Street',4.5,junction.eustonGordon,junction.gowerPlaceEast,[124,-40],[126,21],[124,51],junction.gordonNW,
    junction.gordonSW,junction.byngGordon],
  ['studentPassage','Student Centre passage',1.85,[124,51],[119,54.1],[107,57.8],[95,57.2],[85,56]],
  ['euston','Euston Road',10.6,[-271,-119],junction.eustonCourt,[-94,-139],[-58,-139],junction.eustonGower,
    junction.eustonGordon,[195,-145],[267,-133],junction.eustonWoburn,[450,-108]],
  ['gowerPlace','Gower Place',3.7,junction.gowerPlaceWest,[47,-84],[87,-86],junction.gowerPlaceEast],
  ['quad','Main Quad',1.98,junction.quadGate,[18,0],[35,0],[46,0]],
  ['university','University Street',3.9,junction.universityCourt,junction.universityHuntley,junction.universityGower],
  ['torrington','Torrington Place',5,[-270,179],[-236,179],junction.torringtonCourt,[-104,180],[-53,182],
    junction.torringtonGower,junction.maletTorrington],
  ['byng','Byng Place',4.4,junction.maletTorrington,[88,192],junction.byngGordon,junction.byngTorrington,
    [153,175],junction.byngWoburn],
  ['maletPlace','Malet Place',2.6,junction.maletTorrington,[56,171],[53,139],[52,107],[49,83]],
  ['malet','Malet Street',4.5,junction.maletTorrington,[59,251],[61,319],[65,373],junction.maletKeppel,
    junction.maletMontague,[79,563]],
  ['gordonNorth','Gordon Square',3.5,junction.gordonNW,[166,78],junction.gordonNE],
  ['gordonEast','Gordon Square',3.5,junction.gordonNE,[214,119],junction.gordonSE],
  ['gordonSouth','Gordon Square',3.8,junction.gordonSW,[162,153],junction.gordonSE,junction.bedfordTavistock],
  ['endsleigh','Endsleigh Gardens',4.2,[121,-63],[167,-59],[218,-56],[268,-51],[335,-51]],
  ['taviton','Taviton Street',3.5,[174,-58],[177,-11],[180,37],[182,79]],
  ['endsleighStreet','Endsleigh Street',3.4,[217,-56],[216,3],[215,44],junction.gordonNE],
  ['tavistockWest','Tavistock Square',4.6,[257,-52],[253,-2],[252,37],[251,90],junction.bedfordTavistock],
  ['tavistockSouth','Tavistock Place',5.2,junction.bedfordTavistock,[292,155],junction.tavistockWoburn,[390,158]],
  ['bedford','Bedford Way',4.65,junction.bedfordTavistock,[258,183],[260,221],[260,274],[257,317],
    [251,350],[239,368],junction.russellNW],
  ['woburn','Woburn Square',2.4,junction.byngWoburn,[164,198],[164,230],[167,248],[175,254],[185,255]],
  ['torringtonSq','Torrington Square',2.5,junction.byngTorrington,[125,201],[126,231],[126,264]],
  ['soasWalk','Torrington Square',2.2,[126,264],[126,286],[126,312],[126,331]],
  ['galleryWalk','Thornhaugh Street',2.3,[126,331],[153,331],[178,331],[199,331]],
  ['endsleighPlace','Endsleigh Place',3.5,junction.gordonNE,[232,79],[251,79]],
  ['tavistockNorth','Tavistock Square',3.25,[251,79],[292,78],[336,78]],
  ['woburnEast','Woburn Square',2.2,[214,152],[211,177],[201,183],[201,221],[201,239],[198,249],[185,255]],
  ['thornhaugh','Thornhaugh Street',2.7,[185,255],[190,263],[192,287],[196,321],[202,339],
    [206,357],[211,371],junction.russellNW],
  ['woburnPlace','Upper Woburn Place',6.6,junction.eustonWoburn,[335,-51],[336,43],[336,103],junction.tavistockWoburn],
  ['woburnLower','Woburn Place',6.2,junction.tavistockWoburn,[338,209],[334,262],[327,319],junction.russellNE],
  ['russellNorth','Russell Square',5.6,junction.russellNW,[259,376],[293,374],junction.russellNE],
  ['bernard','Bernard Street',4.15,junction.russellNE,[359,377],[398,381],[423,384],[450,388]],
  ['russellEast','Russell Square',6.3,junction.russellNE,[339,396],[344,425],[349,467],junction.russellSE,[358,556]],
  ['russellSouth','Russell Square',4.55,junction.russellSW,[255,525],[300,520],junction.russellSE],
  ['russellWest','Russell Square',4.8,junction.russellNW,[211,384],[201,404],[197.5,423],[200.5,454],
    [205,491],[211,513],junction.russellSW],
  ['keppel','Keppel Street',3.85,junction.gowerKeppel,[38,416],junction.maletKeppel],
  ['montague','Montague Place',4.4,junction.maletMontague,[116,511],[164,516],junction.russellSW],
  ['court','Tottenham Court Road',6.8,junction.eustonCourt,[-174,-87],junction.graftonCourt,[-171,-5],
    junction.universityCourt,[-164,111],junction.torringtonCourt,[-155,253],[-150,280],[-145,391],[-141,564]],
  ['warren','Warren Street',3.8,[-271,-92],[-235,-90],[-203,-87],[-174,-87]],
  ['grafton','Grafton Way',3.8,[-269,-40],[-233,-41],junction.graftonCourt,[-141,-35],
    junction.huntleyGrafton,[-50,-45],junction.graftonGower],
  ['huntley','Huntley Street',3.55,junction.huntleyGrafton,[-105,-6],junction.universityHuntley,
    [-103,119],[-104,180],[-103,238]],
  ['howland','Howland Street',3.8,[-271,55],[-234,54],junction.universityCourt],
  ['whitfield','Whitfield Street',3.35,[-234,-131],[-235,-90],[-233,-41],[-234,54],[-236,179],[-230,288],[-226,417]],
  ['capper','Capper Street',3.1,[-164,111],[-134,113],[-103,119]],
  ['chenies','Chenies Street',3.6,[-230,288],[-150,280],[-62,291],[5,303]],
  ['store','Store Street',3.8,[-145,391],[-105,395],[-55,402],junction.gowerKeppel]
];
const uclWays = streetDefinitions.map(([id, name, width, ...nodes]) => ({ id, name, path: street(nodes, width) }));
const londonRoads=new Map(uclWays.map(way=>[way.id,way.path]));
const uclStreetIndex=indexStreets(londonRoads.values());
const uclWayByPath=new Map(uclWays.map(({path,name})=>[path,name]));

const londonPaths=new Set(['quad','maletPlace','woburn','torringtonSq','soasWalk','galleryWalk','woburnEast','thornhaugh','studentPassage']);

export { junction, londonNorth, londonPaths, londonPoint, londonRoads, uclBounds, uclCampusInfo, uclStreetIndex, uclWayByPath, uclWays };
