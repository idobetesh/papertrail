# Invoice Generation Feature Specification

## Overview

Add the ability to generate Hebrew invoices (חשבונית / חשבונית-קבלה) via Telegram command. User sends `/invoice` command, fills in details through a conversation or single-message shortcut, and receives a PDF invoice back in the chat.

## Business Requirements

| Requirement | Value |
|-------------|-------|
| Tax status | עוסק פטור (tax exempt) - no VAT calculation |
| Document types | חשבונית (invoice), חשבונית-קבלה (invoice-receipt) |
| Language | Hebrew only (RTL), PDF output |
| Invoice numbering | Year prefix + sequence (e.g., 20261, 20262, 20263...) |
| Counter reset | Automatically resets to 1 on January 1st each year |
| Digital signature | Text stamp: "מסמך ממוחשב חתום דיגיטלית" + "הופק ע״י PaperTrail" |

## Architecture

### Decision: Extend Existing Worker Service

**NO new service required.** The feature will be implemented by extending the existing `worker` service.

```
/invoice command
       │
       ▼
┌─────────────────┐     ┌───────────────┐     ┌────────────────┐
│ webhook-handler │────▶│  Cloud Tasks  │────▶│     worker     │
│                 │     │               │     │   (extended)   │
│ • Detect /invoice     │               │     │                │
│ • Check active session│               │     │ • Session mgmt │
│ • Route to worker     │               │     │ • PDF generation│
└─────────────────┘     └───────────────┘     │ • Counter mgmt │
                                              └────────────────┘
                                                      │
                              ┌────────────────────────┤
                              ▼           ▼            ▼
                        ┌──────────┐ ┌────────┐ ┌───────────┐
                        │Firestore │ │Storage │ │  Sheets   │
                        │• counters│ │• PDFs  │ │• new tab  │
                        │• sessions│ │        │ │           │
                        └──────────┘ └────────┘ └───────────┘
```

### Key Components

| Component | Storage |
|-----------|---------|
| Conversation state | Firestore `invoice_sessions` collection |
| Invoice counter | Firestore `invoice_counters` collection (atomic increment) |
| PDF generation | Puppeteer + HTML template (Hebrew RTL support) |
| PDF storage | New Cloud Storage bucket `{project-id}-generated-invoices` |
| Audit log | New Google Sheet tab "Generated Invoices" |
| Business config | `services/worker/invoice-config.json` (gitignored) |

---

## Telegram User Flow

### Fast Path (Power Users)

Single message with all details:

```
User: /invoice אלעד וקורין, 275, אלבום חתונה, ביט

Bot: ✅ חשבונית-קבלה 20261
     לקוח: אלעד וקורין | ₪275
     [✅ אשר] [❌ בטל]

User: clicks [✅ אשר]

Bot: [sends PDF document]
```

### Guided Path (4 Steps)

```
User: /invoice

Bot: 📄 יצירת מסמך חדש
     בחר סוג מסמך:
     [חשבונית] [חשבונית-קבלה]

User: clicks [חשבונית-קבלה]

Bot: 📝 שלח בפורמט:
     שם לקוח, סכום, תיאור
     (לדוגמה: אלעד, 275, אלבום חתונה)

User: אלעד וקורין, 275, אלבום חתונה

Bot: 💳 אמצעי תשלום:
     [מזומן] [ביט] [PayBox] [העברה] [אשראי] [צ'ק]

User: clicks [ביט]

Bot: ✅ אישור יצירת מסמך:
     ━━━━━━━━━━━━━━━━
     סוג: חשבונית-קבלה
     לקוח: אלעד וקורין
     תיאור: אלבום חתונה
     סכום: ₪275
     תשלום: ביט
     תאריך: 14/01/2026
     ━━━━━━━━━━━━━━━━
     [✅ אשר וצור] [❌ בטל]

User: clicks [✅ אשר וצור]

Bot: ⏳ מייצר מסמך...

Bot: 📄 חשבונית-קבלה מספר 20261
     [PDF document attached]
```

---

## Form Fields

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| Document type | Yes | - | חשבונית or חשבונית-קבלה |
| Customer name | Yes | - | Free text |
| Customer tax ID | No | - | If not provided, omit from invoice |
| Description | Yes | - | Free text |
| Amount | Yes | - | Number in ILS |
| Payment method | Yes | - | מזומן, ביט, PayBox, העברה, אשראי, צ'ק |
| Date | No | Today | Format: DD/MM/YYYY |

