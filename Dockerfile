# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS node-base

# Recalculate the dataset and compile the UI during the image build only.
FROM python:3.12-slim-bookworm AS build
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VITE_DATA_MODE=project \
    MONEYGRAPH_PYTHON=/usr/local/bin/python3

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates libstdc++6 libatomic1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node-base /usr/local/bin/node /usr/local/bin/node
COPY --from=node-base /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version && npm --version

WORKDIR /build/moneygraph
COPY requirements.txt ./requirements.txt
COPY apps/backend/requirements.txt ./apps/backend/requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt

WORKDIR /build/moneygraph/apps/frontend
COPY apps/frontend/package.json apps/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

WORKDIR /build/moneygraph
COPY main.py ./main.py
COPY apps/backend/moneygraph ./apps/backend/moneygraph
COPY data/nodes.parquet data/edges.parquet data/transactions.parquet ./data/
COPY apps/frontend ./apps/frontend

# Both full calculations must finish within the case limit and agree byte for byte.
RUN python - <<'PY'
import hashlib
from pathlib import Path
import subprocess
import sys

outputs = [Path("results") / name for name in (
    "nodes_roles.csv", "clusters.csv", "top_nodes.csv",
)]
first = None
for run in range(2):
    subprocess.run([sys.executable, "main.py"], check=True, timeout=300)
    hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in outputs}
    if first is not None and hashes != first:
        raise SystemExit("Mandatory CSV outputs differ between pipeline runs")
    first = hashes
print("Verified deterministic mandatory CSV outputs:", hashes)
PY

WORKDIR /build/moneygraph/apps/frontend
RUN npm run data:project
RUN npm run lint \
    && npm test \
    && npm run test:agent \
    && npm run build \
    && npm run test:server
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

# The runtime needs no Python, raw Parquet files, or local .env.
FROM node-base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /build/moneygraph/apps/frontend/package.json ./package.json
COPY --from=build --chown=node:node /build/moneygraph/apps/frontend/node_modules ./node_modules
COPY --from=build --chown=node:node /build/moneygraph/apps/frontend/dist ./dist
COPY --from=build --chown=node:node /build/moneygraph/apps/frontend/server/production.mjs /build/moneygraph/apps/frontend/server/agent.mjs /build/moneygraph/apps/frontend/server/agent-http.mjs /build/moneygraph/apps/frontend/server/investigation-tools.mjs ./server/
COPY --from=build --chown=node:node /build/moneygraph/apps/frontend/src/lib/contracts.ts ./src/lib/contracts.ts
# Keep the three jury artifacts available to `docker compose cp`, outside dist/.
COPY --from=build --chown=node:node /build/moneygraph/results/nodes_roles.csv /build/moneygraph/results/clusters.csv /build/moneygraph/results/top_nodes.csv ./results/
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/healthz').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server/production.mjs"]
