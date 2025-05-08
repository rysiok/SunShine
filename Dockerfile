# -------------------------------------------------------------------
# Minimal dockerfile from alpine base
#
# Instructions:
# =============
# 1. Create an empty directory and copy this file into it.
#
# 2. Create image with: 
#	docker build --tag timeoff:latest .
#
# 3. Run with: 
#	docker run -d -p 3000:3000 --name alpine_timeoff timeoff
#
# 4. Login to running container (to update config (vi config/app.json): 
#	docker exec -ti --user root alpine_timeoff /bin/sh
#--------------------------------------------------------------------
#It builds a multi-stage Docker image using Node.js on Alpine Linux
#First stage installs dependencies
#Second stage sets up the app environment
#Final container runs the app on port 3000
# --------------------------------------------------------------------
#You're assigning a name (dependencies) to this build stage so you can refer to it later.
FROM node:14-alpine AS dependencies       
RUN apk add --no-cache \                 
    nodejs npm                            #Installs nodejs and npm using Alpine’s package manager apk and #--no-cache avoids storing cache and keeps the image small.

COPY package.json  .
RUN npm install 

FROM node:14-alpine

LABEL org.label-schema.schema-version="1.0"
LABEL org.label-schema.docker.cmd="docker run -d -p 3000:3000 --name alpine_timeoff"

RUN apk add --no-cache \           
    nodejs npm \                   
    vim

RUN adduser --system app --home /app       #Creates a system user (app) with home directory /app
USER app
WORKDIR /app
COPY . /app
COPY --from=dependencies node_modules ./node_modules     #Copy node_modules from the dependencies stage into the current stage

CMD ["npm", "start"]

EXPOSE 3000
