# Papertrail SaaS Migration Plan

> **Goal:** Transform Papertrail from a self-hosted developer tool into a monetizable multi-tenant SaaS product.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Target SaaS Architecture](#target-saas-architecture)
4. [Migration Phases](#migration-phases)
5. [Technical Changes](#technical-changes)
6. [Data Model](#data-model)
7. [Pricing Strategy](#pricing-strategy)
8. [Tradeoffs Analysis](#tradeoffs-analysis)
9. [Risks & Mitigations](#risks--mitigations)
10. [Security, Privacy & Abuse Prevention](#security-privacy--abuse-prevention)
11. [Timeline & Effort](#timeline--effort)
12. [Success Metrics](#success-metrics)

---

## Executive Summary

### The Problem

Current onboarding requires **2+ hours of technical setup**:
- GCP account with billing
- Telegram bot creation
- API keys (OpenAI/Gemini)
- Google Sheets setup
- Terraform deployment

**Result:** Only developers can use Papertrail. Zero monetization potential.

### The Solution

Transform to multi-tenant SaaS where onboarding takes **30 seconds**:
1. User adds `@PapertrailBot` to their Telegram group
2. Bot auto-provisions their tenant
3. User starts sending invoices immediately

### Key Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Onboarding time | 2+ hours | 30 seconds |
| Technical knowledge required | High | None |
| Monetizable | ❌ No | ✅ Yes |
| Scalable to 1000s of users | ❌ No | ✅ Yes |

---

## Current State Analysis

### Architecture (Self-Hosted Model)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Per-User Deployment                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User's Telegram Bot ──▶ User's GCP Project                    │
│         │                        │                               │
│         ▼                        ▼                               │
│   User's webhook-handler   User's worker                        │
│         │                        │                               │
│         └────────────────────────┼──────────────────────┐       │
│                                  │                      │       │
│                                  ▼                      ▼       │
│                          User's Firestore      User's Sheets    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Current Onboarding Steps

| Step | Time | Difficulty | Blocker? |
|------|------|------------|----------|
| 1. Create GCP account + billing | 20 min | Medium | 🔴 Yes |
| 2. Create Telegram bot (@BotFather) | 5 min | Easy | 🟡 Friction |
| 3. Get OpenAI/Gemini API key | 10 min | Medium | 🔴 Yes |
| 4. Create Google Sheet | 5 min | Easy | 🟡 Friction |
| 5. Share Sheet with service account | 5 min | Medium | 🔴 Yes |
| 6. Install Terraform, Docker, Node.js | 30 min | Hard | 🔴 Yes |
| 7. Clone repo, configure terraform.tfvars | 15 min | Hard | 🔴 Yes |
| 8. Deploy infrastructure | 20 min | Hard | 🔴 Yes |
| **Total** | **~2 hours** | **Expert** | |

### What Works Well ✅

- Reliable Cloud Run + Cloud Tasks architecture
- Idempotent processing with Firestore job tracking
- Dual LLM support (Gemini primary, OpenAI fallback)
- Hebrew + English invoice support
- Duplicate detection

### What Blocks Monetization ❌

- Each user needs their own GCP project
- Each user needs their own API keys
- Google Sheets is per-user (requires manual sharing)
- No multi-tenant data isolation
- No usage tracking or limits

---

## Target SaaS Architecture

### Multi-Tenant Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    Single SaaS Deployment                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   All Users ──────────▶ @PapertrailBot (single bot)             │
│                               │                                  │
│                               ▼                                  │
│                        webhook-handler                           │
│                               │                                  │
│                               ▼                                  │
│                         Cloud Tasks                              │
│                               │                                  │
│                               ▼                                  │
│                           worker                                 │
│                               │                                  │
│              ┌────────────────┼────────────────┐                │
│              ▼                ▼                ▼                │
│         Firestore      Cloud Storage     (Optional)             │
│         (per-chat)      (per-chat)     Google Sheets            │
│                                                                  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │ Chat -100A  │  │ Chat -100B  │  │ Chat -100C  │            │
│   │ ├─settings  │  │ ├─settings  │  │ ├─settings  │            │
│   │ ├─invoices  │  │ ├─invoices  │  │ ├─invoices  │            │
│   │ └─reports   │  │ └─reports   │  │ └─reports   │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Target Onboarding Steps

| Step | Time | Difficulty |
|------|------|------------|
| 1. Add @PapertrailBot to group | 10 sec | Easy |
| 2. Send /start (auto-provisions) | 5 sec | Easy |
| 3. Send first invoice | 15 sec | Easy |
| **Total** | **30 seconds** | **Anyone** |

---

## Migration Phases

### Phase 1: Multi-Tenant Foundation (Week 1-2)

**Goal:** Enable multiple chats to use a single bot instance

| Task | Effort | Priority |
|------|--------|----------|
| Auto-create tenant on /start | 4h | 🔴 Critical |
| Store full invoice data in Firestore | 6h | 🔴 Critical |
| Partition Cloud Storage by chatId | 4h | 🔴 Critical |
| Make Google Sheets optional | 4h | 🔴 Critical |
| Basic /report from Firestore | 6h | 🔴 Critical |
| **Subtotal** | **24h** | |

**Deliverable:** Bot works for multiple chats without Sheets

### Phase 2: Self-Service Features (Week 3)

**Goal:** Users can manage their own data

| Task | Effort | Priority |
|------|--------|----------|
| /export command (CSV download) | 4h | 🟡 Important |
| /settings command (preferences) | 4h | 🟡 Important |
| /stats command (usage overview) | 3h | 🟡 Important |
| /help with onboarding guide | 2h | 🟡 Important |
| Welcome message flow | 3h | 🟡 Important |
| **Subtotal** | **16h** | |

**Deliverable:** Full self-service experience

### Phase 3: Monetization (Week 4)

**Goal:** Enable paid subscriptions

| Task | Effort | Priority |
|------|--------|----------|
| Subscription data model | 3h | 🔴 Critical |
| Usage tracking middleware | 4h | 🔴 Critical |
| Tier limits enforcement | 4h | 🔴 Critical |
| Telegram Stars integration | 6h | 🔴 Critical |
| Upgrade prompts & UX | 4h | 🔴 Critical |
| /subscribe, /billing commands | 4h | 🟡 Important |
| **Subtotal** | **25h** | |

**Deliverable:** Working freemium model

### Phase 4: Premium Features (Week 5-6)

**Goal:** Differentiate paid tiers

| Task | Effort | Priority |
|------|--------|----------|
| Google Sheets integration (opt-in) | 8h | 🟡 Important |
| Custom report builder | 12h | 🟢 Nice-to-have |
| Natural language assistant | 16h | 🟢 Nice-to-have |
| PDF report generation | 8h | 🟢 Nice-to-have |
| **Subtotal** | **44h** | |

**Deliverable:** Premium features that justify paid tier

---

## Technical Changes

### 1. Remove Sheets as Requirement

**Current:**
```typescript
// worker must have SHEET_ID
const config = {
  sheetId: env.SHEET_ID,  // Required
};
```

**New:**
```typescript
const config = {
  sheetId: env.SHEET_ID || null,  // Optional, for admin/legacy
};

// Per-tenant optional Sheets
const tenant = await getTenant(chatId);
if (tenant.sheetsIntegration?.sheetId) {
  await syncToSheets(tenant.sheetsIntegration.sheetId, invoiceData);
}
```

### 2. Store Invoice Data (Not Just Jobs)

**Current:** Firestore stores job status, not invoice data
```typescript
// jobs/{chatId}_{messageId}
{
  status: 'processed',
  driveLink: '...',
  // Extraction data NOT stored
}
```

**New:** Firestore stores complete invoice data
```typescript
// tenants/{chatId}/invoices/{invoiceId}
{
  // Full extraction
  vendorName: 'Wolt',
  totalAmount: 85.50,
  currency: 'ILS',
  invoiceDate: '2026-01-10',
  category: 'Food',
  
  // Metadata
  messageId: 12345,
  imageUrl: 'gs://...',
  processedAt: Timestamp,
  confidence: 0.92,
}
```

### 3. Auto-Provision Tenants

**New endpoint/handler:**
```typescript
// Handle /start command
async function handleStart(chatId: number, userId: number, chatTitle: string) {
  const existingTenant = await getTenant(chatId);
  
  if (!existingTenant) {
    await createTenant({
      chatId,
      chatTitle,
      createdBy: userId,
      tier: 'free',
      monthlyLimit: 30,
      settings: {
        language: 'auto',
        currency: 'ILS',
        timezone: 'Asia/Jerusalem',
      },
      createdAt: new Date(),
    });
  }
  
  await sendWelcomeMessage(chatId);
}
```

### 4. Usage Tracking Middleware

```typescript
// Before processing each invoice
async function checkAndTrackUsage(chatId: number): Promise<boolean> {
  const tenant = await getTenant(chatId);
  const usage = await getMonthlyUsage(chatId);
  
  if (usage.invoicesProcessed >= tenant.monthlyLimit) {
    await sendUpgradePrompt(chatId);
    return false; // Block processing
  }
  
  await incrementUsage(chatId, 'invoicesProcessed');
  return true; // Allow processing
}
```

### 5. New Commands

| Command | Description | Tier |
|---------|-------------|------|
| `/start` | Initialize/welcome | All |
| `/help` | Show commands | All |
| `/report` | Generate expense report | All |
| `/stats` | Show usage statistics | All |
| `/export` | Download data as CSV | Pro |
| `/settings` | Configure preferences | All |
| `/subscribe` | Manage subscription | All |
| `/connect` | Connect Google Sheets | Pro |
| `/ask <question>` | Natural language query | Pro |

---

## Data Model

### Firestore Collections

```
firestore/
│
├── tenants/                          # One per Telegram chat
│   └── {chatId}/
│       ├── chatId: number
│       ├── chatTitle: string
│       ├── createdBy: number         # User ID who added bot
│       ├── createdAt: Timestamp
│       │
│       ├── subscription/
│       │   ├── tier: 'free' | 'pro' | 'business'
│       │   ├── status: 'active' | 'cancelled' | 'past_due'
│       │   ├── currentPeriodEnd: Timestamp
│       │   └── paymentProvider: 'telegram_stars' | 'stripe'
│       │
│       ├── settings/
│       │   ├── language: 'he' | 'en' | 'auto'
│       │   ├── currency: 'ILS' | 'USD' | 'EUR'
│       │   ├── timezone: string
│       │   └── notifyOnProcess: boolean
│       │
│       ├── integrations/
│       │   └── sheets?: { sheetId, lastSyncAt }
│       │
│       └── invoices/                 # Subcollection
│           └── {invoiceId}/
│               ├── vendorName: string | null
│               ├── totalAmount: number | null
│               ├── currency: string | null
│               ├── invoiceDate: string | null
│               ├── invoiceNumber: string | null
│               ├── category: string
│               ├── messageId: number
│               ├── uploaderUserId: number
│               ├── uploaderUsername: string
│               ├── imageUrl: string
│               ├── processedAt: Timestamp
│               ├── llmProvider: 'gemini' | 'openai'
│               └── confidence: number
│
├── usage/                            # Monthly usage tracking
│   └── {chatId}_{YYYY-MM}/
│       ├── invoicesProcessed: number
│       ├── reportsGenerated: number
│       ├── nlQueries: number
│       └── llmCostUSD: number
│
├── jobs/                             # (existing) Processing jobs
│   └── {chatId}_{messageId}/
│
└── conversations/                    # (future) NL assistant context
    └── {chatId}_{userId}/
```

### Cloud Storage Structure

```
gs://papertrail-invoices/
└── tenants/
    └── {chatId}/
        └── {YYYY}/
            └── {MM}/
                └── {invoiceId}.{ext}
```

---

## Pricing Strategy

### Tier Comparison

| Feature | Free | Pro (₪29/mo) | Business (₪99/mo) |
|---------|------|--------------|-------------------|
| Invoices/month | 30 | Unlimited | Unlimited |
| Reports | 2/month | Unlimited | Unlimited |
| Export (CSV) | ❌ | ✅ | ✅ |
| Google Sheets sync | ❌ | ✅ | ✅ |
| AI Assistant (NL) | ❌ | 50 queries | Unlimited |
| Custom reports | ❌ | ✅ | ✅ |
| Multi-user (groups) | ❌ | ❌ | ✅ |
| API access | ❌ | ❌ | ✅ |
| Priority support | ❌ | ❌ | ✅ |

### Unit Economics

| Cost Item | Per Invoice |
|-----------|-------------|
| Gemini API (primary) | $0.005 |
| OpenAI fallback (rare) | $0.02 |
| Cloud Storage | $0.001 |
| Cloud Run | $0.002 |
| **Total Cost** | **~$0.01** |

| Revenue Model | Per Invoice |
|---------------|-------------|
| Free tier (30/mo) | $0 |
| Pro tier (unlimited) | ~$0.05-0.10* |
| Business tier | ~$0.15* |

*Assuming ~300-600 invoices/month per paid user

### Break-Even Analysis

| Scenario | Monthly Revenue | Monthly Cost | Profit |
|----------|-----------------|--------------|--------|
| 100 free users | $0 | $30 | -$30 |
| 50 Pro users | $725 | $50 | $675 |
| 10 Business users | $495 | $30 | $465 |
| **Mix (100F + 20P + 5B)** | **$1,075** | **$100** | **$975** |

---

## Tradeoffs Analysis

### 1. Google Sheets: Required → Optional

| Aspect | Keep Required | Make Optional (Recommended) |
|--------|---------------|----------------------------|
| **Onboarding** | ❌ Complex | ✅ Simple |
| **User expectation** | Familiar | Learning curve |
| **Data portability** | ✅ User owns data | Need /export feature |
| **Real-time sync** | ✅ Always current | On-demand only |
| **Effort** | None | 8h for export feature |

**Recommendation:** Make optional, offer as Pro feature

### 2. Single Bot vs. Per-User Bots

| Aspect | Per-User Bots | Single Bot (Recommended) |
|--------|---------------|--------------------------|
| **Onboarding** | ❌ User creates bot | ✅ Just add to group |
| **Branding** | User's brand | Papertrail brand |
| **White-label** | ✅ Natural | ❌ Extra work |
| **Maintenance** | ❌ Complex | ✅ Simple |
| **Scaling** | ❌ Many webhooks | ✅ One webhook |

**Recommendation:** Single bot for SaaS, white-label as Business tier feature

### 3. Firestore vs. PostgreSQL

| Aspect | Firestore (Current) | PostgreSQL |
|--------|---------------------|------------|
| **Setup** | ✅ Zero config | ❌ Need to provision |
| **Scaling** | ✅ Auto | Manual |
| **Cost at scale** | Higher per-read | Lower |
| **Complex queries** | ❌ Limited | ✅ Full SQL |
| **Real-time** | ✅ Built-in | ❌ Need additional |
| **Migration effort** | None | 2-3 weeks |

**Recommendation:** Stay with Firestore for MVP, evaluate at 1000+ users

### 4. Telegram Stars vs. Stripe

| Aspect | Telegram Stars | Stripe |
|--------|----------------|--------|
| **Setup** | ✅ 50 lines | ❌ 2-3 days |
| **UX** | ✅ In-chat | ❌ External page |
| **Fees** | 30% | 2.9% + $0.30 |
| **Currencies** | Stars only | All |
| **Recurring** | ❌ Manual | ✅ Auto |
| **Israeli cards** | ✅ Via Telegram | ⚠️ Need Stripe Atlas |

**Recommendation:** Start with Telegram Stars, add Stripe later for better margins

### 5. Hebrew-First vs. English-First

| Aspect | Hebrew-First | English-First | Both (Recommended) |
|--------|--------------|---------------|-------------------|
| **Market** | Israel only | Global | Global |
| **Competition** | Less | More | Balanced |
| **LLM support** | ✅ Gemini good | ✅ All | ✅ All |
| **Effort** | Low | Low | Medium |

**Recommendation:** Support both with auto-detection

---

## Risks & Mitigations

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM costs spike | Medium | High | Usage limits, caching, model fallback |
| Firestore costs at scale | Low | Medium | Monitor, migrate to SQL if needed |
| Telegram API limits | Low | High | Rate limiting, queue management |
| Data isolation breach | Low | Critical | Strict chatId filtering, security review |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Low conversion to paid | High | High | Focus on Pro value, iterate on pricing |
| Competition (Greeninvoice) | Medium | Medium | Focus on Telegram-native UX |
| Telegram changes API/policy | Low | Critical | Abstract bot interface |
| Users expect Sheets | Medium | Low | Offer as Pro feature |

### Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Support burden | Medium | Medium | Good docs, /help command |
| Abuse/spam | Medium | High | Rate limits, report mechanism |
| GDPR/privacy complaints | Low | High | Clear privacy policy, data export |

---

## Security, Privacy & Abuse Prevention

This section outlines how we protect user data, prevent abuse, and maintain a secure multi-tenant environment.

### 1. Data Isolation (Multi-Tenancy Security)

**Principle:** Every database query MUST be scoped to the tenant's `chatId`.

```typescript
// ❌ DANGEROUS - No tenant isolation
const invoices = await db.collection('invoices').get();

// ✅ SAFE - Always filter by chatId
const invoices = await db
  .collection('tenants')
  .doc(String(chatId))
  .collection('invoices')
  .get();
```

**Implementation:**

```typescript
// middleware/tenantIsolation.ts
export function withTenantScope<T>(
  chatId: number,
  operation: (tenantRef: FirebaseFirestore.DocumentReference) => Promise<T>
): Promise<T> {
  const tenantRef = db.collection('tenants').doc(String(chatId));
  return operation(tenantRef);
}

// Usage - impossible to access other tenant's data
await withTenantScope(chatId, async (tenant) => {
  return tenant.collection('invoices').get();
});
```

**Firestore Security Rules:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Tenants collection - only accessible via authenticated service
    match /tenants/{chatId} {
      // No direct client access - all access through Cloud Run
      allow read, write: if false;
    }
    
    // Jobs collection - service access only
    match /jobs/{jobId} {
      allow read, write: if false;
    }
  }
}
```

### 2. Content Moderation & Abuse Prevention

#### 2.1 Image Content Filtering

**Risk:** Users could upload inappropriate/illegal images instead of invoices.

**Solution:** Multi-layer filtering

```typescript
// services/worker/src/services/contentModeration.ts

interface ModerationResult {
  safe: boolean;
  reason?: string;
  confidence: number;
}

export async function moderateImage(imageBuffer: Buffer): Promise<ModerationResult> {
  // Layer 1: Google Cloud Vision SafeSearch
  const visionResult = await detectSafeSearch(imageBuffer);
  
  if (visionResult.adult === 'VERY_LIKELY' || 
      visionResult.violence === 'VERY_LIKELY' ||
      visionResult.racy === 'VERY_LIKELY') {
    return { safe: false, reason: 'inappropriate_content', confidence: 0.95 };
  }
  
  // Layer 2: LLM verification during extraction
  // The extraction prompt can include: "If this is not an invoice/receipt, respond with {not_invoice: true}"
  
  // Layer 3: File type validation
  const fileType = await detectFileType(imageBuffer);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(fileType)) {
    return { safe: false, reason: 'invalid_file_type', confidence: 1.0 };
  }
  
  return { safe: true, confidence: 0.9 };
}
```

#### 2.2 Rate Limiting

**Protection against:** DoS attacks, cost abuse, spam

```typescript
// Rate limits per tenant
const RATE_LIMITS = {
  free: {
    invoicesPerMinute: 5,
    invoicesPerHour: 30,
    invoicesPerDay: 50,
    reportsPerHour: 2,
    nlQueriesPerHour: 0,
  },
  pro: {
    invoicesPerMinute: 20,
    invoicesPerHour: 200,
    invoicesPerDay: 1000,
    reportsPerHour: 50,
    nlQueriesPerHour: 20,
  },
  business: {
    invoicesPerMinute: 50,
    invoicesPerHour: 500,
    invoicesPerDay: 5000,
    reportsPerHour: 200,
    nlQueriesPerHour: 100,
  },
};

// Redis-based rate limiter (or Firestore with TTL)
export async function checkRateLimit(
  chatId: number,
  action: 'invoice' | 'report' | 'nl_query'
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const tenant = await getTenant(chatId);
  const limits = RATE_LIMITS[tenant.tier];
  
  const key = `ratelimit:${chatId}:${action}`;
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, 60); // 1 minute window
  }
  
  const limit = limits[`${action}sPerMinute`];
  if (current > limit) {
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfter: ttl };
  }
  
  return { allowed: true };
}
```

#### 2.3 Abuse Detection & Response

```typescript
// Abuse patterns to detect
const ABUSE_PATTERNS = {
  // Rapid repeated failures (possible probing)
  rapidFailures: {
    threshold: 10,
    window: '5m',
    action: 'temporary_ban',
  },
  
  // Excessive non-invoice uploads
  nonInvoiceUploads: {
    threshold: 5,
    window: '1h',
    action: 'warn_then_ban',
  },
  
  // LLM prompt injection attempts
  promptInjection: {
    patterns: [
      /ignore previous instructions/i,
      /you are now/i,
      /forget your rules/i,
      /system prompt/i,
    ],
    action: 'log_and_block',
  },
};

// Abuse response handler
export async function handleAbuseDetection(
  chatId: number,
  abuseType: string,
  severity: 'low' | 'medium' | 'high'
): Promise<void> {
  // Log for review
  await logSecurityEvent({
    type: 'abuse_detected',
    chatId,
    abuseType,
    severity,
    timestamp: new Date(),
  });
  
  switch (severity) {
    case 'low':
      // Just log, continue monitoring
      break;
      
    case 'medium':
      // Send warning to user
      await sendMessage(chatId, 
        '⚠️ Unusual activity detected. Please only send invoice images.');
      break;
      
    case 'high':
      // Temporary ban (1 hour)
      await banTenant(chatId, { duration: '1h', reason: abuseType });
      await sendMessage(chatId,
        '🚫 Your account has been temporarily suspended due to policy violations.');
      break;
  }
}
```

### 3. Data Privacy & GDPR Compliance

#### 3.1 Data Retention Policy

```typescript
// Data retention configuration
const DATA_RETENTION = {
  invoices: {
    free: '90 days',      // Auto-delete after 90 days
    pro: '2 years',
    business: '7 years',  // Accounting requirement
  },
  
  processingLogs: '30 days',  // Debug logs
  
  deletedTenants: '30 days',  // Grace period before permanent deletion
};

// Scheduled cleanup job (Cloud Scheduler)
export async function cleanupExpiredData(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  
  // Find free tier tenants with old data
  const tenantsToClean = await db
    .collection('tenants')
    .where('tier', '==', 'free')
    .get();
  
  for (const tenant of tenantsToClean.docs) {
    const oldInvoices = await tenant.ref
      .collection('invoices')
      .where('processedAt', '<', cutoffDate)
      .get();
    
    // Delete in batches
    const batch = db.batch();
    oldInvoices.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    // Also delete from Cloud Storage
    await deleteOldImages(tenant.id, cutoffDate);
  }
}
```

#### 3.2 User Data Rights (GDPR Article 15-20)

```typescript
// /export command - Right to data portability
export async function exportUserData(chatId: number): Promise<string> {
  const tenant = await getTenant(chatId);
  const invoices = await getAllInvoices(chatId);
  
  const exportData = {
    exportedAt: new Date().toISOString(),
    tenant: {
      chatId: tenant.chatId,
      createdAt: tenant.createdAt,
      tier: tenant.tier,
      settings: tenant.settings,
    },
    invoices: invoices.map(inv => ({
      id: inv.id,
      vendorName: inv.vendorName,
      amount: inv.totalAmount,
      currency: inv.currency,
      date: inv.invoiceDate,
      category: inv.category,
      processedAt: inv.processedAt,
      imageUrl: inv.imageUrl,
    })),
    totalInvoices: invoices.length,
  };
  
  // Generate downloadable file
  const csvUrl = await generateCSVExport(exportData);
  const jsonUrl = await generateJSONExport(exportData);
  
  return `Your data export is ready:\n📄 CSV: ${csvUrl}\n📋 JSON: ${jsonUrl}`;
}

// /deletedata command - Right to erasure
export async function deleteUserData(chatId: number): Promise<void> {
  // Soft delete first (30 day recovery period)
  await db.collection('tenants').doc(String(chatId)).update({
    status: 'pending_deletion',
    deletionRequestedAt: new Date(),
    scheduledDeletionAt: addDays(new Date(), 30),
  });
  
  // Send confirmation
  await sendMessage(chatId, 
    '🗑️ Your data deletion request has been received.\n\n' +
    'Your data will be permanently deleted in 30 days.\n' +
    'Send /canceldelete to cancel this request.');
}
```

#### 3.3 Privacy Policy Requirements

Must include:
- What data is collected (images, extracted text, metadata)
- How data is processed (LLM extraction)
- Where data is stored (GCP region)
- Third-party processors (Google, OpenAI)
- Retention periods
- User rights (access, export, delete)
- Contact information

### 4. Encryption & Data Protection

#### 4.1 Data at Rest

| Data | Encryption | Notes |
|------|------------|-------|
| Firestore | ✅ AES-256 (Google-managed) | Automatic |
| Cloud Storage | ✅ AES-256 (Google-managed) | Automatic |
| Secrets | ✅ Secret Manager | Customer-managed keys optional |

#### 4.2 Data in Transit

```typescript
// All external calls use HTTPS
const telegramApi = 'https://api.telegram.org';
const openaiApi = 'https://api.openai.com';

// Cloud Run services are HTTPS by default
// Internal GCP traffic uses Google's encrypted network
```

#### 4.3 Sensitive Data Handling

```typescript
// Never log sensitive data
logger.info({ 
  chatId, 
  messageId,
  // ❌ Never log: imageContent, extractedData, apiKeys
});

// Mask sensitive fields in error reports
function sanitizeForLogging(data: any): any {
  const sensitiveFields = [
    'private_key', 'api_key', 'token', 'password',
    'invoice_number', 'vendor_name', 'amount'
  ];
  
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      sensitiveFields.some(f => key.toLowerCase().includes(f))
        ? '[REDACTED]'
        : value
    ])
  );
}
```

### 5. LLM Security (Prompt Injection Prevention)

#### 5.1 Input Sanitization

```typescript
// Don't pass user-controllable text directly to LLM
// Images are generally safe, but captions/filenames could be malicious

export function sanitizeUserInput(input: string): string {
  // Remove potential prompt injection patterns
  const sanitized = input
    .replace(/ignore (all )?(previous |prior )?instructions/gi, '')
    .replace(/you are now/gi, '')
    .replace(/system prompt/gi, '')
    .replace(/\{\{.*\}\}/g, '')  // Template injection
    .slice(0, 500);  // Limit length
  
  return sanitized;
}
```

#### 5.2 Output Validation

```typescript
// Always validate LLM output matches expected schema
import { z } from 'zod';

const InvoiceExtractionSchema = z.object({
  vendor_name: z.string().nullable(),
  total_amount: z.number().nullable(),
  currency: z.string().max(3).nullable(),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  invoice_number: z.string().max(100).nullable(),
  category: z.enum([...VALID_CATEGORIES]),
  confidence: z.number().min(0).max(1),
});

// Reject if LLM returns unexpected structure
function validateExtraction(raw: unknown): InvoiceExtraction {
  const result = InvoiceExtractionSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Invalid LLM response structure');
  }
  return result.data;
}
```

### 6. Access Control & Authentication

#### 6.1 Telegram-Based Authentication

```typescript
// Verify requests come from Telegram
export function verifyTelegramWebhook(req: Request): boolean {
  // Secret path validation
  const { secretPath } = req.params;
  if (secretPath !== config.webhookSecretPath) {
    return false;
  }
  
  // Optionally verify Telegram's IP ranges
  // https://core.telegram.org/bots/webhooks#the-short-version
  
  return true;
}

