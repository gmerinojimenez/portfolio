---
type: app
title: App Android de Tuenti
status: published
from: 2015-04
to: 2023-10
topic: android
company: tuenti
importance: 5
summary: Arquitectura de una app Android de consumo con unos 40 millones de usuarios, en el equipo core.
tags: [android, kotlin, architecture, compose]
# Los `from` son aproximados: el año de la versión estable de cada librería.
stack:
  - android-sdk
  - java
  - { id: kotlin, from: 2017 }
  - { id: coroutines, from: 2018 }
  - { id: flow, from: 2019 }
  - { id: compose, from: 2021 }
  - views-xml
  - { id: viewmodel, from: 2017 }
  - { id: livedata, from: 2017 }
  - { id: room, from: 2017 }
  - { id: navigation, from: 2019 }
  - { id: workmanager, from: 2019 }
  - { id: hilt, from: 2020 }
  - dagger
  - retrofit
  - okhttp
  - rest
  - junit
  - espresso
  - { id: mockk, from: 2017 }
  - { id: fcm, from: 2016 }
  - gradle
  - git
  - android-performance
  - android-lifecycle
related:
  [
    tuenti-modularization,
    tuenti-kotlin-compose-migration,
    tuenti-security-audits,
    tuenti-release-cicd,
    tuenti-voip-webrtc,
    tweaks,
  ]
role: Senior Software Engineer
---

Formé parte del equipo core, a cargo de la arquitectura de una app Android de consumo con unos 40 millones de usuarios. Senior desde julio de 2018.

Además:

- Analicé y optimicé el rendimiento y el consumo de memoria: detecté y corregí fugas de memoria, perfilé el arranque y los frames lentos, y saqué trabajo del hilo principal para evitar ANR, con ayuda de StrictMode.
- Mentoricé a ingenieros junior y de nivel medio.
- Lideré proyectos de varias personas.