---

## Firestore Schema

### Collection: `invoice_counters`

```typescript
// Document ID: year string (e.g., "2026")
{
  counter: number,           // Current sequence number
  lastUpdated: Timestamp
}
```

**Behavior:**
- Atomic increment using Firestore transaction
- On first invoice of year, document is created with counter = 1
- Invoice number = `${year}${counter}` (e.g., "2026" + "1" = "20261")

### Collection: `invoice_sessions`

```typescript
// Document ID: `${chatId}_${userId}`
{
  status: 'select_type' | 'awaiting_details' | 'awaiting_payment' | 'confirming',
  documentType: 'invoice' | 'invoice_receipt',
  customerName?: string,
  customerTaxId?: string,
  description?: string,
  amount?: number,
  paymentMethod?: string,
  date?: string,              // YYYY-MM-DD
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Behavior:**
- Sessions expire/cleanup after 1 hour of inactivity
- Only one active session per user per chat
- Cleared after successful invoice generation or cancellation

### Collection: `generated_invoices`

```typescript
// Document ID: invoice number (e.g., "20261")
{
  invoiceNumber: string,
  documentType: 'invoice' | 'invoice_receipt',
  customerName: string,
  customerTaxId?: string,
  description: string,
  amount: number,
  paymentMethod: string,
  date: string,               // DD/MM/YYYY
  generatedAt: Timestamp,
  generatedBy: {
    telegramUserId: number,
    username: string,
    chatId: number
  },
  storagePath: string,        // GCS path
  storageUrl: string          // Signed URL
}
```

---

## Configuration

### File: `services/worker/invoice-config.json` (gitignored)

```json
{
  "business": {
    "name": "שם העסק",
    "taxId": "123456789",
    "taxStatus": "עוסק פטור מס",
    "email": "email@example.com",
    "phone": "050-1234567",
    "address": "כתובת העסק",
    "logoPath": "./assets/logo.png"
  },
  "invoice": {
    "digitalSignatureText": "מסמך ממוחשב חתום דיגיטלית",
    "generatedByText": "הופק ע\"י PaperTrail"
  }
}
```

### Template: `services/worker/invoice-config.example.json`

Same structure as above with placeholder values for documentation.

---

## PDF Template Requirements

### HTML Structure

```html
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&display=swap');
    
    body {
      font-family: 'Heebo', Arial, sans-serif;
      direction: rtl;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    /* ... additional styles ... */
  </style>
</head>
<body>
  <!-- Header: Logo + Business Info -->
  <!-- Invoice Type Banner (blue bar) -->
  <!-- Invoice Number + Date -->
  <!-- Customer Info -->
  <!-- Payment Details Table -->
  <!-- Total Amount -->
  <!-- Digital Signature Footer -->
</body>
</html>
```

### Visual Requirements

- **Page size**: A4
- **Direction**: RTL (right-to-left)
- **Font**: Heebo (Google Fonts) or embedded Hebrew font
- **Header**: Logo on left, business info on right
- **Title bar**: Blue background (#2563eb), white text with invoice type and number
- **Table columns**: סוג תשלום | פרטים | תאריך | סה"כ(₪)
- **Total row**: סה"כ שולם with bold amount
- **Footer**: Digital signature text, generation timestamp

---

## Files to Create

### New Files

| File | Purpose |
|------|---------|
| `services/worker/invoice-config.example.json` | Template for business config |
| `services/worker/src/services/invoice-generator/index.ts` | Main service orchestrator |
| `services/worker/src/services/invoice-generator/counter.service.ts` | Firestore counter management |
| `services/worker/src/services/invoice-generator/session.service.ts` | Conversation state management |
| `services/worker/src/services/invoice-generator/pdf.generator.ts` | Puppeteer PDF generation |
| `services/worker/src/services/invoice-generator/template.ts` | HTML template builder |
| `services/worker/src/services/invoice-generator/types.ts` | TypeScript interfaces |
| `services/worker/src/controllers/invoice.controller.ts` | Handle invoice commands |
| `services/worker/src/assets/logo.png` | Business logo (user-provided) |

### Files to Modify

| File | Changes |
|------|---------|
| `.gitignore` | Add `services/worker/invoice-config.json` |
| `services/worker/package.json` | Add `puppeteer` dependency |
| `services/worker/Dockerfile` | Install Chrome dependencies for Puppeteer |
| `services/worker/src/services/telegram.service.ts` | Add `sendDocument()` function |
| `services/worker/src/services/sheets.service.ts` | Add "Generated Invoices" tab functions |
| `services/worker/src/routes/index.ts` | Add invoice processing routes |
| `services/worker/src/config.ts` | Load invoice config |
| `services/webhook-handler/src/services/telegram.service.ts` | Parse `/invoice` command |
| `services/webhook-handler/src/controllers/webhook.controller.ts` | Route `/invoice` to worker |
| `services/webhook-handler/src/services/tasks.service.ts` | Add `enqueueInvoiceTask()` |
| `shared/types.ts` | Add invoice-related types |
| `infra/terraform/main.tf` | Add new storage bucket |

---

## Terraform Changes

### New Storage Bucket

```hcl
resource "google_storage_bucket" "generated_invoices" {
  name     = "${var.project_id}-generated-invoices"
  location = var.region
  
  uniform_bucket_level_access = true
  
  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }
}

