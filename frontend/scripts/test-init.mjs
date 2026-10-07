// 初始化 / 迁移核心的断点校验：幂等、不重复、维保保留、设备状态与台账一致。
// 运行：node scripts/test-init.mjs
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const outDir = mkdtempSync(path.join(tmpdir(), 'ground-init-'))
const outFile = path.join(outDir, 'bundle.mjs')

await build({
  entryPoints: [path.join(root, 'src/data/migration.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: outFile,
  logLevel: 'silent',
})

const mod = await import(pathToFileURL(outFile).href)
const { initData, DATA_VERSION, mergeSeed, mirrorEquipmentStatus } = mod

let failures = 0
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name} ${detail}`)
  }
}

// 1. 首次播种
console.log('[1] 首次播种')
const first = initData(null, 0).rows
check('装卸设备播种 3 条', first.load_equip.length === 3)
check('适用机型全部有值', first.load_equip.every((r) => String(r['适用机型']).length > 0))
check('设备状态与状态机一致（待机→可用）', first.load_equip[0]['设备状态'] === '可用')
check('设备状态与状态机一致（运行中→可用）', first.load_equip[1]['设备状态'] === '可用')
check('设备状态与状态机一致（维保中→不可用）', first.load_equip[2]['设备状态'] === '不可用')

// 2. 幂等：已在最新版时重复初始化不产生重复记录
console.log('[2] 重复初始化')
const again = initData(first, DATA_VERSION).rows
check('重复初始化仍为 3 条', again.load_equip.length === 3)
check('重复初始化 applied 为空', initData(first, DATA_VERSION).outcome.applied.length === 0)
const third = initData(again, DATA_VERSION).rows
check('第三次初始化仍为 3 条（无重复记录）', third.load_equip.length === 3)

// 3. 旧版（无版本号）升级：旧示例缺「适用机型」，升级后补齐，且不重复
console.log('[3] 旧示例升级')
const legacy = {
  load_equip: [
    {
      id: 1,
      status: '待机',
      pending: true,
      abnormal: false,
      设备编号: 'LOAD-0001',
      设备类型: '旧类型',
      // 缺 适用机型、最大载重 等字段，模拟构建前写入的旧示例
      最大载重: '旧载重',
      维保记录: '用户登记：2026-05-01 更换轮胎，必须保留',
      设备状态: '装卸设备样例1',
    },
  ],
}
const migrated = initData(legacy, 0).rows
check('升级后仍为 3 条（无重复）', migrated.load_equip.length === 3)
const m1 = migrated.load_equip.find((r) => r.id === 1)
check('旧记录补齐适用机型', m1['适用机型'] === 'B737/A320 窄体机')
check('用户已改字段不被覆盖（设备类型）', m1['设备类型'] === '旧类型')
check('用户已改字段不被覆盖（最大载重）', m1['最大载重'] === '旧载重')
check('历史维保记录保留', m1['维保记录'] === '用户登记：2026-05-01 更换轮胎，必须保留')
check('旧设备状态被重算为「可用」', m1['设备状态'] === '可用')
check('升级 applied 含 v2', initData(legacy, 0).outcome.applied.includes(2))

// 4. 断点续做：在 v1（迁移未做）重跑等价于续做；已完成 v2 再跑无副作用
console.log('[4] 断点续做')
const resumed = initData(migrated, 1).rows
check('断点续做后 3 条不重复', resumed.load_equip.length === 3)
check('断点续做补齐适用机型', resumed.load_equip.every((r) => String(r['适用机型']).length > 0))
const noop = initData(migrated, DATA_VERSION)
check('已到最新版不再执行任何步骤', noop.outcome.applied.length === 0)

// 5. 维保中 → 启用后状态随动，其他入口（货物装卸台账）读到的就是新结论
console.log('[5] 状态流转后台账同步')
const rows = initData(null, 0).rows
const equip = rows.load_equip.find((r) => r.id === 3)
equip.status = '运行中'
mirrorEquipmentStatus(rows)
check('维保中设备启用后设备状态变「可用」', equip['设备状态'] === '可用')
check('货物装卸台账口径：可用=待机+运行中', rows.load_equip.filter((r) => ['待机', '运行中'].includes(r.status)).every((r) => r['设备状态'] === '可用'))

// 6. 其他模块不受影响 + 用户新增记录保留
console.log('[6] 模块隔离')
const seeded = initData(null, 0).rows
check('18 个业务模块全部播种', Object.keys(seeded).length === 18)
const withUser = JSON.parse(JSON.stringify(seeded))
withUser.load_equip.push({
  id: 99,
  status: '待机',
  pending: true,
  abnormal: false,
  设备编号: 'LOAD-0099',
  设备类型: '用户自增设备',
  适用机型: 'B787',
  最大载重: '9 吨',
  安装位置: 'T1',
  购入日期: '2026-10-01',
  维保记录: '用户自建',
  设备状态: '可用',
})
const reinit = initData(withUser, DATA_VERSION - 1).rows
check('用户自增记录在升级后保留（共 4 条）', reinit.load_equip.length === 4)
check('用户自增记录内容不变', reinit.load_equip.find((r) => r.id === 99)?.设备编号 === 'LOAD-0099')
// mergeSeed 直接对半成品库再跑一次也不重复
mergeSeed(reinit, 'load_equip')
check('mergeSeed 重复执行不产生重复行', reinit.load_equip.length === 4)

if (failures > 0) {
  console.error(`\n${failures} 项校验失败`)
  process.exit(1)
}
console.log('\n全部初始化断点校验通过')
