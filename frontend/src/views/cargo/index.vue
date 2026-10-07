<template>
  <section class="page" data-module="cargo">
    <header class="page-head">
      <div>
        <h2>货物装卸管理</h2>
        <p class="page-desc">维护货物装卸，围绕装卸编号、关联航班、货物品类、件数吨位做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记货物装卸</button>
        <button class="btn" type="button" @click="exportRows">导出货物装卸清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无货物装卸数据，可先登记货物装卸</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条货物装卸记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <section class="equipment-ledger">
      <header class="ledger-head">
        <h3>装卸设备可用台账</h3>
        <span class="page-desc">状态直接读取装卸设备模块：可用 {{ availableCount }} / {{ equipment.length }} 台，维保中或已报修的设备不可排班。</span>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>设备编号</th>
            <th>设备类型</th>
            <th>适用机型</th>
            <th>设备当前状态</th>
            <th>可用状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in equipment" :key="item.id">
            <td>
              <RouterLink class="link" :to="`/load_equip/${item.id}`">{{ item.设备编号 }}</RouterLink>
            </td>
            <td>{{ item.设备类型 }}</td>
            <td>{{ item.适用机型 }}</td>
            <td>{{ item.status }}</td>
            <td :class="item.available ? 'text-ok' : 'text-warn'">{{ item.设备状态 }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  listEquipmentAvailability,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'
import type { EquipmentAvailability } from '@/api/local-service'

const meta = moduleMeta('cargo')
const columns = ["装卸编号", "关联航班", "货物品类", "件数吨位", "装卸班组", "计划开始", "实际完成", "装卸状态"]
const actions = ["开始装卸", "确认完成", "标记中断"]
const statuses = ["待装卸", "装卸中", "已完成", "异常中断"]
const stats = [{"label": "待装卸航班", "value": 0}, {"label": "装卸中航班", "value": 0}, {"label": "异常中断航班", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const equipment = ref<EquipmentAvailability[]>([])
const availableCount = computed(() => equipment.value.filter((item) => item.available).length)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '货物装卸登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    equipment.value = listEquipmentAvailability()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '货物装卸列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.equipment-ledger { margin-top: 20px; }
.ledger-head { margin-bottom: 8px; }
.ledger-head h3 { margin: 0 0 2px; font-size: 15px; }
.text-ok { color: #15803d; }
.text-warn { color: #b45309; }
</style>
