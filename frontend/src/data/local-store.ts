import { MODULE_BY_KEY } from './modules'
import { SEED_ROWS } from './seed'
import type { DataEnvelope, EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'airport-ground-handling:entries'
// 旧版本数据直接以「模块 -> 记录数组」裸存，没有外层信封；读取时按形态自动识别。
const BACKUP_KEY = 'airport-ground-handling:entries:backup'
// 本地库结构版本：示例数据扩字段（如装卸设备「适用机型」）后递增，触发一次幂等迁移。
const SCHEMA_VERSION = 2

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 模块表里镜像 status 的展示字段（如装卸设备的「设备状态」）。
// 它必须与 status 同源，否则详情页和台账会读到两个不一致的状态。
function statusFieldOf(key: string): string | undefined {
  const fields = MODULE_BY_KEY.get(key)?.fields ?? []
  return fields.find((field) => field.endsWith('状态'))
}

// 以 status 为唯一事实源对齐镜像状态字段；缺失的种子字段补齐。
// stored 是用户浏览器里的历史记录（优先保留其改动与维保记录），seed 是随版本发布的示例。
function reconcileRow(key: string, stored: EntryRow | undefined, seed: EntryRow): EntryRow {
  const statusField = statusFieldOf(key)
  const merged: EntryRow = { ...seed, ...stored }
  const canonicalStatus = stored?.status ?? seed.status
  merged.status = canonicalStatus
  merged.id = stored?.id ?? seed.id
  if (statusField) {
    merged[statusField] = canonicalStatus
  }
  return merged
}

// 单模块按 id 对齐种子：同一台设备只保留一条（重复初始化不产生重复记录），
// 用户改过的字段（含历史维保记录）保留，新发布的字段从种子补齐。
function mergeModule(key: string, storedRows: EntryRow[] | undefined): { rows: EntryRow[]; changed: boolean } {
  const seedRows = SEED_ROWS[key] ?? []
  if (!storedRows || storedRows.length === 0) {
    return { rows: clone(seedRows), changed: true }
  }
  const storedById = new Map<number, EntryRow>()
  const extraRows: EntryRow[] = []
  for (const row of storedRows) {
    const id = Number(row.id)
    if (storedById.has(id)) {
      // 同 id 重复记录：丢弃后来的重复项，只留第一条，保证幂等。
      continue
    }
    if (seedRows.some((seed) => Number(seed.id) === id)) {
      storedById.set(id, row)
    } else {
      extraRows.push(row)
    }
  }

  const statusField = statusFieldOf(key)
  let changed = storedById.size + extraRows.length !== storedRows.length
  const mergedSeedRows = seedRows.map((seed) => {
    const stored = storedById.get(Number(seed.id))
    const result = reconcileRow(key, stored, seed)
    if (!changed && stored) {
      // 记录一次是否真的发生了字段补齐 / 状态对齐，没有变化就不回写，刷新不产生无谓写入。
      changed = JSON.stringify(result) !== JSON.stringify(stored)
    }
    return result
  })

  const mergedExtraRows = extraRows.map((row) => {
    if (!statusField) return row
    if (row[statusField] === row.status) return row
    changed = true
    return { ...row, [statusField]: row.status }
  })

  return { rows: [...mergedSeedRows, ...mergedExtraRows], changed }
}

// 把整库与当前版本种子对齐，返回最新数据与「是否需要落盘」。
// 纯函数：不写 localStorage，写入由调用方统一完成，迁移失败下次仍可从断点续做。
function buildInitialData(raw: string | null): { rows: Record<string, EntryRow[]>; changed: boolean } {
  const fallback = clone(SEED_ROWS)
  if (!raw) {
    return { rows: fallback, changed: true }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { rows: fallback, changed: true }
  }

  let storedMap: Record<string, EntryRow[]> | null = null
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as DataEnvelope).rows) === false &&
    typeof (parsed as DataEnvelope).rows === 'object'
  ) {
    storedMap = (parsed as DataEnvelope).rows as Record<string, EntryRow[]>
  } else if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    // 兼容无版本号的旧版裸数据。
    storedMap = parsed as Record<string, EntryRow[]>
  }

  if (!storedMap) {
    return { rows: fallback, changed: true }
  }

  let changed = false
  const next: Record<string, EntryRow[]> = {}
  for (const key of Object.keys(SEED_ROWS)) {
    const { rows, changed: moduleChanged } = mergeModule(key, storedMap[key])
    next[key] = rows
    changed = changed || moduleChanged
  }
  // 旧库里若有种子之外的自定义模块数据，原样保留。
  for (const key of Object.keys(storedMap)) {
    if (!(key in next)) {
      next[key] = storedMap[key]
      changed = true
    }
  }
  return { rows: next, changed }
}

function persist(version: number, rows: Record<string, EntryRow[]>): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  const envelope: DataEnvelope = { version, rows }
  const payload = JSON.stringify(envelope)
  try {
    window.localStorage.setItem(STORAGE_KEY, payload)
  } catch (error) {
    // 配额或隐私模式写入失败：保留内存数据本次可用，并提示缺失条件，刷新后可从旧值断点续做。
    console.error('[local-store] 数据落盘失败，请检查浏览器存储权限或配额：', error)
  }
}

function loadAndMigrate(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }

  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return fallback
  }

  const { rows, changed } = buildInitialData(raw)
  if (changed && raw) {
    // 迁移前备份一份旧示例，异常时可人工找回。
    try {
      window.localStorage.setItem(BACKUP_KEY, raw)
    } catch {
      /* 备份失败不影响主流程 */
    }
  }
  if (changed) {
    // 整个迁移是幂等的：即使这次写到一半失败，下次启动仍从旧数据重新算出同样的结果。
    persist(SCHEMA_VERSION, rows)
  }
  return rows
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = loadAndMigrate()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  persist(SCHEMA_VERSION, next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function schemaVersion(): number {
  return SCHEMA_VERSION
}
