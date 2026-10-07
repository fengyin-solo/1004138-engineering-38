.PHONY: install check build frontend deploy

# 统一入口：依赖 → 校验 → 构建，前一步失败立即停止并打印缺失项，修复后重跑本目标即可续做
all: install check build

install:
	cd frontend && npm install

# 环境 / 依赖 / 平台原生包校验（幂等，可反复执行）
check:
	cd frontend && npm run predeploy:check

# 类型检查 + 生产构建（自带 prebuild 校验）
build:
	cd frontend && npm run build

frontend:
	cd frontend && npm run dev

# 容器化静态部署（nginx 托管 dist，端口 8080）
deploy:
	docker compose up --build -d
