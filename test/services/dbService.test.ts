import { beforeEach, describe, expect, it } from 'vitest';
import { dbService } from '../../services/dbService';

describe('dbService.getAuthHeaders', () => {
  beforeEach(() => {
    dbService.setAuthContext({ userId: undefined, impersonationToken: undefined });
  });

  it('returns auth headers for user and impersonation', () => {
    dbService.setAuthContext({
      userId: 'user-1',
      impersonationToken: 'imp-1',
    });

    expect(dbService.getAuthHeaders()).toEqual({
      'x-user-id': 'user-1',
      'x-impersonation-token': 'imp-1',
    });
  });

  it('includes content type when requested', () => {
    dbService.setAuthContext({ userId: 'user-2' });

    expect(dbService.getAuthHeaders(true)).toEqual({
      'Content-Type': 'application/json',
      'x-user-id': 'user-2',
    });
  });
});
