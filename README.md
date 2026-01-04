# Virtual Try-On Shopify App

A Shopify app that enables virtual try-on functionality for your store, allowing customers to visualize products on themselves using AI-powered image generation powered by Replicate.

## 🎯 Overview

This app provides a seamless virtual try-on experience for Shopify stores. Customers can upload their photos and see how products look on them in real-time, powered by advanced AI image generation technology.

### Key Features

- **AI-Powered Virtual Try-On**: Customers can upload photos and see products on themselves using Replicate's AI models
- **Automatic Widget Installation**: Widget automatically installs on product pages
- **Product-Level Control**: Enable/disable try-on for individual products
- **Usage Analytics**: Track try-on usage, conversion rates, and popular products
- **Subscription Plans**: Flexible monthly plans with quotas (Free, Starter, Pro, Studio, Custom)
- **GDPR Compliant**: Full GDPR compliance with data request and deletion webhooks
- **Secure**: HMAC signature verification for all public endpoints
- **Privacy-First**: Customer photos are processed securely and deleted immediately after generation

## 🚀 Quick Start

### Prerequisites

- Node.js 18.20+ or 20.10+ or 21.0+
- Shopify Partners account
- PostgreSQL database
- Replicate API token

### Installation

1. **Clone and install dependencies**:
   ```bash
   cd vton-shopify-remix
   npm install
   ```

2. **Configure environment variables**:
   
   Create a `.env` file:
   ```env
   SHOPIFY_API_KEY=your_api_key_here
   SHOPIFY_API_SECRET=your_api_secret_here
   SCOPES=read_products,write_script_tags
   SHOPIFY_APP_URL=https://your-app-url.up.railway.app
   DATABASE_URL=postgresql://username:password@host:5432/database
   REPLICATE_API_TOKEN=your_replicate_token_here
   ```

3. **Initialize Prisma**:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

4. **Run in development**:
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```
vton-shopify-remix/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx          # Main dashboard
│   │   ├── app.products.tsx        # Product management
│   │   ├── app.credits.tsx         # Subscription & billing
│   │   ├── app.history.tsx         # Usage history
│   │   ├── app.widget.tsx          # Widget configuration
│   │   ├── app.privacy.tsx         # Privacy Policy
│   │   ├── app.terms.tsx           # Terms of Service
│   │   ├── app.support.tsx        # Support page
│   │   ├── apps.tryon.generate.tsx # Try-on generation endpoint
│   │   ├── apps.tryon.status.tsx   # Widget status endpoint
│   │   ├── apps.tryon.atc.tsx      # Add to cart tracking
│   │   ├── webhooks.app.uninstalled.tsx # Uninstall cleanup
│   │   └── webhooks.gdpr.tsx       # GDPR webhooks
│   ├── lib/
│   │   ├── services/
│   │   │   ├── replicate.service.ts # Replicate API service
│   │   │   ├── db.service.ts       # Database operations
│   │   │   └── shopify.service.ts   # Shopify API helpers
│   │   └── db-init.server.ts        # Database initialization
│   └── shopify.server.ts            # Shopify app configuration
├── extensions/
│   └── vton-widget/                 # Theme extension (widget)
├── prisma/
│   └── schema.prisma                # Prisma schema (sessions)
└── package.json
```

## 🔧 Available Commands

```bash
# Development
npm run dev              # Start development server with Shopify CLI

# Production
npm run build            # Build for production
npm start                # Start production server

# Database
npm run setup            # Generate Prisma client and run migrations
npx prisma studio        # Open Prisma Studio (database GUI)

# Shopify CLI
npm run deploy           # Deploy to Shopify
npm run config:link      # Link app configuration
```

## 🎨 Features Explained

### Virtual Try-On Widget

The widget automatically appears on product pages. Customers can:
- Upload their photo
- See the product on themselves in real-time
- Download the result
- Add to cart directly from the result

### Dashboard

The admin dashboard provides:
- **Statistics**: Total try-ons, conversion rates, add-to-cart events
- **Product Management**: Enable/disable try-on per product
- **Usage Analytics**: Daily/weekly/monthly usage charts
- **Widget Configuration**: Customize button text, colors, and settings

### Subscription Plans

