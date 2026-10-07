#!/usr/bin/env node
/**
 * 依赖前置检查：dev / build 之前先跑，保证「依赖顺序」正确。
 * 缺依赖时不做一堆看不懂的模块解析报错，直接说明缺哪个包、该执行哪条命令，
 * 装好后从这一步继续即可（后续步骤可断点续做）。
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')

if (!fs.existsSync(pkgPath)) {
  console.error('[check-deps] 未找到 frontend/package.json，请在 frontend 目录下执行本脚本。')
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const required = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]

const problems = []

if (!fs.existsSync(path.join(root, 'node_modules'))) {
  problems.push('node_modules 不存在，依赖尚未安装')
} else {
  for (const name of required) {
    // 支持 @scope/name 这类带斜杠的包名。
    const pkgJsonPath = path.join(root, 'node_modules', name, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
      problems.push(`缺少依赖包：${name}`)
    }
  }
}

const wanted = pkg.engines?.node
if (wanted) {
  const major = Number(process.versions.node.split('.')[0])
  // engines.node 形如 ">=20"，取第一个连续数字作为最低主版本。
  const match = String(wanted).match(/\d+/)
  const wantedMajor = match ? Number(match[0]) : 0
  if (wantedMajor && major < wantedMajor) {
    problems.push(`Node 版本过低：当前 ${process.versions.node}，要求 ${wanted}`)
  }
}

if (problems.length > 0) {
  console.error('[check-deps] 运行前置条件不满足：')
  for (const item of problems) {
    console.error(`  - ${item}`)
  }
  console.error('')
  console.error('请先安装缺失依赖，再从本步继续（断点续做）：')
  console.error('  cd frontend && npm install')
  process.exit(1)
}

console.log('[check-deps] 依赖检查通过（%d 个包，Node %s）。', required.length, process.versions.node)
