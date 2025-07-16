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
# 3. Update the database with:
# docker exec -ti --user root sunshine npm run-script db-update
#
# 4. Run with:
#	docker run -d -p 3000:8000 --name sunshine sunshine
#
# 5. Login to running container (to update config (vi config/app.json):
#	docker exec -ti --user root sunshine /bin/sh
# --------------------------------------------------------------------
FROM node:14-alpine

EXPOSE 8000

LABEL org.label-schema.schema-version="1.0"
LABEL org.label-schema.docker.cmd="docker run -d -p 3000:8000 --name sunshine"

RUN apk add --no-cache \
    g++ \
    gcc \
    git \
    libc-dev \
    make \
    sqlite \
    python3

ARG ROOTDIR=/home/node
ARG APPDIR=sunshine
ARG GIT=https://github.com/rysiok/SunShine.git

USER node
WORKDIR /$ROOTDIR
RUN git clone $GIT $APPDIR
WORKDIR /$ROOTDIR/$APPDIR


RUN npm set unsafe-perm true
RUN npm install
CMD ["npm", "start"]