- **Free**: 4 try-ons/month with watermark (for testing)
- **Starter**: 60 try-ons/month - €19/month
- **Pro**: 150 try-ons/month - €49/month
- **Studio**: 300 try-ons/month - €99/month

All plans include:
- Monthly quota with automatic reset
- No watermark (except Free plan)
- Hard cap to prevent overages

### GDPR Compliance

The app is fully GDPR compliant:
- **Data Request**: Customers can request their data
- **Data Deletion**: Customers can request data deletion
- **Shop Deletion**: Complete data cleanup on uninstall
- **Privacy Policy**: Comprehensive privacy policy page
- **Terms of Service**: Complete terms of service

## 🔐 Security

- **HMAC Verification**: All public endpoints verify Shopify HMAC signatures
- **Admin Authentication**: All admin routes use `authenticate.admin()`
- **Session Management**: Secure session handling with Prisma
- **Data Privacy**: Customer photos are deleted immediately after processing
- **Secure Storage**: All data encrypted at rest

## 🚢 Deployment

### Railway

1. Push code to Git repository
2. Connect repository in Railway
3. Configure environment variables:
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `SCOPES`
   - `SHOPIFY_APP_URL`
   - `DATABASE_URL`
   - `REPLICATE_API_TOKEN`
4. Deploy

### Shopify Partners Configuration

- **App URL**: `https://your-app-url.up.railway.app`
- **Allowed redirection URL(s)**: `https://your-app-url.up.railway.app/auth/callback`
- **Webhook URLs**: 
  - Regular webhooks: `https://your-app-url.up.railway.app/webhooks`
  - GDPR webhooks: `https://your-app-url.up.railway.app/webhooks/gdpr`

## 📊 Database

The app uses PostgreSQL with two types of tables:

1. **Prisma-managed tables** (sessions):
   - `Session` - OAuth session storage

2. **Business tables** (auto-created):
   - `shops` - Shop configuration and settings
   - `tryon_logs` - Try-on generation logs
   - `rate_limits` - Rate limiting per customer
   - `product_settings` - Per-product try-on settings

Tables are automatically created on first run via `ensureTables()`.

## 🔌 API Endpoints

### Public Endpoints (App Proxy)

All public endpoints verify Shopify HMAC signatures:

- `GET /apps/tryon/status` - Check if try-on is enabled for a product
- `POST /apps/tryon/generate` - Generate virtual try-on image
- `POST /apps/tryon/atc` - Track add-to-cart events

### Admin Endpoints

- `/app` - Dashboard
- `/app/products` - Product management
- `/app/credits` - Subscription & billing
- `/app/history` - Usage history
- `/app/widget` - Widget configuration
- `/app/privacy` - Privacy Policy
- `/app/terms` - Terms of Service
- `/app/support` - Support page

### Webhooks

- `POST /webhooks` - Regular webhooks (products/update, app/uninstalled)
- `POST /webhooks/gdpr` - GDPR compliance webhooks

## ⚠️ Important Notes

- Business tables (shops, tryon_logs, etc.) are automatically created on startup
- Public routes `/apps/tryon/*` verify Shopify HMAC signatures
- Dashboard uses automatic authentication via `authenticate.admin()`
- All customer data is deleted on app uninstall
- Script tags are automatically installed when the app is enabled

## 🐛 Troubleshooting

### Database Connection Error
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is accessible
- Check network/firewall settings

### OAuth Error
- Verify `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`
- Ensure redirect URL in Shopify Partners matches `/auth/callback`
- Check that scopes are correctly configured

### Build Error
- Run `npm install` to ensure all dependencies are installed
- Run `npx prisma generate` to generate Prisma client
- Check Node.js version (18.20+, 20.10+, or 21.0+)

### Widget Not Appearing
- Verify script tags are installed (check in Shopify admin)
- Check browser console for errors
- Ensure product has try-on enabled in Products page

## 📚 Documentation

- [Remix Documentation](https://remix.run/docs)
- [Shopify App Remix](https://shopify.dev/docs/apps/tools/cli/templates)
- [Shopify Polaris Components](https://polaris.shopify.com/components)
- [Replicate API](https://replicate.com/docs)

## 📧 Support

For questions, issues, or feedback, please contact:
- **Email**: fontaineraphaelpro@gmail.com

## 📄 License

This project is private and proprietary.

---

**Built with ❤️ using Remix, Shopify App Bridge, and Replicate**
