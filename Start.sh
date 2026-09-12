#!/bin/bash
cd "$(dirname "$0")"
# Embedded Mozilla CA bundle — trusted as EXTRA roots by Node-side TLS in the
# main process (read by Node at process start only, hence the export here).
export NODE_EXTRA_CA_CERTS="$(pwd)/cacert.pem"
npm start
