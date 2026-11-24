export const WEEKLY_SEED_PATTERN = /^[SU]\d-W\d{8}$/;
export const WIND_LABELS = ['偏西风', '西北风', '偏北风', '东北风', '偏东风', '东南风', '偏南风', '西南风'];
export const WEEKLY_WEATHERS = ['day', 'sunset', 'night', 'rain'];

export const puddleCourseStations = {
  szu: [['libraries', .13, .32, .61, .83], ['lakes', .16, .39, .67], ['lixiang-park', .23, .49, .75]],
  ucl: [['quad-sprint', .18, .40, .69], ['square-circuit', .17, .38, .63, .86], ['store-museum-gp', .24, .49, .76]],
  shunde: [['qingyun-lake', .075, .18, .30, .42, .53, .66, .79, .91], ['shenbu-climb', .12], ['shenbu-descent', .90]],
};

export const puddleRadius = { base: 1.06, spread: .12, repeats: 3 };
export const customWindLimits = { maxSpeed: 15, lastDirection: 7 };
