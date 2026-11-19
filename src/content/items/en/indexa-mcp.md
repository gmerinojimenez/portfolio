---
type: oss
title: indexa-mcp
review: reviewed
sourceHash: 6783ba3b823b3c16
summary: Local, read-only MCP server to query Indexa Capital accounts from Claude.
tags: [ai, mcp, python, open-source]
---

Local [MCP](https://modelcontextprotocol.io) server to query my Indexa Capital accounts from Claude or any other MCP client. It's written in Python.

I designed it to be safe by construction:

- **Read-only.** It only sends `GET` requests to a closed list of endpoints, so it cannot move money or modify anything.
- **Local.** It runs on your machine over stdio, without opening any network port.
- **No personal data.** It never returns the identity document, the address, the account holders or the contract.

It provides tools to query accounts, portfolio, returns, fees, transactions and tax results.
