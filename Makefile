.PHONY: install frontend build clean

# npm install 以 node_modules/.installed 为完成标记：装好前后续步骤不会跑，
# 中断后再次 make 会从未完成的步骤继续（断点续做）。
frontend/node_modules/.installed: frontend/package.json
	cd frontend && npm install
	@touch $@

install: frontend/node_modules/.installed

frontend: frontend/node_modules/.installed
	cd frontend && npm run dev

# 构建内含依赖检查 -> 类型检查 -> vite build -> 产物校验，任一失败立即停止并说明缺失项。
build: frontend/node_modules/.installed
	cd frontend && npm run build

clean:
	rm -rf frontend/node_modules frontend/dist
