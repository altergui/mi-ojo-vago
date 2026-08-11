import { describe, expect, it } from 'vitest';
import { hasFullName } from './SyncPage';

describe('hasFullName', () => {
  it('rejects a single word', () => {
    expect(hasFullName('Juan')).toBe(false);
  });

  it('rejects empty/whitespace-only input', () => {
    expect(hasFullName('')).toBe(false);
    expect(hasFullName('   ')).toBe(false);
  });

  it('accepts first + last name', () => {
    expect(hasFullName('Juan Pérez')).toBe(true);
  });

  it('tolerates leading/trailing/collapsed whitespace', () => {
    expect(hasFullName('  Juan   Pérez  ')).toBe(true);
  });

  it('accepts more than 2 words', () => {
    expect(hasFullName('Juan Martín Pérez López')).toBe(true);
  });
});
