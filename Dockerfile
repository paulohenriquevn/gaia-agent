FROM node:22-slim

# python3 é dependência de runtime: a ferramenta run_python executa código do benchmark.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates \
 && apt-get clean \
 && find /var/lib/apt/lists -mindepth 1 -delete

# Hugging Face Spaces executam o container como uid 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app

COPY --chown=user package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=user src ./src
COPY --chown=user public ./public

ENV PORT=7860 AGENT_CWD=/home/user/app
EXPOSE 7860

CMD ["node", "--experimental-strip-types", "src/server.ts"]
