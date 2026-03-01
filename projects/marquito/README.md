# Marquito - "Little Marquez"

To run:

```bash
export PATH="${HOME}/.local/node/bin:$PATH" && cd $(git rev-parse --show-toplevel)/marquito && npm run dev
```

To build:

```bash
export GIT_ROOT=$(git rev-parse --show-toplevel)
rm -rf "${GIT_ROOT}/marquito/out"
cd "${GIT_ROOT}/marquito"
npm run build
```

To deploy:

```bash
export CONN_STRING="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"

az storage blob delete-batch -s '$web' --connection-string "$CONN_STRING"
az storage blob upload-batch -d '$web' -s "${GIT_ROOT}/marquito/out" --connection-string "$CONN_STRING"
```