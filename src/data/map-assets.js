// Static authoring data for the 2.2.0 map detail pass.
// The 2.1.2 map meshes remain the legacy base layer and are intentionally retained.

export const legacyMapAssetVersion = '2.1.2';
export const activeMapAssetVersion = '2.2.0';

// UCL's official Bloomsbury map shows formal square gardens, clipped edges and
// connected pedestrian courts rather than empty lawns. These style values are
// consumed by the pure asset emitter and do not add gameplay collision.
export const uclGardenDetailStyles = {
  'Gordon Square': { treeRows: 3, treeScale: 1.08, planter: '#b6a68f', paving: '#c4b7a2', crown: '#667d4e' },
  'Tavistock Square': { treeRows: 2, treeScale: .98, planter: '#b9aa93', paving: '#c7bca9', crown: '#6e8552' },
  'Woburn Square': { treeRows: 2, treeScale: .92, planter: '#b2a18b', paving: '#c3b6a1', crown: '#607b4a' },
  'Malet Street Gardens': { treeRows: 2, treeScale: .86, planter: '#a99883', paving: '#c0b29d', crown: '#617d4d' },
  'Friends’ Garden': { treeRows: 2, treeScale: .88, planter: '#ab9c87', paving: '#c1b49f', crown: '#6b824e' },
  'Russell Square': { treeRows: 3, treeScale: 1.14, planter: '#b4a38d', paving: '#c8bca8', crown: '#6b824d' },
};

// The official Bloomsbury campus map shows continuous perimeter terraces and
// compact court blocks around the formal squares. These generic infill lots
// fill the remaining undeveloped parcels while keeping the existing shop and
// landmark names untouched. They are deliberately placed away from the road
// centre lines and use the existing campus collision model.
export const uclUrbanInfillLots = [
  { id: 'north-gower-court', use: 'Bloomsbury terrace', x: -248, z: -150, w: 18, depth: 20, height: 12.5, style: 'brick', yaw: 0 },
  { id: 'west-euston-court', use: 'Bloomsbury terrace', x: -219, z: -72, w: 20, depth: 18, height: 12, style: 'stone', yaw: 0 },
  { id: 'howland-court', use: 'Bloomsbury terrace', x: -211, z: 86, w: 19, depth: 22, height: 11.5, style: 'brick', yaw: 0 },
  { id: 'torrington-court', use: 'Bloomsbury terrace', x: -208, z: 210, w: 22, depth: 18, height: 13, style: 'stone', yaw: 0 },
  { id: 'keppel-court', use: 'Bloomsbury terrace', x: -190, z: 408, w: 23, depth: 19, height: 12, style: 'brick', yaw: 0 },
  { id: 'gower-south-court', use: 'Bloomsbury terrace', x: 28, z: 535, w: 24, depth: 17, height: 11.5, style: 'stone', yaw: 0 },
  { id: 'russell-east-court', use: 'Bloomsbury terrace', x: 401, z: 334, w: 22, depth: 19, height: 13.5, style: 'stone', yaw: 0 },
  { id: 'russell-south-court', use: 'Bloomsbury terrace', x: 403, z: 542, w: 23, depth: 17, height: 12.5, style: 'brick', yaw: 0 },
  { id: 'tavistock-east-court', use: 'Bloomsbury terrace', x: 304, z: 111, w: 20, depth: 21, height: 11.5, style: 'stone', yaw: 0 },
  { id: 'woburn-east-court', use: 'Bloomsbury terrace', x: 226, z: 232, w: 19, depth: 18, height: 11, style: 'brick', yaw: 0 },
];

export const uclUrbanInfillStyles = {
  brick: { wall: '#9d6d5a', trim: '#d2b394', roof: '#59625c', window: '#526b70', base: '#806657' },
  stone: { wall: '#b9b09f', trim: '#ded3bb', roof: '#62685f', window: '#536d70', base: '#988d7b' },
};

