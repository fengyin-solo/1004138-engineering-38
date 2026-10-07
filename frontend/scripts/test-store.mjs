// 模拟浏览器 localStorage，验证 local-store 的升级 / 幂等 / 断点路径。
// 运行：node scripts/test-store.mjs
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const outDir = mkdtempSync(path.join(tmpdir(), 'ground-store-'))
const outFile = path.join(outDir, 'bundle.mjs')

await build({
  entryPoints: [path.join(root, 'src/data/local-store.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: outFile,
  logLevel: 'silent',
})

function makeBrowser(initial = {}) {
  const storage = new Map(Object.entries(initial))
  globalThis.window = {
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
  }
  return storage
}

let failures = 0
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name} ${detail}`)
  }
}

// 场景 A：旧版浏览器（v1 时代写入的旧示例，没有 meta）
console.log('[A] 旧版用户首次打开新版：自动升级 + 刷新不再回旧示例')
const oldRows = {
  load_equip: [
    {
      id: 1,
      status: '待机',
      pending: true,
      abnormal: false,
      设备编号: 'LOAD-0001',
      设备类型: '旧装卸设备样例1',
      最大载重: '旧载重',
      维保记录: '2026-05-01 用户真实维保，必须保留',
      设备状态: '旧装卸设备样例1',
    },
    {
      id: 2,
      status: '运行中',
      pending: true,
      abnormal: true,
      设备编号: 'LOAD-0002',
      设备类型: '旧装卸设备样例2',
      最大载重: '旧载重2',
      维保记录: '旧维保2',
      设备状态: '旧装卸设备样例2',
    },
    {
      id: 3,
      status: '维保中',
      pending: false,
      abnormal: false,
      设备编号: 'LOAD-0003',
      设备类型: '旧装卸设备样例3',
      最大载重: '旧载重3',
      维保记录: '旧维保3',
      设备状态: '旧装卸设备样例3',
    },
  ],
}
const storage = makeBrowser({
  'airport-ground-handling:entries': JSON.stringify(oldRows),
})

let mod = await import(pathToFileURL(outFile).href)
const rows1 = mod.allRows()
check('旧库升级后装卸设备 3 条（无重复）', rows1.load_equip.length === 3)
check('适用机型补齐', rows1.load_equip.every((r) => String(r['适用机型']).includes('机')))
check('历史维保保留', rows1.load_equip[0]['维保记录'] === '2026-05-01 用户真实维保，必须保留')
check('设备状态被统一重算', rows1.load_equip[0]['设备状态'] === '可用')
check('meta 版本写入为 2', JSON.parse(storage.get('airport-ground-handling:meta')).version === 2)

// 模拟刷新：新模块实例从同一份 localStorage 再初始化（保持 window 在位）
mod = await import(`${pathToFileURL(outFile).href}?v=2`)
const rows2 = mod.allRows()
check('刷新后仍为 3 条（不重复播种）', rows2.load_equip.length === 3)
check('刷新后适用机型仍在（旧示例不再回来）', rows2.load_equip.every((r) => String(r['适用机型']).includes('机')))
check('刷新后维保仍在', rows2.load_equip[0]['维保记录'] === '2026-05-01 用户真实维保，必须保留')

// 场景 B：全新加载（内存模式即可，验证状态流转 → 台账同步是同一数据源）
console.log('[B] 维保中 → 启用，台账可用状态同步')
const svcOutDir = mkdtempSync(path.join(tmpdir(), 'ground-svc-'))
const svcFile = path.join(svcOutDir, 'svc.mjs')
await build({
  entryPoints: [path.join(root, 'src/api/local-service.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: svcFile,
  logLevel: 'silent',
})
const svc = await import(`${pathToFileURL(svcFile).href}?fresh=1`)
const before = svc.listEquipmentAvailability().find((i) => i.id === 3)
check('流转前 LOAD-0003 维保中=不可用', before.available === false && before.设备状态 === '不可用')
const res = svc.runAction('load_equip', 3, '启用设备')
check('动作成功', res.ok === true, res.message)
const after = svc.listEquipmentAvailability().find((i) => i.id === 3)
check('流转后台账立刻读到可用', after.available === true && after.设备状态 === '可用')
const detail = svc.entryDetail('load_equip', 3)
check('详情页与台账读到同一状态', detail['设备状态'] === after.设备状态 && detail.status === after.status)

// 场景 C：损坏数据不吞、备份后重播种
console.log('[C] 数据损坏降级')
makeBrowser({ 'airport-ground-handling:entries': '{not-json' })
mod = await import(`${pathToFileURL(outFile).href}?v=3`)
const rows3 = mod.allRows()
check('损坏后重新播种', rows3.load_equip.length === 3)

if (failures > 0) {
  console.error(`\n${failures} 项校验失败`)
  process.exit(1)
}
console.log('\n全部存储层断点校验通过')
