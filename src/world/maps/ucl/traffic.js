import { Shape } from '../../../core/shape.js';
import { londonTraffic } from '../../../data/traffic.js';
import { emitLondonTrafficVehicle } from '../../assets/traffic-vehicles.js';
import { along, pointDistance, travelTable } from '../../geometry.js';
import { junction, londonRoads } from './layout.js';

const paths = londonTraffic.routes.map(({ roads, loop, ...spec }) => {
  const segments = roads.map((id, i) => {
    const { rows } = londonRoads.get(id);
    if (!loop || i === 0) return rows.map(row => row.p);
    if (i > 1) return rows.map(row => row.p).reverse();
    const path = londonRoads.get(id), end = pointDistance(path, junction.russellSE);
    return [...rows.filter(row => row.distance < end).map(row => row.p), along(path, end)];
  });
  const path = travelTable(segments.flatMap((rows, index) => index ? rows.slice(1) : rows));
  return { ...spec, path, wide: londonRoads.get(roads[0]).width >= 5.9 };
});

export function buildLondonTraffic(actors) {
  const models = Object.fromEntries(['cab', 'bus'].map(kind => {
    const shape = new Shape();
    emitLondonTrafficVehicle({ kind }, { scenery: shape });
    return [kind, shape];
  }));
  for (const { path, count, speed, buses, wide } of paths) {
    for (let i = 0; i < count; i++) {
      const direction = i % 2 ? 1 : -1;
      const kind = buses && (i % londonTraffic.busEvery === 0 || i % londonTraffic.busEvery === 3) ? 'bus' : 'cab';
      actors.push({
        path, direction, speed, kind, model: models[kind],
        offset: -direction * (wide ? londonTraffic.wideLane : londonTraffic.lane),
        start: path.length * i / count, ...londonTraffic.dimensions[kind],
      });
    }
  }
}
