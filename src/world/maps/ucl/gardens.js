import { campusFootprint, footprintCorners } from '../../geometry.js';
import { londonPoint } from './layout.js';

const [gordonX,gordonZ]=londonPoint(51.52426,-.13087);
const [tavistockX,tavistockZ]=londonPoint(51.52499,-.128997);
const [woburnX,woburnZ]=londonPoint(51.52333,-.12964);

const londonGardenLots=[
  ['Gordon Square',campusFootprint(gordonX,gordonZ,77,59)],
  ['Tavistock Square',campusFootprint(tavistockX,tavistockZ,67,63)],
  ['Woburn Square',campusFootprint(woburnX,woburnZ-2,24,56)],
  ['Malet Street Gardens',campusFootprint(83,359,19,69)],
  ['Friends’ Garden',campusFootprint(162,-102,29,51)]
];

// Russell Square garden perimeter, simplified from Historic England's registered garden polygon.
const russellGarden=[
  [51.52198,-.127444],[51.522054,-.127338],[51.522551,-.126135],[51.522569,-.125973],
  [51.522531,-.125694],[51.521754,-.124682],[51.521615,-.124612],[51.521449,-.124673],
  [51.520867,-.125911],[51.520835,-.126283],[51.520959,-.126605],[51.521636,-.127441],
  [51.521813,-.127513]
].map(([lat,lon])=>londonPoint(lat,lon));
const londonGardens=[
  ...londonGardenLots.map(([name,lot])=>({name,outline:footprintCorners(lot).map(([x,,z])=>[x,z])})),
  {name:'Russell Square',outline:russellGarden}
].map(garden=>{
  const {outline}=garden;
  return {...garden,center:outline.reduce(([x,z],[a,b])=>[x+a/outline.length,z+b/outline.length],[0,0])};
});

export const gordonNorthFence = {
  schemaVersion: 1,
  id: 'ucl.gordon-square.north-fence',
  asset: 'fixture.rail@1',
  from: londonGardens[0].outline[0],
  to: londonGardens[0].outline[1],
  gap: 3.7,
};

// Extra rails use map coordinates [x, z] in metres. Gap is the opening width.
export const extraGardenFences = [];

export { londonGardenLots, londonGardens, russellGarden };
