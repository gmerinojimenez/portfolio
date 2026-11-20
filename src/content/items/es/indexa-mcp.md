---
type: oss
title: indexa-mcp
status: published
from: 2026-11
topic: ai
importance: 2
summary: Servidor MCP local y de solo lectura para consultar desde Claude las cuentas de Indexa Capital.
tags: [ai, mcp, python, open-source]
stack: [python, mcp, claude]
related: [cert-model-context-protocol]
links:
  - label: GitHub
    url: https://github.com/gmerinojimenez/indexa-mcp
    kind: github
---

Servidor [MCP](https://modelcontextprotocol.io) local para consultar mis cuentas de Indexa Capital desde Claude o cualquier otro cliente MCP. Está hecho en Python.

Lo diseñé para que fuera seguro por construcción:

- **Solo lectura.** Únicamente envía peticiones `GET` a una lista cerrada de endpoints, así que no puede mover dinero ni modificar nada.
- **Local.** Se ejecuta en tu máquina por stdio, sin abrir ningún puerto de red.
- **Sin datos personales.** Nunca devuelve el documento de identidad, la dirección, los titulares ni el contrato.

Ofrece herramientas para consultar las cuentas, la cartera, la rentabilidad, las comisiones, los movimientos y los resultados fiscales.
