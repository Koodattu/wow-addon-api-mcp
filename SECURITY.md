# Security policy

Please report vulnerabilities privately through GitHub's **Security → Report a vulnerability** flow for this repository. Do not open a public issue for an undisclosed vulnerability.

The installed server is intentionally read-only. It reads one bundled compressed dataset, communicates over stdio, and does not execute Lua or make network requests. Dataset generation and npm publishing occur only in maintainer workflows.
