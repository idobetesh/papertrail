# Architecture

## Overview

```
┌──────────┐     ┌─────────────────┐     ┌───────────┐     ┌────────┐
│ Telegram │────▶│ webhook-handler │────▶│Cloud Tasks│────▶│ worker │
└──────────┘     └─────────────────┘     └───────────┘     └────────┘
                                                                │
                         ┌──────────────────────────────────────┤
                         ▼                 ▼                    ▼
                   ┌───────────┐    ┌───────────┐    ┌────────────────┐
                   │  Storage  │    │  Sheets   │    │   Firestore    │
                   └───────────┘    └───────────┘    │ (jobs + config)│
                                                     └────────────────┘
```

## Services

| Service | Role |
|---------|------|
| `webhook-handler` | Receives Telegram webhooks, enqueues tasks |
| `worker` | Downloads images, calls LLM, generates PDFs, updates Sheets |
| Cloud Tasks | Retry with backoff, exactly-once delivery |
| Firestore | Job tracking, business config, invoice counters |

## Invoice Generation

```
/invoice → Session Flow → PDF Generation → Cloud Storage → Telegram
                              ↓
                    Firestore (config by chat ID)
```

| Component | Purpose |
|-----------|---------|
| `config.service` | Per-customer business config |
| `pdf.generator` | Puppeteer-based PDF rendering |
| `counter.service` | Atomic invoice numbering |

## Service Accounts

| Account | Purpose |
|---------|---------|
| `webhook-handler-sa` | Enqueue tasks, read secrets |
| `worker-sa` | Storage, Sheets, Firestore, secrets |
| `tasks-invoker-sa` | Invoke worker (OIDC) |
