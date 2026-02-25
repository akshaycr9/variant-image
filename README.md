# Variant Lens

Variant Lens is a private Shopify embedded app that lets merchants assign **multiple product images** to a selected variant option (for example `Color`) and show only relevant images on the storefront when customers switch variants.

This repository contains:

- A Remix-based Shopify embedded app (admin UI + backend)
- An Admin UI extension for variant image mapping support
- A Theme app extension (app embed + block) that filters product gallery images on storefront

---

## Table of Contents

1. [What Problem It Solves](#what-problem-it-solves)
2. [How It Works](#how-it-works)
3. [Tech Stack](#tech-stack)
4. [Data Model](#data-model)
5. [Repository Structure](#repository-structure)
6. [Local Development](#local-development)
7. [How to Use the App](#how-to-use-the-app)
8. [Theme Integration](#theme-integration)
9. [Configuration and Scopes](#configuration-and-scopes)
10. [Deploying to Production (Private Store)](#deploying-to-production-private-store)
11. [Operational Notes](#operational-notes)
12. [Troubleshooting](#troubleshooting)
13. [Roadmap Ideas](#roadmap-ideas)

---

## What Problem It Solves

Shopify natively supports one primary image per variant relation in many storefront implementations.

Variant Lens enables a richer model:

- Pick one option axis (for example `Color`)
- Assign multiple images per option value (`Black`, `Red`, etc.)
- On product page, show only the assigned images for currently selected value
- Keep behavior deterministic when non-mapped options (for example `Size`) change

Example:

- Mapped axis: `Color`
- Selected variant changes from `Black / M` to `Black / L`
- Gallery should remain `Black` image set
- Selected variant changes to `Red / L`
- Gallery should switch to `Red` image set

---

## How It Works

### Admin flow

1. Merchant opens app dashboard.
2. Merchant goes to `Configured products` -> `Assign images`.
3. Merchant selects a product and option axis (`Color`, `Size`, etc.).
4. Merchant assigns images to each option value.
5. App persists mapping as a product metafield.

### Storefront flow

1. Theme embed injects mapping + settings JSON on product pages.
2. `variant-images.js` listens to variant changes.
3. Script resolves selected variant -> mapped option value.
4. Script toggles gallery and thumbnail visibility based on assigned image IDs.

---

## Tech Stack

### App

- **Node.js + Remix** (`@remix-run/*`)
- **Shopify App SDK** (`@shopify/shopify-app-remix`)
- **Shopify App Bridge + Polaris** (embedded admin UI)
- **Prisma** for app session storage

### Extensions

- **Admin UI extension** (`extensions/variant-images-admin`)
- **Theme app extension** (`extensions/variant-images-theme`)

### APIs

- Shopify **Admin GraphQL API** for product/theme/metafield operations

---

## Data Model

### 1. Product-level image mapping

Saved in product metafield:

- Namespace: `variant_images`
- Key: `image_map`
- Type: `json`
- Owner: `PRODUCT`

Current mapping format:

```json
{
  "mode": "option",
  "optionName": "Color",
  "mapping": {
    "Black": ["123456789", "123456790"],
    "Red": ["123456791"]
  }
}
```

### 2. Shop-level app settings

Saved in shop metafield:

- Namespace: `variant_images`
- Key: `settings`
- Type: `json`
- Owner: `SHOP`

```json
{
  "enabled": true,
  "allowSharedImages": true,
  "hideUnassignedImages": false
}
```

### 3. App DB (Prisma)

The app database is used for Shopify auth/session state (not primary variant mapping storage).

- `Session` table

---

## Repository Structure

```txt
app/
  models/variant-images.server.js   # server-side mapping/settings/metafield logic
  routes/app._index.jsx             # dashboard/overview
  routes/app.configured-products.jsx# configured + unconfigured product listing
  routes/app.assign-images.jsx      # assignment workflow
  routes/app.settings.jsx           # storefront behavior settings
  shopify.server.js                 # Shopify app bootstrap/auth
extensions/
  variant-images-admin/             # admin UI extension
  variant-images-theme/
    assets/variant-images.js        # storefront filtering runtime
    blocks/variant-images-embed.liquid
    blocks/variant-images.liquid
prisma/
  schema.prisma                     # Prisma datasource/session schema
shopify.app.toml                    # app config/scopes/webhooks
```

---

## Local Development

### Prerequisites

- Node.js >= 20.19
- npm >= 10
- Shopify CLI
- Shopify Partner account + development store

### Install

```bash
npm install
```

### Run app

```bash
npm run dev
```

This runs `shopify app dev`.

### Lint and build checks

```bash
npm run lint
npm run build
```

---

## How to Use the App

### 1. Open app in Shopify Admin

- Launch Variant Lens from Apps in admin.

### 2. Configure product mappings

- Go to `Configured products`
- Click `Assign images` for a product
- Select `Variant type to map` (example: `Color`)
- For each option value, assign images
- Click `Save`

### 3. Configure behavior

In `Variant image settings`:

- `Enable variant images on storefront`
- `Allow assigning same image to multiple values`
- `Hide unassigned images on storefront`

### 4. Test on storefront

- Open a mapped product page
- Change mapped option value (for example Color)
- Verify gallery updates

---

## Theme Integration

### App embed (recommended)

Enable in Theme Editor:

- `Online Store` -> `Themes` -> `Customize`
- `App embeds`
- Toggle `Variant Lens Embed`
- Save

### Theme block

Theme extension also includes a section block for product templates.
Use app embed for global activation and keep setup consistent.

---

## Configuration and Scopes

Current required scopes in `shopify.app.toml`:

- `read_products`
- `write_products`
- `read_themes`

`read_themes` is required for dashboard embed-status detection in live theme settings.

After changing scopes/config, deploy app config:

```bash
npm run deploy
```

---

## Deploying to Production (Private Store)

This app cannot run entirely on Shopify-hosted surfaces because Remix backend routes are required for auth and Admin API operations.

You need:

1. A Node hosting provider (Railway/Render/Fly/etc.)
2. A production database (prefer Postgres)

### Suggested flow

1. Deploy backend service.
2. Set env vars:
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `SHOPIFY_APP_URL`
   - `SCOPES`
   - `DATABASE_URL`
   - `NODE_ENV=production`
3. Run migrations:
   - `npm run setup`
4. Deploy Shopify app config/extensions:
   - `npm run deploy`
5. Re-auth/reinstall app if scope changes occurred.
6. Enable `Variant Lens Embed` in live theme.

---

## Operational Notes

- Mapping/settings source of truth is Shopify metafields.
- DB downtime mostly impacts auth/session flow.
- Metafield definition creation is idempotent at runtime.
- Storefront script has compatibility handling for legacy mapping format.

---

## Troubleshooting

### Embed not detected as active

- Ensure `read_themes` scope is granted.
- Run `npm run deploy` after scope changes.
- Re-auth/reinstall app.
- Confirm `Variant Lens Embed` is enabled in current main theme.

### Images not filtering on storefront

- Verify app embed is enabled and theme saved.
- Confirm mapping exists in product metafield `variant_images.image_map`.
- Ensure selected option axis in assignment page matches expected storefront behavior.

### `npm run dev` Liquid schema/name errors

- Theme block/embed schema names must satisfy Shopify limits.
- Keep embed name <= 25 chars.

### Build warning: `Expected "(" but found "print"`

- This is from upstream Polaris CSS media syntax minifier warning and does not currently break builds.

---

## Roadmap Ideas

- Bulk assignment flow
- Drag-and-drop ordering per option value
- Presets/templates for mapping
- Analytics for unmapped variants
- Public app listing + billing plans

---

## License

Private project for internal/custom app usage.