// Verify user is admin for sensitive operations
export async function isGroupAdmin(
  chatId: number, 
  userId: number
): Promise<boolean> {
  const response = await telegram.getChatMember(chatId, userId);
  return ['creator', 'administrator'].includes(response.status);
}

// Require admin for certain commands
const ADMIN_ONLY_COMMANDS = ['/settings', '/deletedata', '/billing'];
```

#### 6.2 Service-to-Service Authentication

```typescript
// Cloud Tasks → Worker authentication
// Uses GCP IAM service account tokens (automatic)

// Verify request is from Cloud Tasks
export function verifyCloudTasksRequest(req: Request): boolean {
  const taskName = req.headers['x-cloudtasks-taskname'];
  const queueName = req.headers['x-cloudtasks-queuename'];
  
  if (!taskName || !queueName) {
    return false;
  }
  
  // Verify OIDC token if configured
  // (Handled by Cloud Run IAM)
  
  return true;
}
```

### 7. Monitoring & Incident Response

#### 7.1 Security Logging

```typescript
// Security events to log
enum SecurityEvent {
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INVALID_WEBHOOK_SECRET = 'invalid_webhook_secret',
  CONTENT_MODERATION_BLOCK = 'content_moderation_block',
  PROMPT_INJECTION_ATTEMPT = 'prompt_injection_attempt',
  DATA_EXPORT_REQUESTED = 'data_export_requested',
  DATA_DELETION_REQUESTED = 'data_deletion_requested',
  ABUSE_DETECTED = 'abuse_detected',
  TENANT_BANNED = 'tenant_banned',
}

