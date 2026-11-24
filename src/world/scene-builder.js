import { withRandom } from '../core/math.js';
import { worldState } from '../core/state.js';
import { initCourseBenchmarks } from '../race/records.js';
import { indexRidingObstacles, resetStreetIndex } from './collision-index.js';
import { clearWorldShapes, sceneLists } from './geometry.js';
import { buildParkWorld, shundeCampusInfo, shundeCourses } from './maps/shunde.js';
import { campusUrbanWorld, szuCampusInfo, szuCourses } from './maps/szu.js';
import { buildUclWorld, londonCourses, uclCampusInfo } from './maps/ucl.js';

export const campuses = {
  szu: szuCampusInfo,
  ucl: uclCampusInfo,
  shunde: shundeCampusInfo,
};

export const courses = szuCourses;

export const coursesByCampus = {
  szu: szuCourses,
  ucl: londonCourses,
  shunde: shundeCourses,
};

export const courseByCampus = Object.fromEntries(
  Object.entries(coursesByCampus).map(([key, events]) => [key, events[0]]),
);

worldState.campuses = campuses;
worldState.coursesByCampus = coursesByCampus;

initCourseBenchmarks(szuCourses);
initCourseBenchmarks([...londonCourses, ...shundeCourses]);

export function buildRidingScene(campus, { legacyUclFence = false } = {}) {
  worldState.trafficSceneRevision++;
  worldState.ridingObstacles = null;
  resetStreetIndex();
  clearWorldShapes();
  for (const items of sceneLists) items.length = 0;
  withRandom(campus === 'ucl' ? 248091 : 30986, () => {
    if (campus === 'shunde') buildParkWorld();
    else if (campus === 'ucl') buildUclWorld(legacyUclFence);
    else campusUrbanWorld();
    worldState.ridingObstacles = indexRidingObstacles(campus);
  });
}
