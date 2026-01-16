
import { twilioService } from './server/services/TwilioService';
import { env } from './server/env';

async function testTwilio() {
  console.log('Testing Twilio configuration...');
  
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    console.error('Twilio credentials missing in environment');
    return;
  }

  try {
    console.log('Fetching available numbers (US)...');
    const numbers = await twilioService.listAvailableNumbers('415', 'US', 2);
    
    if (numbers.length > 0) {
      console.log(`Success! Found ${numbers.length} available numbers.`);
      console.log('First available:', numbers[0].phoneNumber, numbers[0].friendlyName);
    } else {
      console.log('Success! Connection worked but no numbers found (this is rare but possible).');
    }
    
  } catch (error: any) {
    console.error('Twilio test failed:', error.message);
  }
}

testTwilio();
