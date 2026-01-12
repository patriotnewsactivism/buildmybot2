import axios from 'axios';
import dotenv from 'dotenv';
import { db } from '../server/db';
import { bots, organizations, users } from '../shared/schema';

// Load environment variables
dotenv.config();

const API_URL = process.env.VITE_API_URL || 'https://buildmybot2-production.up.railway.app';
const APP_URL = process.env.APP_BASE_URL || 'https://platform.buildmybot.app';

async function verifyDeployment() {
  console.log('🚀 Starting Deployment Verification...');
  console.log('-----------------------------------');
  console.log(`📡 API Target: ${API_URL}`);
  console.log(`🌐 Frontend Target: ${APP_URL}`);
  console.log('-----------------------------------');

  const results = {
    backend: false,
    frontend: false,
    database: false,
    apiRoutes: false,
  };

  // 1. Verify Backend Health
  try {
    console.log('\n1. Checking Backend Health...');
    const start = Date.now();
    const response = await axios.get(`${API_URL}/api/health`);
    const duration = Date.now() - start;

    if (response.status === 200) {
      console.log(`✅ Backend is ONLINE (${duration}ms)`);
      console.log(`   Version: ${response.data.version || 'Unknown'}`);
      console.log(`   Status: ${response.data.status || 'OK'}`);
      results.backend = true;
    } else {
      console.error(`❌ Backend returned status ${response.status}`);
    }
  } catch (error: any) {
    console.error(`❌ Backend connection failed: ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data)}`);
    }
  }

  // 2. Verify Frontend Availability
  try {
    console.log('\n2. Checking Frontend Availability...');
    const start = Date.now();
    const response = await axios.get(APP_URL);
    const duration = Date.now() - start;

    if (response.status === 200) {
      console.log(`✅ Frontend is REACHABLE (${duration}ms)`);
      results.frontend = true;
    } else {
      console.error(`❌ Frontend returned status ${response.status}`);
    }
  } catch (error: any) {
    console.error(`❌ Frontend connection failed: ${error.message}`);
  }

  // 3. Verify Database Connection (via Direct DB Access)
  try {
    console.log('\n3. Checking Database Connection...');
    const start = Date.now();
    const userCount = await db.select().from(users).limit(1);
    const duration = Date.now() - start;

    console.log(`✅ Database is CONNECTED (${duration}ms)`);
    console.log(`   Test Query: Retrieved ${userCount.length} users`);
    results.database = true;
  } catch (error: any) {
    console.error(`❌ Database connection failed: ${error.message}`);
  }

  // 4. Verify Critical API Routes
  if (results.backend) {
    try {
      console.log('\n4. Verifying Critical API Routes...');
      
      // Check Auth/Public Config
      const stripeKey = await axios.get(`${API_URL}/api/stripe/publishable-key`);
      if (stripeKey.status === 200 && stripeKey.data.publishableKey) {
        console.log('✅ Stripe Configuration: OK');
      } else {
        console.warn('⚠️ Stripe Configuration: Unexpected response');
      }

      // Check Templates (Public Route)
      const templates = await axios.get(`${API_URL}/api/templates?featured=true`);
      if (templates.status === 200 && Array.isArray(templates.data)) {
        console.log(`✅ Template Marketplace: OK (${templates.data.length} templates found)`);
        results.apiRoutes = true;
      } else {
        console.warn('⚠️ Template Marketplace: Unexpected response');
      }

    } catch (error: any) {
      console.error(`❌ API Route verification failed: ${error.message}`);
    }
  }

  console.log('\n-----------------------------------');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('-----------------------------------');
  console.log(`Backend API:    ${results.backend ? '✅ ONLINE' : '❌ OFFLINE'}`);
  console.log(`Frontend App:   ${results.frontend ? '✅ REACHABLE' : '❌ UNREACHABLE'}`);
  console.log(`Database:       ${results.database ? '✅ CONNECTED' : '❌ DISCONNECTED'}`);
  console.log(`API Routes:     ${results.apiRoutes ? '✅ FUNCTIONAL' : '❌ ISSUES DETECTED'}`);
  console.log('-----------------------------------');

  if (results.backend && results.frontend && results.database) {
    console.log('🚀 SYSTEM IS READY FOR LAUNCH');
    process.exit(0);
  } else {
    console.error('⚠️ SYSTEM HAS ISSUES - CHECK LOGS ABOVE');
    process.exit(1);
  }
}

verifyDeployment();
