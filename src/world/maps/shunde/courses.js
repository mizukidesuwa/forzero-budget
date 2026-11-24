import { joinTrack, makeCourse } from '../../geometry.js';
import { mountainDown, mountainRoads, mountainUp, parkNodes, parkPath } from './layout.js';

export const parkStops = [[0, '顺峰山公园牌坊'], [4, '桂海芳丛'], [9, '西岸林荫'], [14, '南岸开阔段'],
  [21, '伏波桥'], [29, '青云塔山脚'], [parkNodes.length, '牌坊冲线']];

export function createShundeCourses({ mountainHeight, parkHeight }) {
  function makeMountainCourse(index, id, name, description, from, to, checks) {
    const lane = mountainRoads[index], distances = [from, ...checks.map(([d]) => d), to];
    const path = joinTrack([{ path: lane.path, start: from, end: to }], []);
    const labels = checks.map(([, label]) => label);
    const spec = distances.map((d, i) => [i === distances.length - 1 ? path.length : d - from,
      i === 0 ? (index === 0 ? '伏波桥侧坡脚' : '神步山观景台')
        : labels[i - 1] ?? (index === 0 ? '神步山观景台' : '牌坊侧坡脚'), lane.path.width - .30]);
    const event = makeCourse(id, name, description, path, spec, path.length, {
      absolute: true, campus: 'shunde', thresholds: [.965, 1.12, 1.32],
    });
    const profile = [];
    let gain = 0, loss = 0, previous = null;
    for (const { distance, p: [x, , z] } of path.rows) {
      const h = mountainHeight(x, z);
      if (previous !== null) { gain += Math.max(0, h - previous); loss += Math.max(0, previous - h); }
      profile.push([distance, h]); previous = h;
    }
    return Object.assign(event, { elevation: { profile, gain, loss } });
  }

  function makeParkEnduranceCourse() {
    const starts = [], d26 = parkPath.rows[26 * 24].distance, d34 = parkPath.rows[34 * 24].distance;
    const path = joinTrack([
      { path: parkPath, start: 0, end: d26 },
      { path: mountainUp, start: 0, end: mountainUp.length },
      { path: mountainDown, start: 0, end: mountainDown.length },
      { path: parkPath, start: d34, end: parkPath.length },
    ], starts);
    const upBase = path.rows[starts[1]].distance, dnBase = path.rows[starts[2]].distance;
    const spec = [
      [0, '顺峰山公园牌坊', 3.91],
      [parkPath.rows[4 * 24].distance, '桂海芳丛', 3.91],
      [parkPath.rows[9 * 24].distance, '西岸林荫', 3.91],
      [parkPath.rows[21 * 24].distance, '伏波桥', 3.11],
      [upBase + 26, '伏波桥北进山', 3.35],
      [upBase + 340, '林中折返', 3.35],
      [dnBase + 9, '神步山观景台', 3.85],
      [dnBase + 304, '下山碎石弯', 3.85],
      [path.length, '牌坊冲线', 3.91],
    ];
    const event = makeCourse('shunde-endurance', '顺峰山环山耐力赛',
      '从牌坊出发经青云湖与九孔伏波桥，进山攀登神步山观景台再高速下山冲回牌坊，串联平路巡航、爬坡与碎石控车（也可尝试高风险窄切捷径）。',
      path, spec, path.length, { absolute: true, campus: 'shunde', thresholds: [.965, 1.12, 1.30] });
    const profile = [];
    let gain = 0, loss = 0, previous = null;
    for (const { distance, p: [x, , z] } of path.rows) {
      const h = parkHeight(x, z);
      if (previous !== null) { gain += Math.max(0, h - previous); loss += Math.max(0, previous - h); }
      profile.push([distance, h]); previous = h;
    }
    return Object.assign(event, { elevation: { profile, gain, loss } });
  }

  const parkCourse = makeCourse('qingyun-lake', '青云湖环线', '穿过牌坊，经桂海芳丛环湖，过九孔伏波桥，沿青云塔山脚回到广场。',
    parkPath, parkStops.map(([i, label]) => [parkPath.rows[i * 24].distance, label]), parkPath.length,
    { absolute: true, campus: 'shunde', thresholds: [.965, 1.11, 1.29] });

  const mountainCourses = [
    makeMountainCourse(0, 'shenbu-climb', '神步山爬坡赛', '从伏波桥侧上山，稳踩林荫碎石坡，过两组折返弯，在观景台冲线。',
      26, mountainUp.length - 9, [[104, '林荫缓坡'], [177, '碎石长坡'], [246, '山腰短平台'], [343, '林中折返'], [444, '山脊直坡']]),
    makeMountainCourse(1, 'shenbu-descent', '神步山下坡赛', '从观景台下山，过宽弯提速，提前为碎石连弯刹车，最后在接回湖岸前冲线。',
      13, mountainDown.length - 19, [[86, '山脊宽弯'], [159, '碎石收速区'], [236, '林间出弯'], [308, '连续碎石弯'], [399, '坡脚减速线']]),
  ];

  const parkEnduranceCourse = makeParkEnduranceCourse();

  const shundeCourses = [parkCourse, ...mountainCourses, parkEnduranceCourse];
  return { makeMountainCourse, makeParkEnduranceCourse, mountainCourses, parkCourse, parkEnduranceCourse, shundeCourses };
}
