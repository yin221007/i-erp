FROM nginx:stable-alpine

COPY deploy/maintenance/nginx.conf /etc/nginx/nginx.conf
COPY deploy/maintenance/index.html /usr/share/nginx/html/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
