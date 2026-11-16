const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const url = require('url');
const readline = require('readline');

// Node version check at startup
const majorVersion = parseInt(process.version.slice(1).split('.')[0], 10);
if (majorVersion < 18) {
  console.error(`Error: Node.js version 18 or higher is required. Current version: ${process.version}`);
  process.exit(1);
}

const envPath = path.join(__dirname, '../.env');
const forceMode = process.argv.includes('--force');
const isCI = !process.stdin.isTTY;

// Helper to ask questions
function askQuestion(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Custom dotenv parser
function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const firstEquals = trimmed.indexOf('=');
      if (firstEquals !== -1) {
        const key = trimmed.substring(0, firstEquals).trim();
        let val = trimmed.substring(firstEquals + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }
  });
  return env;
}

// Check health of API
function checkHealth(apiUrlVal) {
  return new Promise((resolve) => {
    if (!apiUrlVal || (!apiUrlVal.startsWith('http://') && !apiUrlVal.startsWith('https://'))) {
      resolve({ reachable: false, isRelative: true });
      return;
    }

    const healthUrl = `${apiUrlVal}/health`.replace(/([^:]\/)\/+/g, "$1/"); // Normalize double slashes
    const parsedUrl = url.parse(healthUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      timeout: 3000
    }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve({ reachable: true, isRelative: false });
      } else {
        resolve({ reachable: false, isRelative: false });
      }
    });

    req.on('error', () => {
      resolve({ reachable: false, isRelative: false });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false, isRelative: false });
    });
  });
}

// Print ASCII summary table
function printSummaryTable(data) {
  console.log('\n=== Environment Configuration Summary ===');
  console.log('┌' + '─'.repeat(22) + '┬' + '─'.repeat(42) + '┬' + '─'.repeat(16) + '┐');
  console.log('│ ' + 'Key'.padEnd(20) + ' │ ' + 'Value'.padEnd(40) + ' │ ' + 'Source'.padEnd(14) + ' │');
  console.log('├' + '─'.repeat(22) + '┼' + '─'.repeat(42) + '┼' + '─'.repeat(16) + '┤');
  for (const row of data) {
    const keyStr = row.key.padEnd(20);
    let valStr = row.value || '';
    if (valStr.length > 37) {
      valStr = valStr.substring(0, 37) + '...';
    }
    valStr = valStr.padEnd(40);
    const srcStr = row.source.padEnd(14);
    console.log(`│ ${keyStr} │ ${valStr} │ ${srcStr} │`);
  }
  console.log('└' + '─'.repeat(22) + '┴' + '─'.repeat(42) + '┴' + '─'.repeat(16) + '┘\n');
}

async function run() {
  const existingEnv = parseEnv(envPath);
  
  // Merge provider-injected process.env settings if available
  const requiredKeys = ['VITE_API_URL', 'VITE_APP_NAME'];
  requiredKeys.forEach(key => {
    if (process.env[key] !== undefined && process.env[key] !== null && process.env[key].trim() !== '') {
      existingEnv[key] = process.env[key];
    }
  });

  const finalEnv = { ...existingEnv };
  const summary = [];

  // Check if we can run in silent check-only mode
  if (!forceMode && fs.existsSync(envPath)) {
    const allKeysPresent = requiredKeys.every(k => existingEnv[k] !== undefined && existingEnv[k] !== null && existingEnv[k].trim() !== '');
    if (allKeysPresent) {
      console.log("\x1b[32m%s\x1b[0m", "✓ Environment already configured.");
      process.exit(0);
    }
  }

  console.log(`\x1b[36m%s\x1b[0m`, `=== Vastrams Frontend Environment Setup ===`);
  if (isCI) {
    console.log(`[CI/Non-Interactive Mode detected. Skipping prompts and using defaults...]`);
  }

  // 1. VITE_API_URL
  let apiUrlVal = existingEnv['VITE_API_URL'];
  if (!forceMode && apiUrlVal) {
    summary.push({ key: 'VITE_API_URL', value: apiUrlVal, source: 'existing' });
  } else {
    if (isCI) {
      apiUrlVal = apiUrlVal || '/api';
      summary.push({ key: 'VITE_API_URL', value: apiUrlVal, source: existingEnv['VITE_API_URL'] ? 'existing' : 'default' });
    } else {
      const promptDefault = apiUrlVal || '/api';
      const ans = await askQuestion(`Enter VITE_API_URL [${promptDefault}]: `);
      apiUrlVal = ans || promptDefault;
      summary.push({ key: 'VITE_API_URL', value: apiUrlVal, source: ans ? 'user-provided' : (existingEnv['VITE_API_URL'] ? 'existing' : 'default') });
    }
  }
  finalEnv['VITE_API_URL'] = apiUrlVal;

  // 2. VITE_APP_NAME
  let appNameVal = existingEnv['VITE_APP_NAME'];
  if (!forceMode && appNameVal) {
    summary.push({ key: 'VITE_APP_NAME', value: appNameVal, source: 'existing' });
  } else {
    if (isCI) {
      appNameVal = appNameVal || 'Vastrams';
      summary.push({ key: 'VITE_APP_NAME', value: appNameVal, source: existingEnv['VITE_APP_NAME'] ? 'existing' : 'default' });
    } else {
      const promptDefault = appNameVal || 'Vastrams';
      const ans = await askQuestion(`Enter VITE_APP_NAME [${promptDefault}]: `);
      appNameVal = ans || promptDefault;
      summary.push({ key: 'VITE_APP_NAME', value: appNameVal, source: ans ? 'user-provided' : (existingEnv['VITE_APP_NAME'] ? 'existing' : 'default') });
    }
  }
  finalEnv['VITE_APP_NAME'] = appNameVal;

  // Validate API URL Health
  if (apiUrlVal) {
    console.log("Checking backend health reachable status...");
    const health = await checkHealth(apiUrlVal);
    if (health.isRelative) {
      console.log(`Note: VITE_API_URL is a relative path (${apiUrlVal}). Skipping health check.`);
    } else if (health.reachable) {
      console.log(`\x1b[32m%s\x1b[0m`, `Backend health check succeeded: Reachable at ${apiUrlVal}/health ✅`);
    } else {
      console.log(`\x1b[33m%s\x1b[0m`, `Warning: backend not reachable at ${apiUrlVal}/health — verify before running the app.`);
    }
  }

  // Print Summary Table
  printSummaryTable(summary);

  // Write merged variables back to .env
  let envString = '';
  const managedKeys = new Set(requiredKeys);

  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        envString += line + '\n';
      } else {
        const firstEquals = trimmed.indexOf('=');
        if (firstEquals !== -1) {
          const key = trimmed.substring(0, firstEquals).trim();
          if (!managedKeys.has(key)) {
            envString += line + '\n';
          }
        } else {
          envString += line + '\n';
        }
      }
    });
  }

  // Now append managed keys
  envString += '\n# Generated / Managed by setup-env.js\n';
  requiredKeys.forEach(key => {
    envString += `${key}=${finalEnv[key]}\n`;
  });

  fs.writeFileSync(envPath, envString.trim() + '\n', 'utf-8');
  console.log(`\x1b[32m%s\x1b[0m`, `SUCCESS: Frontend environment file configured successfully at frontend/.env!\n`);
}

run().catch(err => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
