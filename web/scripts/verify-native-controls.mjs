// Fail the native release if remote controls disappear from either copied bundle.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
function scripts(root) {
  return readdirSync(root).flatMap(name => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? scripts(path) : path.endsWith('.js') ? [path] : [];
  });
}
for (const root of ['out', 'android/app/src/main/assets/public', 'ios/App/App/public']) {
  const bundle = scripts(root).map(path => readFileSync(path, 'utf8')).join('\n');
  for (const marker of ['app_update_policy', 'app_access_status', 'hobiday:update-snooze:', '계속 이용하려면 업데이트가 필요해요.', '리뉴얼 준비 중']) {
    assert(bundle.includes(marker), `${root}: missing release control ${marker}`);
  }
  console.log(`PASS native remote controls: ${root}`);
}
