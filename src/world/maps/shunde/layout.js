import { ROAD_Y, TAU } from '../../../core/math.js';
import { indexStreets, street, travelTable } from '../../geometry.js';

// Local metres. +x points east and +z south. Control points describe the compressed ride,
// not a surveyed GPX. The straight crossing has an explicit longitudinal coordinate.
export const parkNodes = [[0, 0], [-25, 0], [-44, 12], [-61, 37], [-93, 58], [-117, 95],
  [-122, 136], [-142, 158], [-158, 190], [-151, 229], [-125, 254], [-82, 272], [-46, 279],
  [-16, 266], [12, 271], [42, 296], [68, 302], [89, 283], [105, 250], [126, 222],
  [138, 206], [153, 186], [168, 166], [180, 150], [186, 131], [175, 112], [143, 99],
  [114, 85], [91, 84], [66, 94], [45, 90], [28, 68], [31, 44], [47, 26], [46, 10], [27, 0]];
export const parkSpline = street([parkNodes.at(-1), ...parkNodes, parkNodes[0], parkNodes[1]], 4);
export const parkPath = travelTable(parkSpline.rows.slice(24, -24).map(row => row.p), 4);
export const parkSegments = indexStreets([parkPath]);
export const parkTower = [59, 55], parkPavilion = [-4, 149];
export const pavilionWalk = street([parkNodes[30], [40, 97], [26, 113], [14, 120], [3, 132], parkPavilion], 1.4);
export const pavilionWalkIndex = indexStreets([pavilionWalk]);
export const pavilionDeckY = 1.72;
export const pavilionRim = Array.from({ length: 8 }, (_, i) => {
  const angle = i * TAU / 8;
  return [parkPavilion[0] + 6.3 * Math.cos(angle), parkPavilion[1] + 6.3 * Math.sin(angle)];
});
export const parkBounds = { minX: -162, maxX: 460, minZ: -56, maxZ: 306 };
export const parkHills = [[-255, 210, 69, 76, 30], [-222, 340, 79, 59, 45], [-73, 398, 95, 66, 32],
  [252, 263, 48, 52, 16], [520, 42, 37, 49, 14]];
export const shundeCampusInfo = {
  name: '佛山顺德 · 顺峰山公园', station: '牌坊广场', arrival: [10, ROAD_Y, 0], heading: Math.PI, bounds: parkBounds,
};

export const mountainUp = street([parkNodes[26], [148, 81], [166, 65], [194, 49], [224, 33], [252, 32],
  [281, 43], [312, 68], [331, 89], [327, 107], [306, 112], [279, 100], [260, 103], [258, 122],
  [282, 143], [315, 156], [350, 159], [367, 145], [383, 129], [408, 112], [430, 103]], 3.65);
export const mountainDown = street([[430, 103], [451, 92], [457, 73], [447, 54], [410, 35], [377, 16],
  [356, -1], [330, -13], [300, -12], [272, 1], [244, 6], [214, -9], [180, -30], [143, -48],
  [111, -45], [83, -15], [66, 8], parkNodes[34]], 4.15);
export const mountainRoads = [
  {
    path: mountainUp, profile: [[0, 0], [38, 0], [100, 4], [178, 10], [217, 11.7], [290, 17.5],
      [333, 19.2], [408, 26], [483, 33.2], [mountainUp.length - 18, 34], [mountainUp.length, 34]],
    gravel: [[138, 205], [269, 355]], color: '#4b513e',
  },
  {
    path: mountainDown, profile: [[0, 34], [22, 34], [87, 31], [150, 25], [211, 20],
      [263, 17], [325, 10], [385, 4], [mountainDown.length - 43, 0], [mountainDown.length, 0]],
    gravel: [[122, 202], [278, 328]], color: '#4d5647',
  },
];
export const mountainRoadByPath = new Map(mountainRoads.map(lane => [lane.path, lane]));
export const mountainIndex = indexStreets(mountainRoads.map(lane => lane.path));

export const shundeHighRiskShortcuts = [
  {
    name: '牌坊东弯窄切线',
    firm: true,
    width: 1.65,
    points: [[34.0, 39.5], [38.2, 27.5], [40.2, 16.0], [39.6, 5.2]],
    posts: [[36.7, 27.8], [39.7, 27.2], [38.7, 16.0], [41.7, 16.0]],
  },
  {
    name: '神步山林间土坡捷径',
    firm: false,
    width: 1.65,
    points: [[328.5, 105.0], [313.0, 106.5], [294.0, 106.8], [274.5, 107.2], [258.5, 107.7]],
    profile: [14.65, 19.10],
    posts: [[313.2, 105.0], [312.8, 108.0], [274.7, 105.7], [274.3, 108.7]],
  },
  {
    name: '下山坡脚林荫斜切线',
    firm: true,
    width: 1.65,
    points: [[130.1, -49.6], [112.5, -36.5], [96.5, -22.0], [76.8, -6.2]],
    profile: [2.77, 0],
    posts: [[113.5, -35.3], [111.5, -37.7], [97.5, -20.8], [95.5, -23.2]],
  },
];
