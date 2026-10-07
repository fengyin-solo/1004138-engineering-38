#!/usr/bin/env node
/**
 * 构建产物校验：vue-tsc 类型检查 + vite build 完成后，确认 dist 可部署。
 * 校验失败即以非零码退出，CI / docker build 不会把坏镜像发出去。
 */
const fs = require('fs')
const path = require('path')

const dist = path.resolve(__dirname, '..', 'dist')
const problems = []

if (!fs.existsSync(dist)) {
  problems.push('dist 目录不存在，vite build 可能未执行或已失败')
} else {
  const indexFile = path.join(dist, 'index.html')
  if (!fs.existsSync(indexFile)) {
    problems.push('缺少 dist/index.html')
  } else {
    const html = fs.readFileSync(indexFile, 'utf8')
    if (!/<div id="app">/.test(html)) {
      problems.push('dist/index.html 缺少 #app 挂载点')
    }
    if (!/\/assets\/[^"']+\.js/.test(html)) {
      problems.push('dist/index.html 没有引用打包后的 JS 资源')
    }
  }
  const assetsDir = path.join(dist, 'assets')
  if (!fs.existsSync(assetsDir) || fs.readdirSync(assetsDir).length === 0) {
    problems.push('dist/assets 为空或不存在，静态资源未产出')
  }
}

if (problems.length > 0) {
  console.error('[verify-build] 构建校验失败：')
  for (const item of problems) {
    console.error(`  - ${item}`)
  }
  process.exit(1)
}

console.log('[verify-build] 构建校验通过：index.html 与 assets 均已产出。')