resource "google_storage_bucket_iam_member" "worker_generated_invoices" {
  bucket = google_storage_bucket.generated_invoices.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.worker.email}"
}
```

---

## Google Sheets - New Tab

**Tab name**: `Generated Invoices`

**Headers**:

| Column | Description |
|--------|-------------|
| Invoice # | Invoice number (e.g., 20261) |
| Type | חשבונית or חשבונית-קבלה |
| Date | Invoice date (DD/MM/YYYY) |
| Customer | Customer name |
| Tax ID | Customer tax ID (if provided) |
| Description | Item/service description |
| Amount | Amount in ILS |
| Payment | Payment method |
| Generated By | Telegram username |
| Generated At | Timestamp |
| PDF Link | Link to stored PDF |

---

## Dependencies

### New npm packages

```json
{
  "puppeteer": "^21.0.0"
}
```

**Note**: For Cloud Run deployment, use `puppeteer-core` with `@sparticuz/chromium` or install Chrome in Dockerfile.

### Dockerfile additions

```dockerfile
# Install Chrome dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

---

## Security Considerations

1. **Config protection**: `invoice-config.json` must be gitignored
2. **Atomic counter**: Use Firestore transactions for counter increment (prevent duplicates)
3. **Session cleanup**: Auto-expire sessions after 1 hour
4. **Input validation**: Validate all user input before PDF generation
5. **HTML sanitization**: Escape user text to prevent injection in HTML template
6. **Access control**: Only authorized users can generate invoices (future: user whitelist)

---

## Implementation Order

1. ✅ Create this spec file
2. Add types to `shared/types.ts`
3. Create `invoice-config.example.json` + update `.gitignore`
4. Create `counter.service.ts` with atomic increment
5. Create `session.service.ts` for conversation state
6. Add `sendDocument()` to `telegram.service.ts`
7. Create HTML template and `pdf.generator.ts`
8. Create `invoice.controller.ts`
9. Update webhook-handler to route `/invoice` commands
10. Add "Generated Invoices" sheet tab logic
11. Update Terraform for new bucket
12. Add Puppeteer dependency and Dockerfile updates
13. Test full flow

---

## Testing Requirements

| Test | Type |
|------|------|
| Counter increment across year boundary | Unit |
| Session state transitions | Unit |
| Input parsing (fast path) | Unit |
| Input parsing (guided flow) | Unit |
| PDF generation with Hebrew text | Integration |
| Full conversation flow | E2E |

---

## Estimated Effort

| Phase | Task | Hours |
|-------|------|-------|
| 1 | Types + Config | 0.5 |
| 2 | Counter service | 1 |
| 3 | Session service | 1.5 |
| 4 | Telegram sendDocument | 0.5 |
| 5 | Invoice controller + routing | 2 |
| 6 | HTML template + PDF generator | 3 |
| 7 | Sheets integration | 1 |
| 8 | Terraform + Dockerfile | 1 |
| 9 | Testing | 2 |
| **Total** | | **~12-14 hours** |
