# Always-on execution engine (Gate 6+). Portable across Fly / Railway / Render.
# The engine holds the persistent broker connection + event loop, so it runs as a
# long-lived container — not on Vercel serverless (which serves the terminal).
#
# Scaffold only: the engine entrypoint is built at Gate 5. Secrets (Schwab OAuth,
# EIA key) come from the host's env, never baked into the image.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Dependency-light: install the workspace packages when their live deps land.
COPY packages/ /app/packages/
COPY apps/liddar-execution/ /app/apps/liddar-execution/

# RUN pip install -e packages/selflearn-core -e packages/execution-core -e packages/signals
# (uncommented at Gate 5 when the engine entrypoint + live adapter deps exist)

# CMD ["python", "-m", "liddar_execution.engine"]   # entrypoint: Gate 5
CMD ["python", "-c", "print('liddar-execution engine: scaffold. Entrypoint arrives at Gate 5.')"]
