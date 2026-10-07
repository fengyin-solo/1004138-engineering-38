<template>
  <section class="page" data-module="load_equip-detail">
    <header class="page-head">
      <div>
        <h2>装卸设备详情</h2>
        <p class="page-desc">设备编号、适用机型与维保记录的完整信息；状态与货物装卸台账读取同一数据源。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/load_equip">返回装卸设备清单</RouterLink>
        <RouterLink class="btn" to="/cargo">查看货物装卸台账</RouterLink>
      </div>
    </header>

    <template v-if="entry">
      <div class="stat-row">
        <article class="stat-card">
          <span class="stat-label">当前状态</span>
          <strong class="stat-value">{{ entry.status }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">对货物装卸</span>
          <strong class="stat-value" :class="availability?.available ? 'ok-text' : 'warn-text'">
            {{ availability?.available ? '可调度' : '不可用' }}
          </strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">设备编号</span>
          <strong class="stat-value">{{ entry['设备编号'] }}</strong>
        </article>
      </div>

      <table class="data-table detail-table">
        <tbody>
          <tr v-for="field in meta.fields" :key="field">
            <th>{{ field }}</th>
            <td>
              <template v-if="field === '维保记录'">
                <ul class="maintenance-list">
                  <li v-for="(item, index) in maintenanceEntries" :key="index">{{ item }}</li>
                </ul>
              </template>
              <template v-else-if="field === '设备状态'">
                <span :class="isMirrorSynced ? 'ok-text' : 'error-text'">
                  {{ entry[field] }}
                  （{{ isMirrorSynced ? '与主状态一致' : '与主状态不一致' }}）
                </span>
              </template>
              <template v-else>{{ entry[field] ?? '—' }}</template>
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
        <span>状态变更后，货物装卸台账中的可用状态会同步更新</span>
        <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      </footer>
    </template>

    <template v-else>
      <p class="empty-state">没有找到该装卸设备，可能已被重置。</p>
      <p><RouterLink class="link" to="/load_equip">返回装卸设备清单</RouterLink></p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  equipmentAvailabilityList,
  getEntry,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const route = useRoute()
const meta = moduleMeta('load_equip')
const entryId = Number(route.params.id)

const entry = ref<EntryRow | undefined>(getEntry('load_equip', entryId))
const errorMessage = ref('')

const availability = computed(() =>
  equipmentAvailabilityList().find((item) => item.id === entryId),
)

const isMirrorSynced = computed(() =>
  entry.value ? String(entry.value['设备状态'] ?? '') === String(entry.value.status) : true,
)

// 维保记录按分号拆成逐条历史，既保留全部历史，又方便阅读。
const maintenanceEntries = computed<string[]>(() => {
  const raw = String(entry.value?.['维保记录'] ?? '')
  return raw
    .split(/[；;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
})

function reload() {
  entry.value = getEntry(meta.key, entryId)
}

function runAction(action: string) {
  errorMessage.value = ''
  const result = applyAction(meta.key, entryId, action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}
</script>
