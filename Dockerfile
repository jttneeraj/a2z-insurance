FROM node:22-alpine

WORKDIR /var/www/node/a2z-insurance

ENV TZ=Asia/Kolkata
ENV NODE_ENV=development

RUN apk add --no-cache tzdata python3 make g++ git \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ARG GITHUB_TOKEN
ARG SHARED_LIB_BRANCH=develop

RUN git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"

COPY package*.json ./

RUN npm install --omit=dev --legacy-peer-deps

RUN git config --global --unset url."https://${GITHUB_TOKEN}@github.com/".insteadOf || true

COPY . .

RUN mkdir -p logs uploads public/storage/temp \
    && chown -R appuser:appgroup /var/www/node/a2z-insurance

EXPOSE 4015

USER appuser

CMD ["node", "app.js"]