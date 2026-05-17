FROM node:24-alpine AS runtime

WORKDIR /app

COPY packages/workspace-sdk ./packages/workspace-sdk
COPY packages/observability ./packages/observability
COPY packages/runtime-contract ./packages/runtime-contract
COPY packages/security ./packages/security
COPY services/workspace-agent ./services/workspace-agent

WORKDIR /app/services/workspace-agent

# Rewrite workspace:* references to file: paths and move tsx to dependencies
RUN node -e "\
const fs=require('fs');\
const p=require('./package.json');\
p.dependencies['@vibecore/workspace-sdk']='file:../../packages/workspace-sdk';\
p.dependencies['@vibecore/observability']='file:../../packages/observability';\
p.dependencies['@vibecore/runtime-contract']='file:../../packages/runtime-contract';\
p.dependencies['@vibecore/security']='file:../../packages/security';\
p.dependencies.tsx=p.devDependencies.tsx;\
delete p.devDependencies;\
fs.writeFileSync('package.json', JSON.stringify(p, null, 2));"
RUN npm install --omit=optional --no-audit --no-fund

ENV HOST=0.0.0.0
ENV PORT=8080
ENV WORKSPACE_ROOT=/workspace

EXPOSE 8080

CMD ["npx", "tsx", "src/server.ts"]
