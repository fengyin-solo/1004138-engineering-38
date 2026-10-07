import { SEED_ROWS } from './seed'
import { DATA_VERSION, clone, initData, reseedModule } from './migration'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'airport-ground-handling:entries'
const META_KEY = 'airport-ground-handling:meta'

type StoredMeta = { version: number; updatedAt?: string }

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    // 隐私模式等场景下访问 localStorage 可能直接抛错，降级为内存模式
    return false
  }
}

function writeMeta(meta: StoredMeta): void {
  if (!hasStorage()) {
    return
  }
  window.localStorage.setItem(META_KEY, JSON.stringify(meta))
}

function persist(rows: Record<string, EntryRow[]>, version: number): void {
  cache = rows
  if (!hasStorage()) {
    return
  }
  // 先写数据再写版本号：迁移中断时版本仍停在上一步，下次自动断点续做，不会重复升级。
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  writeMeta({ version, updatedAt: new Date().toISOString() })
}

function parseStored(): { rows: Record<string, EntryRow[]> | null; version: number } {
  if (!hasStorage()) {
    return { rows: null, version: DATA_VERSION }
  }
  const metaRaw = window.localStorage.getItem(META_KEY)
  let version = 0
  if (metaRaw) {
    try {
      version = Number((JSON.parse(metaRaw) as StoredMeta).version) || 0
    } catch {
      version = 0
    }
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return { rows: null, version: 0 }
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { rows: parsed, version }
  } catch {
    // 数据损坏：旧内容留作 .corrupt 备份，不静默吞掉，再全新播种
    window.localStorage.setItem(`${STORAGE_KEY}.corrupt-${Date.now()}`, raw)
    window.localStorage.removeItem(STORAGE_KEY)
    return { rows: null, version: 0 }
  }
}

let cache: Record<string, EntryRow[]> | null = null
let initPromise: Promise<Record<string, EntryRow[]>> | null = null

// 数据库初始化：幂等。重复调用（并发挂载 / 刷新）只会复用同一次结果，不产生重复记录。
export function ensureInitialized(): Promise<Record<string, EntryRow[]>> {
  if (cache) {
    return Promise.resolve(cache)
  }
  if (!initPromise) {
    initPromise = new Promise((resolve) => {
      const { rows: stored, version } = parseStored()
      const { rows, outcome } = initData(stored, version)
      persist(rows, outcome.toVersion)
      resolve(rows)
    })
  }
  return initPromise
}

// 同步读取：未初始化时立即执行一次（localStorage 本就是同步 API，保留同步调用习惯）。
export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    const { rows: stored, version } = parseStored()
    const { rows, outcome } = initData(stored, version)
    persist(rows, outcome.toVersion)
    cache = rows
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function getRow(key: string, id: number): EntryRow | undefined {
  return listRows(key).find((row) => Number(row.id) === id)
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  persist(next, DATA_VERSION)
}

// 重置单个模块：回种子基线，同时保留历史维保记录。
export function resetRows(key: string): EntryRow[] {
  const next = { ...allRows() }
  const rows = reseedModule(next, key)
  persist(next, DATA_VERSION)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function dataVersion(): number {
  return DATA_VERSION
}

// 仅供测试：复位内存缓存
export function _resetCacheForTest(): void {
  cache = null
  initPromise = null
}

// 种子快照（测试 / 工具用）
export function seedSnapshot(): Record<string, EntryRow[]> {
  return clone(SEED_ROWS)
}
