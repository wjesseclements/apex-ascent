import { fitCamera, screenToWorld, worldToScreen } from './camera';

const bounds = { minX: -30, minY: -120, maxX: 110, maxY: 6 };

describe('camera', () => {
  it('fits bounds into the viewport with padding and centers them', () => {
    const cam = fitCamera(bounds, 1000, 800, 20);
    const [x0, y0] = worldToScreen(cam, bounds.minX, bounds.maxY); // top-left of world
    const [x1, y1] = worldToScreen(cam, bounds.maxX, bounds.minY); // bottom-right
    expect(x0).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(y0).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(x1).toBeLessThanOrEqual(1000 - 20 + 1e-9);
    expect(y1).toBeLessThanOrEqual(800 - 20 + 1e-9);
    expect((x0 + x1) / 2).toBeCloseTo(500, 9);
    expect((y0 + y1) / 2).toBeCloseTo(400, 9);
  });
  it('flips y: world up is screen up (smaller y)', () => {
    const cam = fitCamera(bounds, 1000, 800, 0);
    const [, low] = worldToScreen(cam, 0, 0);
    const [, high] = worldToScreen(cam, 0, 10);
    expect(high).toBeLessThan(low);
  });
  it('round-trips', () => {
    const cam = fitCamera(bounds, 640, 480, 12);
    for (const [x, y] of [
      [0, 0],
      [110, -120],
      [-30, 6],
      [42.5, -77.25],
    ]) {
      const [sx, sy] = worldToScreen(cam, x!, y!);
      const [wx, wy] = screenToWorld(cam, sx, sy);
      expect(wx).toBeCloseTo(x!, 9);
      expect(wy).toBeCloseTo(y!, 9);
    }
  });
  it('degenerate bounds and tiny viewports do not divide by zero', () => {
    const cam = fitCamera({ minX: 1, minY: 1, maxX: 1, maxY: 1 }, 10, 10, 20);
    expect(Number.isFinite(cam.scale)).toBe(true);
  });
});
