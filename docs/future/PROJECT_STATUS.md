# Papertrail Invoice Bot - Project Status

> Last Updated: 2026-01-12

This document provides a comprehensive overview of the project's current features, potential improvements, and technical debt that needs attention.

---

## Features

### Core Functionality

#### Invoice Processing Pipeline
- **Automated Invoice Extraction** - AI-powered extraction using Gemini (primary) and OpenAI (fallback) vision models
- **Multi-language Support** - Processes invoices in Hebrew and English with specialized prompts
- **Receipt Categorization** - Automatic categorization into 10 business expense categories (Food, Transport, Office Supplies, Utilities, Professional Services, Marketing, Technology, Travel, Entertainment, Miscellaneous)
- **Duplicate Detection** - Identifies potential duplicate invoices based on vendor name, amount, and date
- **User Decision Flow** - Interactive Telegram buttons for handling duplicates (keep both or delete new)

#### Data Extraction Fields
- Vendor name
- Invoice number
- Invoice date (with intelligent parsing for date ranges and month/year formats)
- Total amount (including VAT)
- Currency (ILS, USD, EUR with smart defaults)
- VAT amount
- Confidence score
- Business category

### Architecture & Infrastructure

#### Microservices
- **Webhook Handler** - Express-based service handling Telegram webhook events
- **Worker** - Processing service that handles invoice extraction, storage, and sheets logging
- **Cloud Tasks** - Reliable job queue with retry logic and deduplication
- **Shared Types** - TypeScript types shared across services

#### Cloud Services (GCP)
- **Cloud Run** - Serverless container deployment (scales to zero)
- **Cloud Storage** - Invoice images organized by `YYYY/MM/` structure
- **Firestore** - Job tracking and state management
- **Cloud Tasks** - Asynchronous processing queue
- **Artifact Registry** - Container image storage
- **Secret Manager** - Secure credential storage

#### Data Storage
- **Google Sheets Integration** - Automatic logging of all extracted invoice data
- **Firestore Database** - Job status tracking with fields:
  - Job status (pending, processing, processed, failed, pending_decision)
  - Pipeline steps tracking (download, drive, llm, sheets, ack)
  - LLM usage metrics (provider, tokens, cost)
  - Duplicate detection data
  - Error tracking and retry attempts

### Development & Operations

#### CI/CD Pipeline
- **GitHub Actions Workflows**:
  - Continuous Integration (linting, testing)
  - Automated deployment on push to master
  - Parallel builds for webhook-handler and worker
  - Workload Identity Federation for secure GCP authentication
- **Multi-stage Docker Builds** - Optimized container images
- **Version Tracking** - Git SHA-based versioning with health endpoints
- **Rollback Support** - Quick rollback to previous revisions

#### Developer Experience
- **Comprehensive Makefile** - 30+ commands for common operations
- **Local Development** - Dev mode with hot reload and environment bypasses
- **Type Safety** - Full TypeScript implementation
- **Code Quality**:
  - ESLint configuration
  - Prettier formatting
  - Husky pre-commit hooks
  - lint-staged for automatic fixes
- **Environment Management** - `.env` support with example files

#### Monitoring & Observability
- **Structured Logging** - Pino logger with pino-http middleware
- **Health Endpoints** - `/health` endpoints with version info
- **Dynamic Status Badges** - Real-time version and status badges in README
- **Cloud Logging** - Integrated GCP Cloud Logging
- **Make Commands** - Easy log tailing with `make logs-webhook` and `make logs-worker`

### Security
- **OIDC Authentication** - Cloud Tasks uses OIDC tokens for service-to-service auth
- **Secret Management** - Google Secret Manager for sensitive credentials
- **Webhook Secret Path** - Random secret URL path for Telegram webhook
- **IAM Roles** - Least-privilege service account permissions
- **Input Validation** - Zod schemas for request validation

