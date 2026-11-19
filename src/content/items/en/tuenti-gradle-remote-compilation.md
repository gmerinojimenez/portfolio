---
type: project
title: Gradle Remote Build
review: pending
sourceHash: 7982726ad5b402d0
summary: Remote Gradle build system, set up on a chat frontend that was being decommissioned, which drastically cut build times.
tags: [android, gradle, build, ci-cd]
---

In 2019 the Android app builds were too slow.

We were decommissioning a chat frontend, so I talked with SRE to borrow it and set up a remote Gradle build system on top of it.

Build times dropped drastically:

| Build            | Locally | Remotely |
| ---------------- | ------: | -------: |
| Full build       |  ~235 s |   ~118 s |
| Build with tests |  ~487 s |   ~175 s |

I covered it in detail in [Android Remote Compilation](https://medium.com/makingtuenti/android-remote-compilation-a4411873a8c6).
