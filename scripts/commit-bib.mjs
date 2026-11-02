import {spawnSync} from 'node:child_process';
import {configuration, configFile, root, outputFiles, syncBib} from './sync-bib.mjs';

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed${capture ? `: ${result.stderr.trim()}` : ''}`);
  return result.stdout?.trim() || '';
}
try {
  const config = await configuration();
  const files = [configFile, ...config.sources.map(source => `bibliography/${source.file}`), ...outputFiles];
  if (run('git', ['diff', '--cached', '--name-only'], true)) throw new Error('已有暫存的修改，請先處理後再執行，避免混入本次 commit。');
  // The first setup commit is intentionally manual, especially in an existing dirty workspace.
  for (const file of files) {
    run('git', ['ls-files', '--error-unmatch', '--', file], true);
  }
  const before = run('git', ['diff', '--name-only', '--', ...outputFiles], true);
  if (before) throw new Error('YAML 有尚未提交的修改；請先檢查並手動提交，再使用自動 commit。');
  await syncBib();
  run(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build']);
  run('git', ['add', '--', ...files]);
  if (!run('git', ['diff', '--cached', '--name-only'], true)) console.log('沒有資料變更，不需 commit。');
  else {
    run('git', ['commit', '-m', process.argv.slice(2).join(' ') || '更新論文與計畫資料']);
    console.log('已建立本機 commit；尚未 push。');
  }
} catch (error) {
  console.error(`未完成 commit：${error.message}`);
  process.exitCode = 1;
}
