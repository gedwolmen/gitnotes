/**
 * E2E test data seed script.
 *
 * This script attempts to bootstrap the GitNotes app with test data for E2E testing.
 *
 * IMPORTANT: Full E2E testing requires GitHub authentication. Without a valid
 * GitHub token and repository, tests for note/todo/journal CRUD cannot pass.
 *
 * What this script does:
 * 1. Checks for E2E_GITHUB_TOKEN environment variable
 * 2. If found, attempts to configure a test repo via Maestro
 * 3. If not found, outputs clear instructions
 *
 * To run with auth:
 *   E2E_GITHUB_TOKEN=your_token yarn e2e:seed
 *
 * Note: The test accounts need the token to have access to a test repository.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const E2E_TOKEN = process.env.E2E_GITHUB_TOKEN ?? '';
const E2E_REPO = process.env.E2E_REPO || 'test-owner/test-repo';
const E2E_BRANCH = process.env.E2E_BRANCH || 'main';

interface SeedResult {
  success: boolean;
  message: string;
  configured?: {
    token: string;
    repo: string;
    branch: string;
  };
}

async function seedViaMaestro(): Promise<SeedResult> {
  const maestroBinary = path.join(process.env.HOME || '', '.maestro', 'bin', 'maestro');

  if (!fs.existsSync(maestroBinary)) {
    return {
      success: false,
      message: `Maestro binary not found at ${maestroBinary}. Please install Maestro first.`,
    };
  }

  // Create a setup flow that adds the repo
  const setupFlowPath = path.join(__dirname, '../.maestro-seed/setup-repo.yaml');
  const setupDir = path.dirname(setupFlowPath);
  if (!fs.existsSync(setupDir)) {
    fs.mkdirSync(setupDir, { recursive: true });
  }

  const flowContent = `# Seed flow for E2E testing
appId: com.xaventra.gitnotes
---
- launchApp:
    clearState: true

- tapOn:
    id: "tab-bar.*tab.press-SettingsTab"

- scrollUntilVisible:
    element:
      id: "settings.button.add-account"
    direction: DOWN
    timeout: 10000

- tapOn:
    id: "settings.button.add-account"

- inputText:
    id: "settings-modals.input.token"
    text: "${E2E_TOKEN}"

- tapOn:
    id: "settings-modals.button.add-manual-repo"
`;

  fs.writeFileSync(setupFlowPath, flowContent);

  return {
    success: true,
    message: `Seed flow written to ${setupFlowPath}`,
    configured: {
      token: E2E_TOKEN.substring(0, 4) + '...' + E2E_TOKEN.slice(-4),
      repo: E2E_REPO,
      branch: E2E_BRANCH,
    },
  };
}

async function main(): Promise<void> {
  console.log('GitNotes E2E Seed Script');
  console.log('========================\n');

  if (!E2E_TOKEN) {
    console.log('⚠️  No E2E_GITHUB_TOKEN environment variable found.');
    console.log('\nTo run E2E tests that require GitHub authentication:');
    console.log('  1. Create a GitHub Personal Access Token with repo scope');
    console.log('  2. Set it before running:');
    console.log('     E2E_GITHUB_TOKEN=ghp_xxx yarn e2e:seed');
    console.log('\nWithout a token, the following tests will fail:');
    console.log('  - Note CRUD Flow (needs repo to save notes)');
    console.log('  - Todo CRUD Flow (needs repo to sync todos)');
    console.log('  - Open Journal Flow (needs repo to save journal)');
    console.log('  - Settings Flow (needs account to test account settings)\n');
    console.log('✅ Seed complete (no auth configured - tests will use app state)');
    process.exit(0);
  }

  console.log(`🔑 Token found: ${E2E_TOKEN.substring(0, 4)}...${E2E_TOKEN.slice(-4)}`);
  console.log(`📦 Target repo: ${E2E_REPO}`);
  console.log('');

  try {
    const result = await seedViaMaestro();
    if (result.success) {
      console.log(`✅ ${result.message}`);
      if (result.configured) {
        console.log(`   Token: ${result.configured.token}`);
        console.log(`   Repo: ${result.configured.repo}`);
        console.log(`   Branch: ${result.configured.branch}`);
      }
    } else {
      console.log(`⚠️  ${result.message}`);
    }
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
