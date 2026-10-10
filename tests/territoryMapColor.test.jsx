// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getScoreColor } from '../src/components/territory/InteractiveProviderMap';

describe('territory map marker colour', () => {
  it('is teal for everyone with score colouring off, and grey only for unscored providers with it on', () => {
    expect(getScoreColor(null, false)).toBe('#0d9488');
    expect(getScoreColor(90, false)).toBe('#0d9488');
    expect(getScoreColor(null, true)).toBe('#94a3b8');
    expect(getScoreColor(90, true)).toBe('#16a34a');
    expect(getScoreColor(10, true)).toBe('#ef4444');
  });
});
