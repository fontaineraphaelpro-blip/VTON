# Shopify App Store Publication Checklist

## ✅ Security & Authentication

- [x] **HMAC Signature Verification**: Public endpoints (`/apps/tryon/status`, `/apps/tryon/generate`, `/apps/tryon/atc`) verify Shopify HMAC signatures
- [x] **Admin Authentication**: All admin routes use `authenticate.admin()` 
- [x] **Session Management**: Proper session handling with Prisma session storage
- [x] **Error Handling**: 401 errors properly handled with re-authentication flows

## ✅ Privacy & Data Protection

- [x] **Privacy Notices**: Widget displays clear privacy messages:
  - "🔒 No personal data is stored. Your photos are processed securely and deleted after generation."
  - Message appears in loading state and in modal
- [x] **Data Storage**: Application clearly states no personal data is stored (Shopify compliance)
- [x] **Photo Processing**: User photos are processed securely and deleted after generation

## ✅ Billing & Subscriptions

- [x] **Recurring Subscriptions**: Uses `appSubscriptionCreate` GraphQL mutation
- [x] **Free Plan**: Free plan (2 try-ons/month) available for testing
- [x] **Paid Plans**: Starter (€19), Pro (€49), Studio (€99), Custom Flexible plans
- [x] **Return URL**: Proper return URLs configured for subscription confirmation
- [x] **Test Mode**: `test: true` flag used in non-production environments
- [x] **Monthly Quotas**: Fixed monthly quotas with automatic reset

## ✅ Error Handling & User Experience

- [x] **Comprehensive Error Messages**: All errors have user-friendly messages
- [x] **Loading States**: Widget shows loading spinner and progress messages
- [x] **Success Feedback**: Banners display success messages with auto-dismiss
- [x] **Error Feedback**: Error banners with auto-dismiss and manual close
- [x] **Authentication Errors**: Proper handling of expired sessions with re-auth URLs
- [x] **API Errors**: GraphQL errors and HTTP errors properly caught and displayed

## ✅ UI/UX & Performance

- [x] **Responsive Design**: Widget is mobile-friendly with media queries
- [x] **Loading Messages**: "Generation takes approximately 30 to 40 seconds. Please wait."
- [x] **No Visual Effects**: Widget optimized for performance (minimal CSS effects)
- [x] **Banner Auto-dismiss**: Success (5s) and error (8s) banners auto-dismiss
- [x] **Manual Close**: All banners can be manually closed with X button
- [x] **Current Plan Display**: Shows active subscription plan clearly
- [x] **Dashboard Stats**: Statistics display with proper formatting

## ✅ Technical Requirements

- [x] **Build Success**: Application builds without errors
- [x] **TypeScript**: Proper TypeScript types throughout
- [x] **Node Version**: Compatible with Node ^18.20 || ^20.10 || >=21.0.0
- [x] **Shopify API**: Uses latest Shopify API (@shopify/shopify-api ^12.2.0)
- [x] **Theme Extension**: Widget properly deployed as theme extension
- [x] **Database**: PostgreSQL with proper migrations

## ⚠️ Areas to Review Before Publication

### 1. Environment Variables
- [ ] Ensure all required environment variables are documented
- [ ] Verify production environment variables are set correctly:
  - `DATABASE_URL`
  - `SHOPIFY_API_KEY`
  - `SHOPIFY_API_SECRET`
  - `SCOPES`
  - `REPLICATE_API_TOKEN`

### 2. Documentation
- [ ] Create comprehensive setup guide for merchants
- [ ] Document all features and pricing plans
- [ ] Include screenshots/videos for App Store listing
- [ ] Provide clear installation instructions

### 3. Testing
- [ ] Test all subscription plans (Free, Starter, Pro, Studio, Custom)
- [ ] Test widget on multiple Shopify themes
- [ ] Test error scenarios (expired sessions, API failures)
- [ ] Test quota limits and monthly resets
- [ ] Test on mobile devices

### 4. App Store Listing
- [ ] Prepare high-quality screenshots
- [ ] Create demo video (English or with English subtitles)
- [ ] Write compelling app description
- [ ] Prepare test credentials for Shopify reviewers
- [ ] Set up app pricing in Partner Dashboard

### 5. Production Readiness
- [ ] Remove or minimize console.log statements in production
- [ ] Set up monitoring and error tracking (e.g., Sentry)
- [ ] Configure production database backups
- [ ] Set up logging infrastructure
- [ ] Test deployment pipeline

### 6. Compliance
- [ ] Review and update Privacy Policy
- [ ] Review Terms of Service
- [ ] Ensure GDPR compliance (if serving EU merchants)
- [ ] Verify data retention policies

## 📝 Notes

- The application uses Managed Billing (appSubscriptionCreate) for recurring subscriptions
- Free plan allows testing without payment
- All user-facing text is in English
- Widget uses Shadow DOM for style isolation
- Application follows Shopify App Bridge patterns

