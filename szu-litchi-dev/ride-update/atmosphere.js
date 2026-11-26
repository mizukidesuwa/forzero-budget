const weatherChoices = {
  day: {
    name: '正午晴天',
    note: '标准抓地与清晰视野。',
    sun: normalize([-.55, .63, .54]),
    sunColor: [.52, .43, .30],
    fillLow: [.55, .65, .68],
    fillHigh: [.77, .82, .75],
    fog: [.737, .808, .812],
    fogDensity: .00205,
    skyLow: [.866, .858, .746],
    skyHigh: [.476, .690, .707],
    cloudColor: [.958, .931, .838],
    cloudAlpha: .64,
    sunGlow: [.20, .164, .088],
    headlight: 0,
    wetness: 0,
    gripScale: 1,
    brakeScale: 1,
    rain: false,
  },
  sunset: {
    name: '黄昏日落',
    note: '低角度暖色夕阳，标准路面抓地。',
    sun: normalize([.82, .34, .46]),
    sunColor: [.68, .35, .17],
    fillLow: [.36, .34, .44],
    fillHigh: [.68, .50, .42],
    fog: [.74, .56, .47],
    fogDensity: .00255,
    skyLow: [.95, .58, .36],
    skyHigh: [.27, .33, .53],
    cloudColor: [.97, .70, .51],
    cloudAlpha: .58,
    sunGlow: [.42, .20, .07],
    headlight: .18,
    wetness: 0,
    gripScale: 1,
    brakeScale: 1,
    rain: false,
  },
  night: {
    name: '夜骑灯光',
    note: '夜间低照度，开启随车前照灯。',
    sun: normalize([-.35, .72, .60]),
    sunColor: [.13, .17, .26],
    fillLow: [.14, .18, .25],
    fillHigh: [.20, .26, .36],
    fog: [.085, .115, .175],
    fogDensity: .0034,
    skyLow: [.12, .16, .25],
    skyHigh: [.035, .055, .11],
    cloudColor: [.22, .27, .38],
    cloudAlpha: .32,
    sunGlow: [.05, .07, .12],
    headlight: 1.0,
    wetness: 0,
    gripScale: 1,
    brakeScale: 1,
    rain: false,
  },
  rain: {
    name: '小雨湿地',
    note: '湿滑铺装降低抓地与制动，越野胎与渐进刹车更稳。',
    sun: normalize([.36, .74, .56]),
    sunColor: [.22, .24, .26],
    fillLow: [.42, .48, .52],
    fillHigh: [.56, .62, .66],
    fog: [.52, .58, .61],
    fogDensity: .0036,
    skyLow: [.58, .64, .67],
    skyHigh: [.34, .42, .48],
    cloudColor: [.66, .71, .74],
    cloudAlpha: .84,
    sunGlow: [.04, .05, .06],
    headlight: .25,
    wetness: 1.0,
    gripScale: .85,
    brakeScale: .87,
    rain: true,
  },
};

const knownWeather = id => Object.hasOwn(weatherChoices, id) ? id : 'day';
let activeWeatherId = 'day';
function currentWeather() { return weatherChoices[activeWeatherId] ?? weatherChoices.day; }
function setActiveWeather(id) {
  const next = knownWeather(id);
  if (activeWeatherId === next) return;
  activeWeatherId = next;
  if (typeof ui !== 'undefined' && ui.weatherOverlay) ui.weatherOverlay.hidden = !weatherChoices[next].rain;
}

function drawRainOverlay(canvas, speed, now) {
  if (!canvas || canvas.hidden) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(210, 232, 245, 0.30)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  const t = now * 0.001, streak = 14 + Math.min(18, Math.abs(speed) * 1.1), slant = -3.2;
  for (let i = 0; i < 36; i++) {
    const seed = i * 137.53;
    const x = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1 * w;
    const y = ((((Math.cos(seed * 1.7) * 23421.631) % 1 + 1) % 1 + t * (1.25 + (i % 5) * 0.14)) % 1) * (h + streak) - streak;
    ctx.moveTo(x, y);
    ctx.lineTo(x + slant, y + streak);
  }
  ctx.stroke();
}
