---
id: BUG-CRON-001
---

## Bug

**TOUS les CronJobs plateforme morts depuis ~9/07** (workspace-gc, deploy-reap, siem-deliver, connector-reconnect, metering…) : le bump BullMQ ^5.76 (`bc7a393b`, durable deploy queue) rejette les jobId contenant `:` — `enqueue-cli.ts` composait `${job}:${ENQUEUE_DEDUP_KEY}` → chaque pod d'enqueue sortait `{"event":"enqueue.failed","error":"Custom Id cannot contain :"}` et le Job K8s passait Failed (BackoffLimitExceeded). Conséquences : aucun idle-stop workspace, aucun sleep server-deploy (les apps Phase B sont restées 1/1 12 h), reaper deploy mort, SIEM/metering morts. C'est la cause racine de l'observation « GC ne moissonne pas » du 15/07.

## 📤 Dispatché

✅ 16/07

## 💻 Codé

✅ `9b3315b1`

## ✅ Testé live

✅ **16/07**

## Preuve

Diagnostic live : pod nu (sans ENQUEUE_DEDUP_KEY) → `enqueued`, job CronJob → `enqueue.failed Custom Id cannot contain :`. Après CD : jobs `-29736310` (deploy-reap, siem) **Complete 1/1** avec worker `9b3315b127`, puis tick 05:15 `cron-workspace-gc-29736315` **Complete 1/1** et le sweep idle a endormi TOUTES les apps idle (11 Deployments `app-*` → 0/0, dont `app-cmrmb34mz`/`app-cmrmc2v0u` bloquées 1/1 depuis 12 h). +5 specs enqueue-cli (forme du jobId verrouillée).

