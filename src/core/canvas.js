function createHeadlessCanvas() {
  const ctx = new Proxy({}, {
    get: (_, key) => (key === 'measureText' ? (text) => ({ width: String(text).length * 10 }) : () => {}),
  });
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
  };
}

export function signCanvas(width, height, paint) {
  const canvas = typeof document !== 'undefined' && document?.createElement
    ? document.createElement('canvas')
    : createHeadlessCanvas();
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  return canvas;
}
