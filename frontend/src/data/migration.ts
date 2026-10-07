import { MODULE_BY_KEY } from './modules'
import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地数据层的「数据库版本」：schema 或种子数据有变更就递增，
// 已初始化过的浏览器会按编号顺序补做迁移，每个迁移幂等，可随时从断点续做。
export const DATA_VERSION = 2

// 历史记录类字段属于用户资产：补种子 / 升级 schema 时绝不能用示例值覆盖。
// 未列出的字段以种子为准重算，保证「设备状态」等派生字段与当前状态一致。
const USER_OWNED_FIELDS: Record<string, string[]> = {
  load_equip: ['维保记录'],
  special_vehicle: ['上次维保', '维保周期'],
}

export function isEquipmentAvailable(row: EntryRow): boolean {
  return String(row.status) === '待机' || String(row.status) === '运行中'
}

export function equipmentStatusLabel(row: EntryRow): string {
  return isEquipmentAvailable(row) ? '可用' : '不可用'
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

type Step = {
  version: number
  description: string
  apply: (rows: Record<string, EntryRow[]>) => void
}

// 按编号合并种子：同 id 只补字段、不新增重复行；种子里多出的 id 按序补齐。
// 用户没有种子背书的自增记录原样保留。
export function mergeSeed(rows: Record<string, EntryRow[]>, key: string): void {
  const seed = SEED_ROWS[key] ?? []
  if (seed.length === 0) {
    return
  }
  const existing = Array.isArray(rows[key]) ? rows[key] : []
  const byId = new Map(existing.map((row) => [Number(row.id), row]))
  const keptIds = new Set<number>()
  const merged = seed.map((seedRow) => {
    keptIds.add(Number(seedRow.id))
    const current = byId.get(Number(seedRow.id))
    if (!current) {
      return clone(seedRow)
    }
    const next: EntryRow = { ...clone(seedRow), ...clone(current) }
    for (const field of USER_OWNED_FIELDS[key] ?? []) {
      if (current[field] !== undefined && String(current[field]).trim() !== '') {
        next[field] = current[field]
      }
    }
    return next
  })
  for (const row of existing) {
    if (!keptIds.has(Number(row.id))) {
      merged.push(row)
    }
  }
  rows[key] = merged
}

// 设备状态统一由当前状态派生：详情页与各入口台账读到的就是同一份结论。
export function mirrorEquipmentStatus(rows: Record<string, EntryRow[]>): void {
  for (const row of rows['load_equip'] ?? []) {
    row['设备状态'] = equipmentStatusLabel(row)
  }
}

const STEPS: Step[] = [
  {
    version: 2,
    description: '补齐装卸设备示例字段（含适用机型），设备状态统一从当前状态派生，保留历史维保记录',
    apply: (rows) => {
      mergeSeed(rows, 'load_equip')
      mirrorEquipmentStatus(rows)
    },
  },
]

export type InitOutcome = {
  fromVersion: number
  toVersion: number
  applied: number[]
}

// 初始化 / 升级入口。stored 为 null 表示首次播种；为对象表示已有库。
// 已执行过的版本不会重跑，重复调用不产生重复记录；失败时由调用方按已落库的版本断点续做。
export function initData(
  stored: Record<string, EntryRow[]> | null,
  fromVersion: number,
): { rows: Record<string, EntryRow[]>; outcome: InitOutcome } {
  let rows: Record<string, EntryRow[]>
  if (stored === null) {
    rows = clone(SEED_ROWS)
  } else {
    // 旧版没有版本号：先补齐全部模块的种子基线（幂等，不覆盖用户数据），再跑增量迁移
    rows = clone(stored)
    for (const key of Object.keys(SEED_ROWS)) {
      if (!Array.isArray(rows[key])) {
        rows[key] = clone(SEED_ROWS[key])
      }
    }
  }
  const applied: number[] = []
  for (const step of STEPS) {
    if (step.version <= fromVersion) {
      continue
    }
    step.apply(rows)
    applied.push(step.version)
  }
  return { rows, outcome: { fromVersion, toVersion: DATA_VERSION, applied } }
}

// 重置单个模块：回到种子基线，但保留用户历史维保记录。
export function reseedModule(
  rows: Record<string, EntryRow[]>,
  key: string,
): EntryRow[] {
  mergeSeed(rows, key)
  if (key === 'load_equip') {
    mirrorEquipmentStatus(rows)
  }
  return rows[key]
}

export function knownModuleKeys(): string[] {
  return [...MODULE_BY_KEY.keys()]
}
