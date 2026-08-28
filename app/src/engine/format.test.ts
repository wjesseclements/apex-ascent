import { formatLapTime, formatSpeedKmh, formatSpeedMult } from './format';

describe('format', () => {
  it('lap times', () => {
    expect(formatLapTime(16.183333)).toBe('16.183');
    expect(formatLapTime(65.1234)).toBe('1:05.123');
    expect(formatLapTime(0)).toBe('0.000');
    expect(formatLapTime(-1)).toBe('—');
    expect(formatLapTime(NaN)).toBe('—');
  });
  it('speed and multiplier', () => {
    expect(formatSpeedKmh(27.7)).toBe('100');
    expect(formatSpeedMult(0.25)).toBe('0.25×');
    expect(formatSpeedMult(1)).toBe('1×');
  });
});
