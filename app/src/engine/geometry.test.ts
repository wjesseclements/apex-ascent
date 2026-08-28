import { add, cross, dot, leftNormal, length, normalize, scale, sub } from './geometry';

describe('geometry', () => {
  it('vector arithmetic', () => {
    expect(add([1, 2], [3, 4])).toEqual([4, 6]);
    expect(sub([1, 2], [3, 4])).toEqual([-2, -2]);
    expect(scale([1, 2], 3)).toEqual([3, 6]);
    expect(dot([1, 2], [3, 4])).toBe(11);
    expect(length([3, 4])).toBe(5);
  });
  it('left normal is CCW in a y-up frame', () => {
    expect(leftNormal([1, 0])).toEqual([-0, 1]);
    expect(cross([1, 0], leftNormal([1, 0]))).toBeGreaterThan(0);
  });
  it('normalize', () => {
    expect(normalize([0, 2])).toEqual([0, 1]);
    expect(() => normalize([0, 0])).toThrow(/zero vector/);
  });
});
