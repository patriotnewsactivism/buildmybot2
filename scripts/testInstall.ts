// import { fetch } from 'undici';

async function testInstall() {
  const baseUrl = 'http://localhost:3001';
  let cookie = '';

  // 1. Login
  console.log('Logging in...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'mreardon@wtpnews.org',
      password: 'any'
    })
  });

  if (!loginRes.ok) {
    console.error('Login failed:', await loginRes.text());
    return;
  }

  const setCookie = loginRes.headers.get('set-cookie');
  if (setCookie) {
    cookie = setCookie.split(';')[0];
    console.log('Logged in. Cookie:', cookie);
  } else {
    console.error('No cookie returned');
    return;
  }

  // 2. Get Templates
  console.log('Fetching templates...');
  const templatesRes = await fetch(`${baseUrl}/api/templates`);
  const templates = await templatesRes.json() as any[];

  if (templates.length === 0) {
    console.error('No templates found');
    return;
  }

  const templateId = templates[0].id;
  console.log(`Trying to install template: ${templateId} (${templates[0].name})`);

  // 3. Install Template
  const installRes = await fetch(`${baseUrl}/api/templates/${templateId}/install`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie
    }
  });

  const result = await installRes.json();
  console.log('Install Result:', JSON.stringify(result, null, 2));
}

testInstall();
