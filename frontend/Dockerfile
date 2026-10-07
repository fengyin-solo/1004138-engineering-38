# 构建阶段：先装依赖再产出静态文件
FROM node:20-alpine AS build
WORKDIR /srv/web
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# 运行阶段：nginx 托管静态产物，history 路由回退到 index.html
FROM nginx:1.27-alpine
COPY --from=build /srv/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
