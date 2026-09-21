import { afterEach, describe, expect, it } from 'vitest';
import { requireLaunch, smsLaunchEnabled, SmsError } from '../../api/sms/store.js';

const originalLaunchFlag = process.env.SMS_LAUNCH_ENABLED;

afterEach(() => {
  if (originalLaunchFlag === undefined) delete process.env.SMS_LAUNCH_ENABLED;
  else process.env.SMS_LAUNCH_ENABLED = originalLaunchFlag;
});

describe('SMS launch gate', () => {
  it('is enabled when SMS_LAUNCH_ENABLED is not set', () => {
    delete process.env.SMS_LAUNCH_ENABLED;
    expect(smsLaunchEnabled()).toBe(true);
    expect(() => requireLaunch()).not.toThrow();
  });

  it('is enabled when SMS_LAUNCH_ENABLED=true', () => {
    process.env.SMS_LAUNCH_ENABLED = 'true';
    expect(smsLaunchEnabled()).toBe(true);
    expect(() => requireLaunch()).not.toThrow();
  });

  it.each(['false', 'FALSE', '0', 'off', 'no'])(
    'can be stopped explicitly with %s',
    (value) => {
      process.env.SMS_LAUNCH_ENABLED = value;
      expect(smsLaunchEnabled()).toBe(false);
      expect(() => requireLaunch()).toThrow(SmsError);
      try {
        requireLaunch();
      } catch (error) {
        expect(error).toMatchObject({ status: 503 });
      }
    },
  );
});
