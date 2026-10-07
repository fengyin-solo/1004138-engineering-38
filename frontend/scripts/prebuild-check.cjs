#!/usr/bin/env node
// 构建前置校验：统一 node 版本、依赖完整性、平台原生包（rollup optional deps）检查。
// 依赖缺失时明确打印缺了什么，并执行一次 npm install；修复后重新执行本脚本即可从断点继续构建。
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.resolve(__dirname, '..')

function fail(message) {
  console.error(`\n[prebuild] ✗ ${message}`)
  console.error('[prebuild] 构建已中止。修复后重新执行 npm run build 即可从断点续做。')
  process.exit(1)
}

// 1. Node 版本
const major = Number(process.versions.node.split('.')[0])
if (Number.isNaN(major) || major < 18) {
  fail(`Node.js 版本过低（当前 ${process.versions.node}），需要 Node.js >= 18。请安装新版 Node 后重试。`)
}

// 2. node_modules 是否存在
if (!fs.existsSync(path.join(root, 'node_modules'))) {
  console.log('[prebuild] 未检测到 node_modules，执行 npm install …')
  execSync('npm install', { cwd: root, stdio: 'inherit' })
}

// 3. 关键依赖可解析
const required = ['vue', 'vite', '@vitejs/plugin-vue', 'typescript', 'vue-tsc', 'rollup']
const missing = required.filter((name) => {
  try {
    require.resolve(name, { paths: [root] })
    return false
  } catch {
    return true
  }
})
if (missing.length > 0) {
  console.log(`[prebuild] 缺失依赖：${missing.join(', ')}，执行 npm install 补齐 …`)
  execSync('npm install', { cwd: root, stdio: 'inherit' })
  const stillMissing = missing.filter((name) => {
    try {
      require.resolve(name, { paths: [root] })
      return false
    } catch {
      return true
    }
  })
  if (stillMissing.length > 0) {
    fail(`npm install 后仍缺失依赖：${stillMissing.join(', ')}。请检查网络或 npm 源配置后重试。`)
  }
}

// 4. rollup 平台原生包（npm optionalDependencies bug：跨平台拷贝 node_modules 会漏装）
function rollupNativePackage() {
  const platform = process.platform
  const arch = process.arch
  const libc = process.report?.getHeader?.()?.glibcVersionRuntime ? 'gnu' : ''
  const musl = process.env.MUSL || (libc === '' && fs.existsSync('/etc/alpine-release'))
  if (platform === 'linux') {
    return `@rollup/rollup-linux-${arch}-${musl ? 'musl' : 'gnu'}`
  }
  if (platform === 'darwin') {
    return `@rollup/rollup-darwin-${arch === 'arm64' ? 'arm64' : 'x64'}`
  }
  if (platform === 'win32') {
    return arch === 'arm64'
      ? '@rollup/rollup-win32-arm64-msvc'
      : `@rollup/rollup-win32-${arch === 'x64' ? 'x64' : 'ia32'}-msvc`
  }
  return null
}

const nativePkg = rollupNativePackage()
if (nativePkg) {
  const nativePath = path.join(root, 'node_modules', ...nativePkg.split('/'))
  if (!fs.existsSync(nativePath)) {
    console.log(`[prebuild] 缺少平台原生包 ${nativePkg}（常见于跨平台拷贝 node_modules），重装依赖 …`)
    execSync('rm -rf node_modules package-lock.json && npm install', {
      cwd: root,
      stdio: 'inherit',
      shell: '/bin/sh',
    })
    if (!fs.existsSync(nativePath)) {
      fail(
        `重装后仍缺少 ${nativePkg}。可尝试手动安装：npm install -D ${nativePkg}@<rollup版本>，或清仓后 npm install。`,
      )
    }
  }
}

console.log('[prebuild] ✓ 环境与依赖校验通过')
