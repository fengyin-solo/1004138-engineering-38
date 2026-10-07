import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { ensureInitialized } from './data/local-store'
import './styles/global.css'

// 启动顺序：先保证本地数据库初始化/迁移完成（幂等，失败会抛出明确错误），再挂载页面
ensureInitialized()
  .then(() => {
    const app = createApp(App)
    app.use(createPinia())
    app.use(router)
    app.mount('#app')
  })
  .catch((error) => {
    const root = document.querySelector('#app')
    if (root) {
      root.innerHTML =
        '<div style="padding:24px;font-family:sans-serif;color:#b42318">' +
        '本地数据初始化失败，请清理浏览器存储后重试：' +
        (error instanceof Error ? error.message : String(error)) +
        '</div>'
    }
  })
