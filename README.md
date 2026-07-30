# HN Enterprises Backend

Bun + ElysiaJS backend for the HN Enterprises CGD management system.

## Scripts

```bash
bun install
bun run dev
bun run check
```

Phase 1 contains only backend foundation utilities and shared services. Business schemas are added module by module.

## Database

```bash
bun run generate
bun run migrate
bun run seed:admin
```

`seed:admin` uses `SEED_ADMIN_*` values from `.env`.

## Auth Endpoints

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/request-password-reset`
- `POST /api/auth/reset-password`

## Upload Drivers

Use one stable service from feature modules:

```ts
await uploadService.store(file, {
  module: "customers",
  recordId: "cust-001",
  uploadedBy: userId,
});
```

Set `UPLOAD_DRIVER` in `.env`:

- `local`: stores files under `UPLOAD_DIR`.
- `cloudinary`: requires `CLOUDINARY_URL` or `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- `s3`: requires `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

Images and PDFs can be optimized in the background after the original upload is accepted:

- `UPLOAD_OPTIMIZATION_ENABLED=true`
- images use `sharp`
- PDFs use Ghostscript only when `GHOSTSCRIPT_BIN` is configured
- `UPLOAD_KEEP_ORIGINAL=false` removes the original after optimized upload succeeds