// Structured security logging
export function logSecurityEvent(event: {
  type: SecurityEvent;
  chatId?: number;
  userId?: number;
  details?: Record<string, unknown>;
  severity: 'info' | 'warn' | 'error' | 'critical';
}): void {
  logger.log({
    level: event.severity,
    message: `[SECURITY] ${event.type}`,
    ...event,
    timestamp: new Date().toISOString(),
  });
  
  // Critical events → Alert (PagerDuty/Slack)
  if (event.severity === 'critical') {
    alertOnCall(event);
  }
}
```

#### 7.2 Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Failed auth attempts | 10/min | 50/min |
| Content moderation blocks | 5/hour | 20/hour |
| Rate limit hits | 100/hour | 500/hour |
| LLM errors | 10% error rate | 25% error rate |
| Unusual cost spike | 2x daily average | 5x daily average |

### 8. Security Checklist for Launch

#### Pre-Launch Security Review

- [ ] **Data Isolation:** All queries scoped to tenant chatId
- [ ] **Rate Limiting:** Implemented for all endpoints
- [ ] **Content Moderation:** SafeSearch or equivalent enabled
- [ ] **Input Validation:** All user input sanitized
- [ ] **Output Validation:** LLM responses validated with Zod
- [ ] **Secrets Management:** No hardcoded secrets, all in Secret Manager
- [ ] **HTTPS Only:** All external calls use HTTPS
- [ ] **Logging:** Security events logged, PII excluded
- [ ] **Privacy Policy:** Published and linked in /start message
- [ ] **Data Export:** /export command working
- [ ] **Data Deletion:** /deletedata command working
- [ ] **Firestore Rules:** Deny all direct client access
- [ ] **Cloud Storage:** No public buckets (remove allUsers)
- [ ] **Dependency Audit:** npm audit clean
- [ ] **Penetration Test:** Basic security scan completed

#### Ongoing Security Tasks

| Task | Frequency |
|------|-----------|
| Dependency updates | Weekly |
| Security log review | Daily |
| Rate limit tuning | Monthly |
| Access audit | Quarterly |
| Penetration test | Annually |
| Privacy policy review | Annually |

---

## Timeline & Effort

### Summary

| Phase | Duration | Effort | Deliverable |
|-------|----------|--------|-------------|
| Phase 1: Multi-Tenant | 1-2 weeks | 24h | Working multi-tenant bot |
| Phase 2: Self-Service | 1 week | 16h | Full self-service UX |
| Phase 3: Monetization | 1 week | 25h | Freemium model live |
| Phase 4: Premium | 2 weeks | 44h | Differentiated tiers |
| **Total** | **5-6 weeks** | **109h** | **Full SaaS Product** |

### Critical Path

```
Week 1-2: Multi-Tenant Foundation ─────┐
                                       │
