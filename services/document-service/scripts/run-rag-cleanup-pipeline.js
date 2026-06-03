/**
 * Orchestrate: clean attachments → re-embed affected articles (PR-CH via embed_all).
 * Usage:
 *   node scripts/run-rag-cleanup-pipeline.js [--limit N] [--skip-embed]
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const node = process.execPath;

function run(script, extraArgs = []) {
  const scriptPath = path.join(__dirname, script);
  console.log('\n>>>', script, extraArgs.join(' '));
  const res = spawnSync(node, [scriptPath, ...extraArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`${script} exited with ${res.status}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const skipEmbed = args.includes('--skip-embed');
  const limitIdx = args.indexOf('--limit');
  const limitArg = limitIdx >= 0 ? ['--limit', args[limitIdx + 1]] : [];

  run('clean-article-attachments.js', ['--apply', ...limitArg]);

  if (!skipEmbed) {
    run('../embed_all.js', ['--refresh-affected']);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
