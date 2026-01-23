# Firestore Configuration (Private)

**⚠️ Security Notice:** Firestore rules and indexes are **NOT committed to the public repo** as they expose internal database schema and security logic.

## Setup Instructions

### 1. Create Firestore Rules

Create `infra/firestore.rules` locally (gitignored):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Default: Deny all access
    match /{document=**} {
      allow read, write: if false;
    }

    // All collections: Only service accounts via Admin SDK
    match /rate_limits/{docId} {
      allow read, write: if false;
    }

    match /invite_codes/{code} {
      allow read, write: if false;
    }

    match /approved_chats/{chatId} {
      allow read, write: if false;
    }

    match /business_config/{docId} {
      allow read, write: if false;
    }

    match /invoice_jobs/{jobId} {
      allow read, write: if false;
    }

    match /onboarding_sessions/{sessionId} {
      allow read, write: if false;
    }

    match /invoice_sessions/{sessionId} {
      allow read, write: if false;
    }

    match /invoice_counters/{counterId} {
      allow read, write: if false;
    }

    match /generated_invoices/{invoiceId} {
      allow read, write: if false;
    }

    match /user_customer_mapping/{userId} {
      allow read, write: if false;
    }
  }
}
```

### 2. Create Firestore Indexes

Create `infra/firestore.indexes.json` locally (gitignored):

```json
{
  "indexes": [
    {
      "collectionGroup": "invite_codes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "revoked", "order": "ASCENDING" },
        { "fieldPath": "used", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

### 3. Deploy to Firestore

```bash
# Deploy security rules
gcloud firestore databases update \
  --database="(default)" \
  --project="papertrail-invoice" \
  --security-rules-file=infra/firestore.rules

# Deploy indexes
gcloud firestore indexes create infra/firestore.indexes.json \
  --project="papertrail-invoice"
```

## Why Not Committed?

For a **public repository**, these files expose:
- Complete database schema
- Collection and field names
- Security model and access patterns
- Query optimization strategies

This information helps attackers understand your backend architecture. While proper security rules prevent unauthorized access, **security through obscurity** adds an additional layer of protection.

## For Team Members

Store these files in your team's private documentation or password manager. Each developer should maintain local copies for deployment.
