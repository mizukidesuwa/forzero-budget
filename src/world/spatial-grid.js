// Small deterministic uniform grid for broad-phase world queries.
// Callers keep their exact distance or footprint test after querying.
export function spatialCellKey(x, z, cellSize = 32) {
  const ix = Math.floor(x / cellSize), iz = Math.floor(z / cellSize);
  return `${ix},${iz}`;
}

export function createSpatialGrid(cellSize = 32) {
  const cells = new Map();
  const add = (item, x, z, radius = 0) => {
    const minX = Math.floor((x - radius) / cellSize), maxX = Math.floor((x + radius) / cellSize);
    const minZ = Math.floor((z - radius) / cellSize), maxZ = Math.floor((z + radius) / cellSize);
    for (let ix = minX; ix <= maxX; ix++) for (let iz = minZ; iz <= maxZ; iz++) {
      const key = `${ix},${iz}`;
      let bucket = cells.get(key);
      if (!bucket) cells.set(key, bucket = []);
      bucket.push(item);
    }
    return item;
  };
  const query = (x, z, radius = 0) => {
    const minX = Math.floor((x - radius) / cellSize), maxX = Math.floor((x + radius) / cellSize);
    const minZ = Math.floor((z - radius) / cellSize), maxZ = Math.floor((z + radius) / cellSize);
    const found = new Set();
    for (let ix = minX; ix <= maxX; ix++) for (let iz = minZ; iz <= maxZ; iz++) {
      for (const item of cells.get(`${ix},${iz}`) ?? []) found.add(item);
    }
    return [...found];
  };
  return Object.freeze({ cellSize, add, query, size: () => cells.size });
}
