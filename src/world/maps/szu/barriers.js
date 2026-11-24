import { flyoverClearance } from '../../../data/traffic.js';
import { emitBarrier } from '../../assets/barriers.js';
import { courseFrame } from '../../geometry.js';
import { openStreets, szuRoadClosures } from './layout.js';
import { flyover, flyoverHeight } from './terrain.js';

export function emitSzuBarriers({ scenery, footprint }) {
  for (const { road, end, shoulder } of szuRoadClosures) {
    const { path } = openStreets[road];
    const { p, f, side } = courseFrame(path, end ? path.length - .45 : .45);
    const offset = (shoulder ?? 0) * (path.width + 1.6);
    const x = p[0] + side[0] * offset, z = p[2] + side[2] * offset;
    emitBarrier({ x, z, width: shoulder ? 1.6 : path.width * 2, yaw: Math.atan2(f[0], f[2]) }, { scenery, footprint });
  }
  const { path, half, from, to } = flyover;
  for (let distance = from; distance < to; distance += .5) {
    const height = flyoverHeight(distance);
    if (height <= flyoverClearance.accessHeight || height >= flyoverClearance.obstructionHeight) continue;
    const { p, f, side } = courseFrame(path, distance);
    // Mark both edges of the low-deck strip with short dividers under the deck.
    if (Math.floor((distance - from) * 2) % 7 !== 0 || height < .75) continue;
    for (const sign of [-1, 1]) {
      const x = p[0] + side[0] * half * sign, z = p[2] + side[2] * half * sign;
      emitBarrier({ x, z, width: 1.4, yaw: -Math.atan2(f[2], f[0]), kind: 'clearance' }, { scenery });
    }
  }
}