### Cost Optimization
- **Free Tier Usage** - Primarily operates within GCP free tier limits
- **Scales to Zero** - Cloud Run instances scale down when idle
- **LLM Cost Tracking** - Per-request cost tracking in USD
- **Gemini First Strategy** - Uses free tier Gemini before paid OpenAI
- **Efficient Storage** - Images organized for lifecycle management

---

## Improvements

### High Priority

#### Testing & Quality Assurance
- [ ] **Increase Test Coverage** - Current test setup exists but coverage is minimal
  - Add comprehensive unit tests for all services
  - Integration tests for webhook → worker flow
  - E2E tests for full invoice processing pipeline
  - Mock external services (Telegram, OpenAI, Gemini)
  - Add test coverage reporting and CI gates (minimum 80%)

- [ ] **Error Recovery & Resilience**
  - Implement exponential backoff for retries
  - Add circuit breaker pattern for external service calls
  - Better handling of partial failures (e.g., image uploaded but LLM fails)
  - Dead letter queue for permanently failed jobs
  - Automatic cleanup of stuck jobs

#### Security Enhancements
- [ ] **Webhook Signature Verification** - Verify Telegram webhook signatures to prevent spoofing
- [ ] **Rate Limiting** - Implement rate limits to prevent abuse
  - Per-user rate limits
  - Global rate limits
  - Telegram API rate limit handling
- [ ] **Input Sanitization** - Enhanced validation for all user inputs
- [ ] **Security Audit** - Regular dependency vulnerability scans with Dependabot alerts
- [ ] **API Authentication** - Add authentication for health/admin endpoints

#### Monitoring & Alerting
- [ ] **Comprehensive Observability**
  - Application Performance Monitoring (APM) integration (e.g., Datadog, New Relic, or GCP Cloud Trace)
  - Custom metrics for business KPIs (processing time, success rate, LLM costs)
  - Distributed tracing across webhook → tasks → worker
  - Error tracking and aggregation (e.g., Sentry)

- [ ] **Alerting System**
  - Alert on high error rates
  - Alert on service degradation
  - Budget alerts for GCP costs
  - LLM cost anomaly detection
  - Queue depth monitoring

### Medium Priority

#### Feature Enhancements
- [ ] **Multi-Document Support**
  - Support for PDF files (not just images)
  - Support for document files (Word, Excel)
  - ✅ Batch processing (multiple images in one message) - Already supported! Each photo in an album is processed in parallel automatically
  - Receipt collage/stitching for multi-page receipts

- [ ] **Enhanced Duplicate Detection**
  - Fuzzy matching for vendor names (handle typos, abbreviations)
  - Image similarity comparison (perceptual hashing)
  - User preferences for duplicate handling
  - Historical duplicate reports

- [ ] **User Management**
  - User roles and permissions (admin, viewer, uploader)
  - User-specific categorization rules
  - User spending analytics
  - Team/department separation
  - Approval workflows for high-value invoices

- [ ] **Advanced Categorization**
  - Machine learning for category prediction improvement
  - Custom user-defined categories
  - Subcategories support
  - Multi-category tagging
  - Category rules engine (e.g., "vendor X always goes to category Y")

- [ ] **Sheets Enhancements**
  - Support for multiple sheets (per user/team/month)
  - Custom sheet templates
  - Automatic pivot tables and charts
  - Budget tracking vs. actuals
  - Export to other formats (CSV, Excel, PDF reports)

#### Developer Experience
- [ ] **API Documentation**
  - OpenAPI/Swagger specs for all endpoints
  - Interactive API documentation
  - Client SDKs generation
  - Webhook payload examples

- [ ] **Local Development Improvements**
  - Docker Compose for full local stack
  - Local Firestore emulator integration
  - Local storage emulator
  - Seeded test data
  - Better environment variable management (.env templates)

- [ ] **Database Migrations**
  - Versioned Firestore schema migrations
  - Migration rollback support
  - Data transformation scripts

- [ ] **Performance Optimization**
  - Image compression before upload
  - Lazy loading for large sheet queries
  - Caching layer for frequent queries (Redis)
  - Batch operations for multiple invoices
  - Connection pooling optimization