Week 3: Self-Service Features ─────────┼──▶ MVP Launch (can monetize)
                                       │
Week 4: Monetization ──────────────────┘
                                       
Week 5-6: Premium Features ────────────────▶ Full Product
```

### MVP Definition (Minimum for Launch)

- [x] Existing invoice processing pipeline
- [ ] Auto-provision tenant on /start
- [ ] Store invoice data in Firestore
- [ ] Basic /report command
- [ ] /export to CSV
- [ ] Usage limits (30 free invoices)
- [ ] Upgrade prompts
- [ ] Telegram Stars payment

**MVP Effort: ~50 hours (2-3 weeks)**

---

## Success Metrics

### Launch Metrics (Month 1)

| Metric | Target |
|--------|--------|
| Tenants created | 100 |
| Invoices processed | 1,000 |
| Conversion to trial | 10% |
| Paid subscribers | 5 |

### Growth Metrics (Month 3)

| Metric | Target |
|--------|--------|
| Active tenants | 500 |
| Monthly invoices | 10,000 |
| Paid subscribers | 50 |
| MRR | ₪1,500 |
| Churn rate | <10% |

### North Star Metric

**Monthly Recurring Revenue (MRR)** — Single metric that captures growth, conversion, and retention.

---

## Next Steps

### Immediate (This Week)

1. [ ] Create `tenants` collection schema in Firestore
2. [ ] Implement `/start` auto-provisioning
3. [ ] Modify worker to store invoice data (not just job status)
4. [ ] Make Sheets integration optional

### Short-Term (Next 2 Weeks)

5. [ ] Implement `/report` from Firestore
6. [ ] Implement `/export` CSV
7. [ ] Add usage tracking middleware
8. [ ] Implement tier limits

### Medium-Term (Month 1)

9. [ ] Telegram Stars integration
10. [ ] Upgrade flow and prompts
11. [ ] Welcome message and onboarding
12. [ ] Landing page / website

---

## Appendix

### A. Competitor Analysis

| Product | Price | Pros | Cons |
|---------|-------|------|------|
| Greeninvoice | ₪99/mo | Full accounting | Complex, expensive |
| Invoice4U | ₪49/mo | Israeli-focused | Web only |
| Expensify | $5/user | Enterprise | Overkill for SMB |
| **Papertrail** | ₪29/mo | Telegram-native, AI | New, limited features |

### B. User Personas

**Persona 1: Small Business Owner (Primary)**
- 5-50 invoices/month
- Uses Telegram for everything
- Hates manual data entry
- Wants simple expense tracking
- Price sensitive (₪29/mo max)

**Persona 2: Freelancer**
- 10-30 invoices/month
- Needs to track for taxes
- Already uses Telegram
- Wants export for accountant
- Very price sensitive

**Persona 3: Startup Finance (Business tier)**
- 100+ invoices/month
- Team access needed
- Wants Sheets integration
- API for automation
- Less price sensitive

### C. Feature Prioritization Matrix

```
                    High Impact
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    │  Quick Wins        │   Major Projects   │
    │  • /export CSV     │   • NL Assistant   │
    │  • Usage limits    │   • Custom reports │
    │                    │   • Sheets sync    │
Low ├────────────────────┼────────────────────┤ High
Effort                   │                     Effort
    │                    │                    │
    │  Fill-ins          │   Money Pits       │
    │  • /help improve   │   • Mobile app     │
    │  • Better messages │   • White-label    │
    │                    │                    │
    └────────────────────┼────────────────────┘
                         │
                    Low Impact
```

---

*Document created: January 2026*
*Last updated: January 2026*
*Author: Papertrail Team*
