import { BET_STATUS } from '../constants';
import {
  acceptsEntries,
  allowsCancel,
  assertTransition,
  canTransition,
  isEscrowed,
  isTerminal,
} from '../betStateMachine';

describe('bet state machine', () => {
  it('allows the happy path open→locked→pending→resolved→settled', () => {
    expect(canTransition(BET_STATUS.OPEN, BET_STATUS.LOCKED)).toBe(true);
    expect(canTransition(BET_STATUS.LOCKED, BET_STATUS.PENDING_RESOLUTION)).toBe(true);
    expect(canTransition(BET_STATUS.PENDING_RESOLUTION, BET_STATUS.RESOLVED)).toBe(true);
    expect(canTransition(BET_STATUS.RESOLVED, BET_STATUS.SETTLED)).toBe(true);
  });

  it('forbids skipping straight to settled', () => {
    expect(canTransition(BET_STATUS.OPEN, BET_STATUS.SETTLED)).toBe(false);
    expect(() => assertTransition(BET_STATUS.OPEN, BET_STATUS.SETTLED)).toThrow();
  });

  it('lets a pending bet be disputed and then resolved', () => {
    expect(canTransition(BET_STATUS.PENDING_RESOLUTION, BET_STATUS.DISPUTED)).toBe(true);
    expect(canTransition(BET_STATUS.DISPUTED, BET_STATUS.RESOLVED)).toBe(true);
    expect(canTransition(BET_STATUS.DISPUTED, BET_STATUS.VOIDED)).toBe(true);
  });

  it('treats settled/cancelled/voided as terminal', () => {
    expect(isTerminal(BET_STATUS.SETTLED)).toBe(true);
    expect(isTerminal(BET_STATUS.CANCELLED)).toBe(true);
    expect(isTerminal(BET_STATUS.VOIDED)).toBe(true);
    expect(isTerminal(BET_STATUS.OPEN)).toBe(false);
  });

  it('only accepts entries while open', () => {
    expect(acceptsEntries(BET_STATUS.OPEN)).toBe(true);
    expect(acceptsEntries(BET_STATUS.LOCKED)).toBe(false);
  });

  it('only allows cancel before lock', () => {
    expect(allowsCancel(BET_STATUS.OPEN)).toBe(true);
    expect(allowsCancel(BET_STATUS.LOCKED)).toBe(false);
  });

  it('keeps chips escrowed from open through resolved', () => {
    expect(isEscrowed(BET_STATUS.OPEN)).toBe(true);
    expect(isEscrowed(BET_STATUS.RESOLVED)).toBe(true);
    expect(isEscrowed(BET_STATUS.SETTLED)).toBe(false);
    expect(isEscrowed(BET_STATUS.VOIDED)).toBe(false);
  });
});