### Low Priority

#### UI/UX Enhancements
- [ ] **Web Dashboard**
  - View all invoices in a web interface
  - Search and filter capabilities
  - Edit extracted data
  - Reporting and analytics
  - Export functionality
  - Mobile-responsive design

- [ ] **Telegram Bot Improvements**
  - More interactive commands (/stats, /export, /search)
  - Inline queries for searching invoices
  - Voice command support
  - Language preference per user
  - Customizable notification settings
  - Invoice status tracking

#### Advanced Features
- [ ] **Multi-tenant Architecture**
  - Support for multiple organizations
  - Isolated data per tenant
  - Custom branding per tenant
  - Tenant-specific configurations

- [ ] **Integrations**
  - QuickBooks integration
  - Xero integration
  - Slack notifications
  - Email forwarding support (send receipt via email)
  - API for third-party integrations

- [ ] **Analytics & Reporting**
  - Spending trends over time
  - Category breakdown visualization
  - Vendor analysis
  - Cost center allocation
  - Tax reporting assistance
  - Predictive analytics for budgeting

- [ ] **AI Enhancements**
  - Custom fine-tuned models for specific invoice types
  - Support for more languages (French, German, Spanish)
  - Automatic fraud detection
  - Anomaly detection (unusual amounts, vendors)
  - Smart suggestions for missing data

---

## Technical Debt

### Critical

#### Dependency Management
- **Zod Version Mismatch** - webhook-handler uses `zod@4.3.5` while worker uses `zod@3.25.76`
  - **Impact**: Potential schema incompatibility, security vulnerabilities
  - **Action**: Align both services to use the same stable Zod version
  - **File**: `services/webhook-handler/package.json:24`, `services/worker/package.json:28`

#### Configuration Issues
- **Manual Webhook Setup** - Telegram webhook must be manually configured with `make set-webhook`
  - **Impact**: Error-prone deployment process, easy to forget
  - **Action**: Automate webhook setup in Terraform or post-deploy script
  - **File**: `Makefile:205-219`

- **Hard-coded Configuration Values**
  - Service URLs hard-coded in deploy workflow
  - Project ID in multiple places
  - **Impact**: Difficult to manage multiple environments (dev/staging/prod)
  - **Action**: Centralize configuration, use Terraform outputs
  - **Files**: `.github/workflows/deploy.yml:16-18,116-117`

### High Priority

#### Code Quality
- **No Integration Tests** - Only unit test structure exists, minimal actual tests
  - **Impact**: Risk of regressions, hard to refactor with confidence
  - **Action**: Write integration tests for critical paths
  - **Files**: `services/*/src/**/*.test.ts` (missing)

- **Error Handling Inconsistencies**
  - Some errors swallowed without proper logging
  - Inconsistent error message formats
  - **Impact**: Difficult debugging, silent failures
  - **Action**: Standardize error handling patterns, use custom error classes
  - **Files**: Various service files

#### Infrastructure
- **No Backup Strategy** - Firestore has no documented backup/restore process
  - **Impact**: Risk of data loss
  - **Action**: Implement automated Firestore backups, document restore procedure
  - **File**: `infra/terraform/main.tf:88-95`

- **No Database Indexes** - Firestore queries may be slow without proper indexes
  - **Impact**: Performance degradation as data grows
  - **Action**: Create necessary indexes, add to Terraform
  - **Files**: Missing index definitions

- **Storage Lifecycle Policies** - Cloud Storage bucket has no lifecycle rules
  - **Impact**: Unbounded storage costs
  - **Action**: Add lifecycle policies (e.g., move to coldline after 90 days)
  - **File**: `infra/terraform/main.tf:97-112`

### Medium Priority

#### Monitoring Gaps
- **No Alerting** - Services can fail silently
  - **Impact**: Late detection of issues
  - **Action**: Set up GCP Monitoring alerts, consider Sentry integration

