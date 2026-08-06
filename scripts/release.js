#!/usr/bin/env node
/**
 * release.js — 发版一条龙脚本
 *
 * 用法: node scripts/release.js patch|minor|major
 *
 * 流程: bump 版本(唯一事实源 package.json) → git commit → 打包 NSIS →
 *       ASCII 文件名安装包 → 重算 sha512 写 latest.yml →
 *       创建 GitHub Release vX.Y.Z + 上传 asset → git push + tag
 *
 * 环境要求: node >= 18, 本机已配置 GitHub git 凭证
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const BUILD_DIR = path.join(ROOT, 'build_out');
const OWNER = 'gjj-star';
const REPO = 'resume-map-agents';

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function bumpVersion(current, type) {
  const [maj, min, pat] = current.split('.').map(Number);
  if (type === 'major') return `${maj + 1}.0.0`;
  if (type === 'minor') return `${maj}.${min + 1}.0`;
  if (type === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`未知版本类型: ${type}（应为 patch|minor|major）`);
}

function getGitHubToken() {
  const out = run(`printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill`);
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('无法从 git credential 获取 GitHub token，请先配置 git 凭证');
  return m[1].trim();
}

function ghApi(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL('https://api.github.com' + urlPath);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method,
      rejectUnauthorized: false,
      headers: { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'release-script', Accept: 'application/vnd.github+json', ...headers },
      timeout: 120000,
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(d); } catch (_) {}
        if (res.statusCode >= 400) reject(new Error(`GitHub API ${res.statusCode}: ${d.slice(0, 300)}`));
        else resolve(j);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('GitHub API 超时')));
    if (body) req.write(body);
    req.end();
  });
}

function ghUpload(uploadUrl, filename, filePath, contentType) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(filePath).size;
    const u = new URL(uploadUrl.replace('{?name,label}', ''));
    u.searchParams.set('name', filename);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      rejectUnauthorized: false,
      headers: {
        Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'release-script',
        'Content-Type': contentType, 'Content-Length': size,
        Accept: 'application/vnd.github+json',
      },
      timeout: 600000,
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        console.log(`  [upload ${filename}] ${res.statusCode}`);
        if (res.statusCode >= 400) reject(new Error(d.slice(0, 300)));
        else resolve(JSON.parse(d));
      });
    });
    req.on('error', reject);
    fs.createReadStream(filePath).pipe(req);
  });
}

function retry(fn, times = 5, delayMs = 3000) {
  let lastErr;
  for (let i = 0; i < times; i++) {
    try { return fn(); } catch (e) { lastErr = e; console.log(`  重试 ${i + 1}/${times}: ${e.message}`); }
    // sleep
    const end = Date.now() + delayMs;
    while (Date.now() < end) { /* busy wait */ }
  }
  throw lastErr;
}

(async () => {
  // 0. 参数校验
  const type = process.argv[2];
  if (!['patch', 'minor', 'major'].includes(type)) {
    console.error('用法: node scripts/release.js patch|minor|major');
    process.exit(1);
  }

  // 1. 工作区干净检查
  const status = run('git status --porcelain');
  if (status.trim()) {
    console.error('工作区有未提交改动，请先提交或 stash：\n' + status);
    process.exit(1);
  }

  // 2. bump 版本
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const oldVer = pkg.version;
  const newVer = bumpVersion(oldVer, type);
  console.log(`版本: ${oldVer} -> ${newVer} (${type})`);
  pkg.version = newVer;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // 3. commit
  run(`git add package.json`);
  run(`git commit -m "chore: bump version to ${newVer}"`);

  // 4. 打包 NSIS（输出到 build_out 新目录，避开 safe-delete 对 dist 的拦截）
  console.log('开始打包 NSIS...（约 1-3 分钟）');
  const packCmd = [
    'unset ELECTRON_RUN_AS_NODE',
    'CSC_IDENTITY_AUTO_DISCOVERY=false',
    'node node_modules/electron-builder/out/cli/cli.js --win --publish never --config.directories.output=build_out',
  ].join(' && ');
  run(packCmd, { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log('打包完成');

  // 5. ASCII 文件名安装包 + latest.yml
  const asciiName = `resume-expert-team-${newVer}-setup.exe`;
  const setupSrc = path.join(BUILD_DIR, `简历评估专家团 Setup ${newVer}.exe`);
  const setupDst = path.join(BUILD_DIR, asciiName);
  if (!fs.existsSync(setupSrc)) throw new Error(`找不到安装包: ${setupSrc}`);
  fs.copyFileSync(setupSrc, setupDst);

  const exeBuf = fs.readFileSync(setupDst);
  const sha512 = crypto.createHash('sha512').update(exeBuf).digest('base64');
  const latestYml = [
    'version: ' + newVer,
    'files:',
    '  - url: ' + asciiName,
    '    sha512: ' + sha512,
    '    size: ' + exeBuf.length,
    'path: ' + asciiName,
    'sha512: ' + sha512,
    'releaseDate: ' + new Date().toISOString(),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(BUILD_DIR, 'latest.yml'), latestYml, 'utf8');
  console.log('latest.yml 已生成');

  // 6. 发布 GitHub Release
  TOKEN = getGitHubToken();
  const tag = 'v' + newVer;
  console.log(`发布 GitHub Release ${tag}...`);

  // 删除同 tag 旧 release（重发场景）
  try {
    const oldRelease = await ghApi('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
    await ghApi('DELETE', `/repos/${OWNER}/${REPO}/releases/${oldRelease.id}`);
    try { await ghApi('DELETE', `/repos/${OWNER}/${REPO}/git/refs/tags/${tag}`); } catch (_) {}
    console.log('旧 release 已清理');
  } catch (_) { /* 没有旧 release，正常 */ }

  const release = await retry(() => ghApi('POST', `/repos/${OWNER}/${REPO}/releases`, {
    body: JSON.stringify({ tag_name: tag, name: `简历评估专家团 v${newVer}`, body: '自动更新发布', draft: false, prerelease: false }),
  }), 5, 4000);
  console.log('release id:', release.id);

  await ghUpload(release.upload_url, asciiName, setupDst, 'application/octet-stream');
  await ghUpload(release.upload_url, 'latest.yml', path.join(BUILD_DIR, 'latest.yml'), 'text/yaml');

  // 7. git push + tag（inline 凭证避免 GCM 弹窗）
  console.log('推送 git...');
  const cred = run(`printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill`);
  const user = (cred.match(/^username=(.+)$/m) || [])[1] || OWNER;
  run(`git push "https://${user}:${encodeURIComponent(TOKEN)}@github.com/${OWNER}/${REPO}.git" main`);
  run(`git tag ${tag}`);
  run(`git push "https://${user}:${encodeURIComponent(TOKEN)}@github.com/${OWNER}/${REPO}.git" ${tag}`);

  console.log('\n========================================');
  console.log(`✅ 发布完成 v${newVer}`);
  console.log(`   Release: https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`);
  console.log(`   安装包: ${setupDst}`);
  console.log('========================================');
})().catch((e) => {
  console.error('\n❌ 发布失败:', e.message);
  process.exit(1);
});