// The campus sits inside a continuous Bloomsbury street wall. These shallow
// visual shells close the open sight lines beside the arrival turn and the
// central academic blocks without entering the gameplay collision layer.
export const uclStreetWallLots = [
  { id: 'arrival-west-court', x: -18, z: 95, width: 16, depth: 3.0, height: 13.6, yaw: 0, style: 'georgian' },
  { id: 'arrival-west-court-south', x: -18, z: 110, width: 16, depth: 3.0, height: 13.6, yaw: 0, style: 'stone' },
  { id: 'arrival-east-court', x: 38, z: 95, width: 10, depth: 3.0, height: 13.6, yaw: 0, style: 'stone' },
  { id: 'arrival-east-court-south', x: 41, z: 110, width: 10, depth: 3.0, height: 13.6, yaw: 0, style: 'georgian' },
  { id: 'arrival-east-court-north', x: 38, z: 86, width: 10, depth: 3.0, height: 13.6, yaw: 0, style: 'georgian' },
  { id: 'north-gower-court', x: -140, z: 30, width: 20, depth: 5.2, height: 14.2, yaw: 0, style: 'georgian' },
  { id: 'gower-west-court', x: -50, z: 100, width: 22, depth: 5.2, height: 14.6, yaw: 0, style: 'stone' },
  { id: 'quad-east-court', x: 40, z: 50, width: 18, depth: 4.8, height: 13.8, yaw: 0, style: 'stone' },
  { id: 'torrington-court-east', x: 58, z: 181, width: 24, depth: 5.2, height: 15.0, yaw: 0, style: 'stone' },
  { id: 'woburn-west-court', x: 90, z: 210, width: 22, depth: 5.0, height: 14.4, yaw: Math.PI / 2, style: 'georgian' },
  { id: 'soas-south-court', x: 80, z: 310, width: 24, depth: 5.2, height: 14.8, yaw: Math.PI / 2, style: 'stone' },
  { id: 'russell-west-court', x: 150, z: 370, width: 24, depth: 5.0, height: 15.2, yaw: Math.PI / 2, style: 'georgian' },
  { id: 'russell-south-court', x: 160, z: 500, width: 24, depth: 5.0, height: 15.2, yaw: 0, style: 'stone' },
  { id: 'tavistock-east-court', x: 260, z: 220, width: 22, depth: 5.0, height: 14.8, yaw: Math.PI / 2, style: 'georgian' },
  { id: 'woburn-east-court', x: 397, z: 216, width: 24, depth: 5.0, height: 15.2, yaw: 0, style: 'stone' },
];

export const uclStreetWallStyles = {
  georgian: {
    wall: '#8f5b49', ground: '#c7b9a7', trim: '#e0d4c2', roof: '#515756',
    window: '#4e6266', rail: '#303a37', planter: '#707d58',
  },
  stone: {
    wall: '#b8b09f', ground: '#d6cbb9', trim: '#e4dbc9', roof: '#656965',
    window: '#52676a', rail: '#3d4541', planter: '#73805d',
  },
};

export const uclArrivalCourtStyle = {
  wall: '#b9ab95', paving: '#c5b9a5', rail: '#4c574f',
  planter: '#7a6d56', crown: '#6f8555', trunk: '#675944',
  // These two gate-side beds are the single arrival planting source. Their
  // offsets are relative to the [11, 0] arrival anchor. Keep them outside
  // the paved arrival court so no planting footprint occupies the riding line.
  beds: [
    { xOffset: 6.8, zOffset: 31.5, width: 6.2, depth: 3.4, height: .68,
      ground: '#bfafa1', crown: ['#738057', '#82915e'] },
    { xOffset: 28.6, zOffset: 31.5, width: 6.2, depth: 3.4, height: .68,
      ground: '#bfafa1', crown: ['#738057', '#82915e'] },
  ],
};

// These existing street blocks are the best anchors for a denser Shenzhen
// frontage layer. The emitter adds facade depth and shade elements only.
export const szuFrontageDetailStyles = {
  tower: { frame: '#c0d0ca', glass: '#55757b', shade: '#6c918d', canopy: '#a98a68' },
  research: { frame: '#c9d0c3', glass: '#526f75', shade: '#6f8b7c', canopy: '#a27e5e' },
  housing: { frame: '#d0bda5', glass: '#647975', shade: '#8d9271', canopy: '#b27759' },
};

export const shundeGateDetailStyle = {
  stone: '#d1c5ad',
  trim: '#e4d6b7',
  rail: '#b9b7a6',
  roof: '#6f7c62',
  tile: '#a85b38',
};

export const mapDetailPerformanceBudget = {
  maxTriangleMultiplier: 1.10,
  maxMeshCellMultiplier: 1.10,
};
