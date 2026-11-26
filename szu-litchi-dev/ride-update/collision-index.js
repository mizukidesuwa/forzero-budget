const OBSTACLE_MARGIN = 2;
let ridingObstacles = null;

function putObstacle(index, entry, x, z, halfWidth, halfDepth) {
  const minX=Math.floor((x-halfWidth)/ROAD_CELL), maxX=Math.floor((x+halfWidth)/ROAD_CELL);
  const minZ=Math.floor((z-halfDepth)/ROAD_CELL), maxZ=Math.floor((z+halfDepth)/ROAD_CELL);
  for (let column=minX; column<=maxX; column++) {
    for (let row=minZ; row<=maxZ; row++) {
      const key=column*4096+row;
      if (!index.has(key)) index.set(key,[]);
      index.get(key).push(entry);
    }
  }
}

function indexFootprint(index,entry,part,margin) {
  const w=part.w/2+margin, d=part.depth/2+margin;
  const c=Math.abs(part.c??1), s=Math.abs(part.s??0);
  putObstacle(index,entry,part.x,part.z,c*w+s*d,s*w+c*d);
}

function indexRidingObstacles(region) {
  const buildings=new Map(), trees=new Map(), fixtures=new Map(), city=new Map();
  const lots=region==='ucl'?uclBuildings:[...campus,...campusFixtures];
  // Keep the original order for overlapping footprints. Include the full rotated bounds.
  for (const lot of lots) {
    for (const part of lot.parts??[lot]) {
      indexFootprint(buildings,{lot,part},part,OBSTACLE_MARGIN);
    }
  }
  for (const tree of treeSites) putObstacle(trees,tree,tree.x,tree.z,.31,.31);
  if(region==='ucl') for(const lot of uclFixtures) indexFootprint(fixtures,lot,lot,.28);
  if(region==='szu') for(const b of citySolid) putObstacle(city,b,b.x,b.z,b.w/2+.34,b.d/2+.34);
  return {region,buildings,trees,fixtures,city};
}

function uclFixtureAt(x,z) {
  const nearby=ridingObstacles?.region==='ucl'?ridingObstacles.fixtures.get(streetCell(x,z)):uclFixtures;
  return nearby?.some(lot=>closeToBlock(x,z,lot,.28))??false;
}

function treeBlocks(x,z,margin) {
  const candidates=ridingObstacles?.region===activeCampus?ridingObstacles.trees.get(streetCell(x,z)):treeSites;
  return candidates?.some(tree=>Math.abs(tree.x-x)<margin && Math.abs(tree.z-z)<margin)??false;
}
