import { describe, expect, it } from 'vitest';
import {
  inferRequestedDepartment,
  inferSpokenTransfer,
  looksLikeTransferCommit,
} from '../api/voice/spoken-transfer';

describe('spoken transfer intent', () => {
  it('commits connecting/transfer sentences to a department', () => {
    expect(inferSpokenTransfer('Connecting you with sales now.')).toBe('sales');
    expect(inferSpokenTransfer('Let me get Jordan on the line.')).toBe(
      'recruiting',
    );
    expect(inferSpokenTransfer("I'll send you over to Julian in partnerships.")).toBe(
      'partner',
    );
  });

  it('does not treat a permission question as a commit', () => {
    expect(
      looksLikeTransferCommit('Would you like me to transfer you to sales?'),
    ).toBe(false);
    expect(inferSpokenTransfer('Can I transfer you to support?')).toBe(null);
  });

  it('reads a caller request without a commit phrase', () => {
    expect(inferRequestedDepartment('Transfer me to sales')).toBe('sales');
    expect(inferRequestedDepartment('I want the white-label partner program')).toBe(
      'partner',
    );
  });
});
