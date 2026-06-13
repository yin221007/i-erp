# Stage 1: Build
FROM node:20-alpine as build-stage

WORKDIR /app

# 复制依赖定义
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制所有源代码
COPY . .

# 执行生产环境构建
RUN npm run build

# Stage 2: Serve
FROM nginx:stable-alpine

# 从构建阶段复制编译产物到 Nginx 目录
COPY --from=build-stage /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]