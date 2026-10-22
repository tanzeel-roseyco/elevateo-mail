FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
WORKDIR /build/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
COPY contracts/ /build/contracts/
RUN npm run build

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
RUN apt-get update -qq && apt-get install -y --no-install-recommends nginx openssh-client gettext-base \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default
COPY --from=build /build/apps/web/dist /srv/web
COPY ops/railway/nginx.conf.template /etc/nginx/elevateo.conf.template
COPY ops/railway/start.sh /usr/local/bin/elevateo-start
RUN chmod 0555 /usr/local/bin/elevateo-start && chown -R node:node /srv/web /var/lib/nginx /var/log/nginx /etc/nginx
USER node
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/elevateo-start"]
