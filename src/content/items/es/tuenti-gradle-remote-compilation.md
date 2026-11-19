---
type: project
title: Compilación remota de Gradle
status: published
from: 2019
topic: android
company: tuenti
app: tuenti-android-app
importance: 3
summary: Sistema de compilación remota de Gradle, montado sobre un frontal del chat que se iba a retirar, que redujo radicalmente los tiempos de compilación.
tags: [android, gradle, build, ci-cd]
related: [tuenti-release-cicd]
links:
  - label: Android Remote Compilation (Medium)
    url: https://medium.com/makingtuenti/android-remote-compilation-a4411873a8c6
    kind: medium
---

En 2019 las compilaciones de la app Android eran demasiado lentas.

Estábamos desmontando un frontal del chat, así que hablé con SRE para que nos lo prestaran y monté sobre él un sistema de compilación remota de Gradle.

Los tiempos de compilación bajaron radicalmente:

| Compilación     | En local | En remoto |
| --------------- | -------: | --------: |
| Build completo  |   ~235 s |    ~118 s |
| Build con tests |   ~487 s |    ~175 s |

Lo conté en detalle en [Android Remote Compilation](https://medium.com/makingtuenti/android-remote-compilation-a4411873a8c6).
