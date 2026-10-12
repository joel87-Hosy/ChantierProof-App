FROM nginx:alpine

COPY *.html /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY lib/ /usr/share/nginx/html/lib/
COPY v/ /usr/share/nginx/html/v/
COPY docs/ /usr/share/nginx/html/docs/

EXPOSE 80
