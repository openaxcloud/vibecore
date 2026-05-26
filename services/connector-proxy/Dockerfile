FROM node:24-alpine AS runtime

WORKDIR /app

COPY packages/connector-sdk ./packages/connector-sdk
COPY services/connector-proxy ./services/connector-proxy

WORKDIR /app/services/connector-proxy

RUN node -e "const fs=require('fs'); const p=require('./package.json'); p.dependencies['@vibecore/connector-sdk']='file:../../packages/connector-sdk'; p.dependencies.tsx=p.devDependencies.tsx; delete p.devDependencies; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));"
RUN npm install --omit=optional --no-audit --no-fund

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3030

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3030/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npx", "tsx", "src/server.ts"]
