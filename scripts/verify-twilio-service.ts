import { twilioService } from '../server/services/TwilioService';

console.log('Verifying TwilioService...');

if (typeof twilioService.listAvailableNumbers === 'function') {
  console.log('✅ listAvailableNumbers is a function');
} else {
  console.error('❌ listAvailableNumbers is missing');
  process.exit(1);
}

if (typeof twilioService.purchaseNumber === 'function') {
  console.log('✅ purchaseNumber is a function');
} else {
  console.error('❌ purchaseNumber is missing');
  process.exit(1);
}

if (typeof twilioService.releaseNumber === 'function') {
  console.log('✅ releaseNumber is a function');
} else {
  console.error('❌ releaseNumber is missing');
  process.exit(1);
}

console.log('TwilioService structure verified.');
