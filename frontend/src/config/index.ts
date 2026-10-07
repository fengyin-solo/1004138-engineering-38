/**
 * 统一环境配置入口：页面与构建脚本只从这里读环境变量，
 * 不在组件里直接散落 import.meta.env，保证 dev / build / docker 三种方式取值一致。
 */

const env = import.meta.env

function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

export const APP_NAME = readString(env.VITE_APP_NAME, '机场地面保障调度管理系统')

// 纯前端版本默认无后端，留空；将来接入后端时由 VITE_API_BASE 注入。
export const API_BASE = readString(env.VITE_API_BASE, '')

// 本地数据层（浏览器 localStorage）当前结构版本，见 src/data/local-store.ts。
export const DATA_MODE = 'local' as const
