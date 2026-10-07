# ---- 构建阶段：装依赖（含依赖检查）、类型检查、产出 dist ----
FROM node:20-alpine AS build
WORKDIR /srv/web
COPY package.json ./
RUN npm install
COPY . .
# 生产环境变量默认值；可在 docker build --build-arg 覆盖。
ARG VITE_APP_NAME=机场地面保障调度管理系统
ARG VITE_API_BASE=
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# ---- 运行阶段：用 nginx 托管静态产物，history 路由回退到 index.html ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /srv/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