- **Limited Metrics** - No custom metrics for business logic
  - **Impact**: No visibility into processing performance
  - **Action**: Add custom metrics (processing time, LLM success rate, cost per invoice)

#### Code Organization
- **Large Service Files** - Some service files exceed 400 lines
  - **Impact**: Hard to maintain and test
  - **Action**: Refactor into smaller, focused modules
  - **Files**:
    - `services/worker/src/services/invoice.service.ts` (412 lines)
    - `services/worker/src/services/store.service.ts` (351 lines)
    - `services/worker/src/services/telegram.service.ts` (277 lines)

- **Shared Code Duplication** - Some utilities duplicated between services
  - **Impact**: Risk of inconsistencies, harder maintenance
  - **Action**: Move common utilities to shared package
  - **Files**: `services/*/src/logger.ts`, `services/*/src/config.ts`

#### Documentation
- **Missing API Documentation** - No OpenAPI specs
  - **Impact**: Hard for new developers to understand endpoints
  - **Action**: Add OpenAPI/Swagger documentation

- **Incomplete Runbook** - No troubleshooting guides
  - **Impact**: Longer incident resolution time
  - **Action**: Create runbooks for common issues and recovery procedures

### Low Priority

#### Optimization Opportunities
- **No Caching Layer** - Every request hits services directly
  - **Impact**: Higher latency, higher costs
  - **Action**: Add Redis for frequently accessed data (user settings, recent invoices)

- **Image Optimization** - Images uploaded without compression
  - **Impact**: Higher storage and transfer costs
  - **Action**: Compress/resize images before storage

- **Connection Pooling** - No explicit connection pool management
  - **Impact**: Potential connection exhaustion under load
  - **Action**: Configure proper connection pools for Firestore, Storage clients

#### Code Modernization
- **Mixed Promise Patterns** - Some async/await, some .then()
  - **Impact**: Inconsistent code style
  - **Action**: Standardize on async/await everywhere

- **Type Safety Improvements**
  - Some `any` types used
  - Missing strict null checks in some areas
  - **Action**: Enable stricter TypeScript config, remove `any` types

- **Unused Dependencies** - Some installed packages may not be used
  - **Action**: Audit dependencies with `depcheck`, remove unused ones

---

## Next Steps

### Immediate Actions (Next Sprint)
1. Fix Zod version mismatch between services
2. Add webhook signature verification for security
3. Implement comprehensive error handling and retry logic
4. Add integration tests for critical flows
5. Set up basic alerting for service failures

### Short Term (1-2 Months)
1. Increase test coverage to 80%+
2. Add monitoring and alerting infrastructure
3. Implement backup strategy for Firestore
4. Refactor large service files
5. Add API documentation
6. Implement rate limiting

### Medium Term (3-6 Months)
1. Build web dashboard
2. Add multi-document support (PDFs)
3. Enhance duplicate detection with fuzzy matching
4. Add user management and permissions
5. Implement caching layer
6. Add more integrations (QuickBooks, Xero)

### Long Term (6-12 Months)
1. Multi-tenant architecture
2. Advanced analytics and reporting
3. Mobile app development
4. Custom ML model training
5. Enterprise features (SSO, audit logs, compliance)
6. International expansion (more languages, currencies)

---

## Metrics to Track

### Quality Metrics
- Test coverage percentage
- Number of production incidents
- Mean time to recovery (MTTR)
- Technical debt ratio

### Performance Metrics
- Invoice processing time (P50, P95, P99)
- LLM extraction accuracy
- System uptime/availability
- API response times

### Business Metrics
- Number of invoices processed
- Total LLM cost per month
- Cost per invoice
- User adoption rate
- Category distribution

### Cost Metrics
- GCP monthly spend
- LLM API costs (Gemini vs OpenAI)
- Cost per user
- Storage costs growth rate

---

**Document Version**: 1.0
**Authors**: Generated by Claude Code
**Review Schedule**: Monthly
