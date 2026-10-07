import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 装卸设备模块键：货物装卸台账等其它入口统一通过下面的可用状态查询读取它，
// 不再各写一份状态判断，避免「详情页一个状态、台账一个状态」。
export const LOAD_EQUIP_KEY = 'load_equip'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

// 模块里与 status 同源的镜像展示字段（字段列表中以「状态」结尾的那一列）。
function statusFieldOf(meta: ModuleMeta): string | undefined {
  return meta.fields.find((field) => field.endsWith('状态'))
}

function todayLabel(): string {
  return new Date().toISOString().slice(0, 10)
}

// 维保 / 报修动作需要追加进「维保记录」，历史维保保留，不覆盖。
const MAINTENANCE_ACTIONS: Record<string, string> = {
  安排维保: '安排维保',
  申请报修: '申请报修',
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

// 详情页统一入口：与清单读同一份本地库，状态不可能再出现两个版本。
export function getEntry(key: string, id: number): EntryRow | undefined {
  return listRows(key).find((row) => Number(row.id) === Number(id))
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  // 镜像状态字段与 status 对齐：清单列、详情页、导出都读同一个状态。
  const statusField = statusFieldOf(meta)
  if (statusField) {
    updated[statusField] = target
  }
  // 维保类动作追加历史，保留之前的维保记录。
  const maintenanceNote = MAINTENANCE_ACTIONS[action]
  if (maintenanceNote && meta.fields.includes('维保记录')) {
    const history = String(updated['维保记录'] ?? '').trim()
    const entry = `${todayLabel()} ${maintenanceNote}：状态变更为「${target}」`
    updated['维保记录'] = history ? `${history}；${entry}` : entry
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

// 装卸设备的可用状态：货物装卸台账、装卸设备详情页等所有入口都以这里为准。
// 「待机 / 运行中」可投入装卸作业；「维保中 / 已报修」不可用。
export type EquipAvailability = {
  id: number
  code: string
  type: string
  aircraft: string
  location: string
  status: string
  available: boolean
}

const EQUIP_AVAILABLE_STATUSES = new Set(['待机', '运行中'])

export function equipmentAvailabilityList(): EquipAvailability[] {
  return listRows(LOAD_EQUIP_KEY).map((row) => {
    const status = String(row.status ?? '')
    return {
      id: Number(row.id),
      code: String(row['设备编号'] ?? ''),
      type: String(row['设备类型'] ?? ''),
      aircraft: String(row['适用机型'] ?? ''),
      location: String(row['安装位置'] ?? ''),
      status,
      available: EQUIP_AVAILABLE_STATUSES.has(status),
    }
  })
}

export function availableEquipmentCount(): number {
  return equipmentAvailabilityList().filter((item) => item.available).length
}
