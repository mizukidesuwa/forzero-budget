// @ts-check
import { terrainStepRules } from '../data/surfaces.js';

/**
 * Detects upward discontinuities along one horizontal movement.
 * @param {number} distance Horizontal distance in world meters.
 * @param {number} startHeight
 * @param {number} endHeight
 * @param {(fraction: number) => number} heightAt Height of the riding surface along the movement.
 * @returns {boolean}
 */
export function crossesTerrainStep(distance, startHeight, endHeight, heightAt) {
  if (distance === 0) return false;
  const { maxStepUp, probeSpacing, refinementSpacing } = terrainStepRules;

  /**
   * A smooth slope spreads its rise across smaller intervals. A step retains its rise.
   * @param {number} from
   * @param {number} to
   * @param {number} fromHeight
   * @param {number} toHeight
   * @returns {boolean}
   */
  function hasStep(from, to, fromHeight, toHeight) {
    if (toHeight <= fromHeight + maxStepUp) return false;
    if ((to - from) * distance <= refinementSpacing) return true;
    const middle = (from + to) / 2;
    const height = heightAt(middle);
    return hasStep(from, middle, fromHeight, height) || hasStep(middle, to, height, toHeight);
  }

  const probes = Math.ceil(distance / probeSpacing);
  let from = 0;
  let fromHeight = startHeight;
  for (let probe = 1; probe <= probes; probe++) {
    const to = probe / probes;
    const toHeight = probe === probes ? endHeight : heightAt(to);
    if (hasStep(from, to, fromHeight, toHeight)) return true;
    from = to;
    fromHeight = toHeight;
  }
  return false;
}
