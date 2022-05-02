# -------------------------------------------------------------------
# Minimal dockerfile from alpine base
#
# Instructions:
# =============
# 1. Create an empty directory and copy this file into it.
#
# 2. Create image with: 
#	docker build --tag sunshine:latest .
#
# 3. Run with: 
#	docker run -d -p 3000:3000 --name sunshine sunshine
#
# 4. Login to running container (to update config (vi config/app.json): 
#	docker exec -ti --user root sunshine /bin/sh
# --------------------------------------------------------------------
FROM node:14-alpine

EXPOSE 3000

LABEL org.label-schema.schema-version="1.0"
LABEL org.label-schema.docker.cmd="docker run -d -p 3000:3000 --name alpine_timeoff"

RUN apk add --no-cache \
    g++ \
    git \
    make \
    python2 \
    python3 \
    vim
    
RUN adduser --system app --home /app
USER app
WORKDIR /app
RUN git clone https://github.com/rysiok/SunShine.git timeoff-management
WORKDIR /app/timeoff-management

RUN npm install

CMD npm start
