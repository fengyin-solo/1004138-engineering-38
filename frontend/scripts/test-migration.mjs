// 数据层迁移/幂等性验证：用极简 localStorage 桩模拟旧版浏览器数据，验证
// 1) 旧示例补齐新字段（适用机型）；2) 重复初始化不产生重复记录；3) 历史维保保留；
// 4) 镜像「设备状态」与 status 对齐；5) 动作流转后台账可用状态同步；6) 损坏数据回退。
import { createServer } from 'vite'

const storage = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
}

// 旧版（v1，裸数据）：缺「适用机型」、设备状态与 status 不一致。
// load_equip 包含全部 3 个种子 id，其中 id=1 再塞一条重复记录，模拟历史脏数据。
const legacy = {
  load_equip: [
    {
      id: 1,
      status: '运行中',
      pending: true,
      abnormal: false,
      设备编号: 'LOAD-0001',
      设备类型: '装卸设备样例1',
      最大载重: '装卸设备样例1',
      安装位置: '装卸设备样例1',
      购入日期: '2026-09-01',
      维保记录: '2026-01-01 历史维保：年检合格',
      设备状态: '装卸设备样例1',
    },
    {
      id: 1,
      status: '运行中',
      pending: true,
      abnormal: false,
      设备编号: 'LOAD-0001-DUP',
    },
    { id: 2, status: '待机', pending: true, abnormal: false, 设备编号: 'LOAD-0002', 设备状态: '待机' },
    { id: 3, status: '维保中', pending: false, abnormal: false, 设备编号: 'LOAD-0003', 设备状态: '维保中' },
  ],
}
storage.set('airport-ground-handling:entries', JSON.stringify(legacy))

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' })
const store = await server.ssrLoadModule('/src/data/local-store.ts')
const svc = await server.ssrLoadModule('/src/api/local-service.ts')

let pass = 0
let fail = 0
const assert = (cond, msg) => {
  if (cond) {
    pass++
    console.log('  ✓', msg)
  } else {
    fail++
    console.error('  ✗', msg)
  }
}

console.log('— 首次迁移（旧版部署后首次打开）—')
const rows1 = store.listRows('load_equip')
assert(rows1.length === 3, `重复 id 记录被去重，仍为 3 台设备（实际 ${rows1.length}）`)
assert(rows1.filter((r) => Number(r.id) === 1).length === 1, 'id=1 只保留一条')
const r1 = rows1[0]
assert(typeof r1['适用机型'] === 'string' && r1['适用机型'].includes('A320'), `缺失字段「适用机型」从种子补齐：${r1['适用机型']}`)
assert(r1['维保记录'].includes('2026-01-01 历史维保：年检合格'), `历史维保记录保留：${r1['维保记录']}`)
assert(r1['设备状态'] === '运行中', `镜像「设备状态」对齐 status：${r1['设备状态']}`)
assert(r1['设备类型'] === '装卸设备样例1', `用户历史字段值不被种子覆盖：${r1['设备类型']}`)
assert(r1['设备编号'] === 'LOAD-0001', `重复记录中保留第一条：${r1['设备编号']}`)

const persisted1 = JSON.parse(storage.get('airport-ground-handling:entries'))
assert(persisted1.version === 2, `落盘带版本号 v2（实际 v${persisted1.version}）`)
assert(storage.has('airport-ground-handling:entries:backup'), '迁移前旧数据已备份')

console.log('— 第二次初始化（刷新/重开，断点续做幂等）—')
const before = storage.get('airport-ground-handling:entries')
const backupBefore = storage.get('airport-ground-handling:entries:backup')
const rows2 = store.allRows()
assert(rows2.load_equip.length === 3, '二次初始化不产生重复记录（仍为 3 台）')
assert(storage.get('airport-ground-handling:entries') === before, '数据无变化时不重复回写（幂等）')
assert(storage.get('airport-ground-handling:entries:backup') === backupBefore, '备份保持为迁移前旧数据，不被覆盖')

console.log('— 动作流转：安排维保（追加历史，不覆盖）—')
svc.runAction('load_equip', 1, '安排维保')
const r3 = store.listRows('load_equip')[0]
assert(r3.status === '维保中', `状态变为「维保中」（实际 ${r3.status}）`)
assert(r3['设备状态'] === '维保中', `镜像「设备状态」同步为「维保中」（实际 ${r3['设备状态']}）`)
assert(r3['维保记录'].includes('2026-01-01 历史维保：年检合格'), '维保追加后旧记录仍在')
assert(r3['维保记录'].includes('安排维保：状态变更为「维保中」'), '维保追加了新一条历史')

console.log('— 货物装卸台账可用状态同步 —')
const all = svc.equipmentAvailabilityList()
assert(all.length === 3, `台账读到全部 3 台设备（实际 ${all.length}）`)
const eq1 = all.find((x) => x.id === 1)
assert(eq1.available === false, `LOAD-0001 维保中对台账不可用`)
assert(all.find((x) => x.id === 2).available === true, 'LOAD-0002 运行中可用')
assert(all.find((x) => x.id === 3).available === false, 'LOAD-0003 维保中不可用')

console.log('— 损坏数据回退种子（新模块实例）—')
storage.set('airport-ground-handling:entries', '{not-json')
const store2 = await server.ssrLoadModule('/src/data/local-store.ts?t=2')
assert(store2.listRows('load_equip').length === 3, '损坏存储回退到 3 条种子记录')

console.log('— 全新浏览器（空存储）播种 —')
storage.clear()
const store3 = await server.ssrLoadModule('/src/data/local-store.ts?t=3')
assert(store3.listRows('load_equip').length === 3, '空存储播种 3 条')
const first = store3.listRows('load_equip')[0]
assert(first['设备状态'] === first.status, '新播种数据镜像状态与主状态一致')
assert(String(first['适用机型']).includes('A320'), `新播种数据带真实适用机型：${first['适用机型']}`)

await server.close()
console.log(`\n结果：${pass} 通过，${fail} 失败`)
process.exit(fail ? 1 : 0)
