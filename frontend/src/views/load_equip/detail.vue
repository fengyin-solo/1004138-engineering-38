<template>
  <section class="page" data-module="load_equip-detail">
    <header class="page-head">
      <div>
        <h2>装卸设备详情</h2>
        <p class="page-desc">设备编号、适用机型与可用状态与货物装卸台账读取同一数据源，状态流转后各处同步更新。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/load_equip">返回装卸设备清单</RouterLink>
      </div>
    </header>

    <template v-if="row">
      <div class="stat-row">
        <article class="stat-card">
          <span class="stat-label">当前状态</span>
          <strong class="stat-value">{{ row.status }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">台账可用状态</span>
          <strong class="stat-value" :class="available ? 'text-ok' : 'text-warn'">{{ 设备状态 }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">设备编号</span>
          <strong class="stat-value">{{ row['设备编号'] }}</strong>
        </article>
      </div>

      <table class="data-table detail-table">
        <tbody>
          <tr v-for="field in meta.fields" :key="field">
            <th>{{ field }}</th>
            <td :class="{ 'multiline': field === '维保记录' }">
              <template v-if="field === '维保记录'">
                <p v-for="(line, index) in maintenanceLines" :key="index" class="record-line">{{ line }}</p>
              </template>
              <template v-else>{{ row[field] ?? '—' }}</template>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="detail-actions">
        <button
          v-for="action in meta.actions"
          :key="action"
          class="btn"
          :class="{ primary: action === '启用设备' }"
          type="button"
          @click="runAction(action)"
        >
          {{ action }}
        </button>
      </div>
      <footer class="page-foot">
        <span v-if="message" :class="messageOk ? 'text-ok' : 'error-text'">{{ message }}</span>
      </footer>
    </template>

    <p v-else class="empty-state">没有找到该装卸设备记录，可能已被移除，请返回清单重新选择。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import {
  entryDetail,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { equipmentStatusLabel, isEquipmentAvailable } from '@/data/migration'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('load_equip')
const route = useRoute()

const row = ref<EntryRow | undefined>(undefined)
const message = ref('')
const messageOk = ref(false)

const available = computed(() => (row.value ? isEquipmentAvailable(row.value) : false))
const 设备状态 = computed(() => (row.value ? equipmentStatusLabel(row.value) : '—'))
const maintenanceLines = computed(() =>
  String(row.value?.['维保记录'] ?? '')
    .split(/[；;\n]/)
    .map((line) => line.trim())
    .filter(Boolean),
)

function load() {
  row.value = entryDetail('load_equip', Number(route.params.id))
}

function runAction(action: string) {
  if (!row.value) {
    return
  }
  const result = applyAction('load_equip', Number(row.value.id), action)
  message.value = result.message
  messageOk.value = result.ok
  if (result.ok) {
    load()
  }
}

watch(() => route.params.id, load, { immediate: true })
</script>

<style scoped>
.detail-table th { width: 180px; white-space: nowrap; }
.multiline { white-space: pre-line; }
.record-line { margin: 0 0 4px; }
.record-line:last-child { margin-bottom: 0; }
.detail-actions { display: flex; gap: 8px; margin-top: 14px; }
.text-ok { color: #15803d; }
.text-warn { color: #b45309; }
</style>
