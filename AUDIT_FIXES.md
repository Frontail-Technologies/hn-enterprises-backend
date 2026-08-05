# Backend Audit — Fix Plan

Tracking doc for the 2026-08 backend audit (DRY, query quality, reusability, comment/dead-code
cleanup, production readiness, ElysiaJS conventions — 24 modules, ~70 findings). Work top to
bottom: Phase 0 fixes shared infrastructure that several later items depend on, Phase 1 is
security fixes that are independent and urgent, Phases 2–4 are the rest in descending priority.

Check items off as they land. Each has the severity, the files touched, and a one-line fix. Keep
this file in sync with reality — if a finding turns out to be a non-issue on closer look, mark it
`[x]` with a `(no-op: ...)` note rather than deleting the line, so the audit trail stays honest.

**Progress: 10 / 51**

Legend: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low

---

## Phase 0 — Shared infrastructure (do first — unlocks most of Phase 3)

- [x] **INF-1** 🟠 Fix `requireAuth`/`requireRole` macro typing — investigated removing the `as any`
      cast directly; the mismatch is a real gap between Elysia's bundled `.macro()` overload types
      and the (correct, working) object-returning `beforeHandle` shape, not something fixable from
      our side without breaking the runtime behavior. Kept the cast, documented *why* in a comment
      (the explanation had been dropped in a prior reformat), and added `assertUser()` in
      `src/utils/guards.ts` so call sites get a one-line non-null narrow instead of a repeated
      3-line `if (!currentUser) throw ...` block — `src/plugins/auth.ts`, `src/utils/guards.ts`
- [x] **INF-2** 🟠 Extracted shared `statusFromError`/`errorMessage` into `src/utils/http-error.ts`
      and rolled it out to **every** controller (not just the worst offenders) — see **SEC-8**
      below, done together since they're the same change.
- [x] **INF-3** 🟠 Validate required env vars at boot — `DATABASE_URL` missing always throws;
      `JWT_*_SECRET` left at the `"change-me"` placeholder throws in production, warns in dev —
      `src/constants/keys.ts` (`assertRequiredEnv`), called from `src/index.ts`
- [ ] **INF-4** 🟡 Extract shared `mergeUploadedEvidence(existing, files, context)` — replaces
      the drifted copies in `customers.controller.ts`, `payments.controller.ts` (missing
      `recordId`), `materials.controller.ts`
- [ ] **INF-5** ⚪ Extract shared `resolveSingleFileUpload(body, {module, uploadedBy, urlField,
      fileNameField})` — replaces `resolveDocumentFile` (customers) and `resolveAnnouncementImage`
      (announcements)
- [ ] **INF-6** ⚪ Extract generic `findOrThrow(table, id, message)` — replaces 6+ per-module
      `getXOrThrow` helpers (payments, materials, plumbers, users, staff, masters x3)
- [ ] **INF-7** ⚪ Move `normalizeKey` from `master-import.mapper.ts` to `src/utils` — 7 unrelated
      modules import cross-domain for it (customers, masters, materials, projects, bills, plumbers)
- [ ] **INF-8** ⚪ Replace the 3 inline reimplementations of "is this user admin" with
      `permissionService.canManage()` — `payments.service.ts:7`, `complaints.service.ts:91`,
      `auth.service.ts:312`
- [ ] **INF-9** ⚪ Adopt `parseDateRange` at its 3 dead call sites instead of inline
      `new Date(query.from)` — `payments.service.ts`, `materials.service.ts`,
      `audit-logs.service.ts`

## Phase 1 — Critical security (independent of Phase 0, do immediately)

- [x] **SEC-1** 🔴 Require + verify `currentPassword` before accepting `newPassword` — added
      `currentPassword` to the schema, `authService.changePassword` now verifies it with
      `verifyPassword` before allowing the change and audit-logs a failed attempt —
      `auth.schema.ts`, `auth.service.ts`, `auth.controller.ts`
- [x] **SEC-2** 🔴 Block self/other-escalation to `super_admin`/`admin` on user & staff
      create/update — added `assertCanAssignRole(actorRole, targetRole)` in `src/utils/guards.ts`,
      wired into `usersService.create/update` and `staffService.create/update`; both controllers/
      routes now thread `currentUser` (or its role) through — `users.*`, `staff.*`,
      `src/utils/guards.ts`
- [x] **SEC-3** 🟠 Gate payment `status:"approved"`/`"rejected"` on **create**, not just update —
      `create()` now runs the same `permissionService.canManage` check `update()` does before
      allowing a pre-approved status; also swapped both from the local `APPROVAL_ROLES` array to
      `permissionService.canManage` (partial **INF-8**) — `payments.service.ts`,
      `payments.controller.ts`
- [x] **SEC-4** 🟠 Added an in-memory IP+identifier rate limiter (`src/utils/rate-limit.ts`,
      `checkRateLimit`) to `/auth/login` (10/15min), `/auth/request-password-reset` (5/15min),
      `/auth/reset-password` (10/15min); all three now return 429 when tripped —
      `auth.controller.ts`, `auth.routes.ts`
- [x] **SEC-5** 🟠 Added `requireRole:["super_admin","admin"]` to `GET /users` — `users.routes.ts`
- [x] **SEC-6** 🟠 `PATCH /customers/:id` now requires
      `["super_admin","admin","supervisor","field_executive"]` (matches
      `permissionService.canFieldUpdate`'s role set, excludes `viewer`);
      `DELETE /customers/:id/documents/:documentId` now requires `["super_admin","admin"]` and
      audit-logs the deletion — `customers.routes.ts`, `customers.controller.ts`
- [ ] **SEC-7** 🟠 Require auth on `uploads.static.routes.ts` (or move to signed URLs) —
      **deferred**: this route only matters when `UPLOAD_DRIVER=local` (Cloudinary URLs bypass it
      entirely). Adding `requireAuth` is safe for the web admin panel (cookies flow cross-site
      since `COOKIE_CONFIGS` sets `sameSite:"none"` in production) but **mobile's `<Image
      source={{uri}}>` calls carry no auth header/cookie at all** — if mobile ever serves evidence
      photos off the local driver in any environment, this would silently break image loading.
      Needs a decision on whether mobile ever runs against `UPLOAD_DRIVER=local` before this is
      safe to flip. — `uploads.static.routes.ts`, `index.ts`
- [x] **SEC-8** 🟠 Stopped controllers leaking raw error messages — every controller now imports
      `statusFromError`/`errorMessage` from `src/utils/http-error.ts` instead of a local copy.
      Unrecognized errors (anything not matching a known domain-error pattern like "not found" /
      "required" / "already exists" / "not authorized" / etc.) now get a generic fallback message
      + status 500 and are `console.error`-logged server-side, instead of echoing the raw message
      at a guessed status. Rolled out to all ~20 controllers, including the 3 that previously
      hand-rolled their own inline version (`documents`, `audit-logs`, `master-import`) —
      `src/utils/http-error.ts` + every `src/modules/*/*.controller.ts`

## Phase 2 — Remaining medium-severity issues

- [ ] **SEC-9** 🟡 Scope `complaints` list to the caller's own customers for non-admins, matching
      `update()`'s existing logic — `complaints.service.ts`, `complaints.routes.ts`
- [ ] **SEC-10** 🟡 Add `requireRole` to `GET /attendance` (or scope non-admins to their own
      records) — `attendance.routes.ts`
- [ ] **SEC-11** 🟡 Fix login timing side-channel: run a dummy bcrypt compare on the
      "identifier not found" path — `auth.service.ts`
- [ ] **SEC-12** 🟡 Add `{minimum: 0}` to every money/quantity TypeBox field — `payments.schema.ts`,
      `bills.schema.ts`, `materials.schema.ts`, `wages.schema.ts`
- [ ] **SEC-13** 🟡 Append a random suffix to upload storage keys to prevent same-millisecond
      filename collisions — `upload.helpers.ts` (`buildStorageKey`)
- [ ] **SEC-14** 🟡 Default `GET /announcements` to `status:"sent"` for non-admin callers —
      `announcements.routes.ts`
- [ ] **SEC-15** 🟡 Validate push-token format + ownership before insert; add an
      unregister/delete route; parse Expo's per-token response and log/prune failures —
      `notifications.service.ts`, `notification.service.ts`
- [ ] **SEC-16** 🟡 Re-check batch status *inside* the transaction (with a row lock) in
      master-import confirm — `master-import.service.ts`
- [ ] **SEC-17** 🟡 Fix CSV parser to track quote state across the whole buffer instead of
      splitting on raw newlines first (embedded newlines in quoted fields corrupt rows) —
      `master-import.mapper.ts`
- [ ] **SEC-18** 🟡 Add a global request body-size limit + `t.File({maxSize})` on upload schemas —
      `src/index.ts`, upload-accepting schemas
- [ ] **SEC-19** 🟡 Call `uploadValidatorService.validate(file)` at the top of master-import
      `preview()` before parsing — `master-import.service.ts`
- [ ] **SEC-20** ⚪ Don't delete the original upload until its optimized replacement is confirmed
      written back to the referencing record — `upload.service.ts` (`optimizeInBackground`)
- [ ] **SEC-21** ⚪ Add idempotency protection (or at minimum a client-supplied dedupe key) to
      payment/bill/material-transaction create — `payments`, `bills`, `materials` services
- [ ] **SEC-22** ⚪ Tighten `evidence` schema from `t.Array(t.Record(t.String(), t.Unknown()))` to
      `t.Array(t.Object({id, fileName, fileUrl}))` — `payments.schema.ts`, `materials.schema.ts`
- [ ] **SEC-23** ⚪ Wire `auditService.log` into payments/users/staff/masters state-changing
      methods (currently only `auth.service.ts` calls it)
- [ ] **SEC-24** ⚪ Replace `users.service.ts`'s `sanitizeUser` deny-list with an allow-list (it
      currently leaks `currentSessionId`/`passwordChangedAt` into API responses) — standardize on
      one helper shared with `auth.service.ts`'s `publicUser`
- [ ] **SEC-25** ⚪ Add `format:"email"` to email fields — `users.schema.ts`, `staff.schema.ts`

## Phase 3 — Module cleanup (DRY / query / reusability), cluster by cluster

**Customer / field-ops** (customers, work-progress, planning, attendance, documents)
- [ ] **MOD-1** 🟡 Add a narrow existence-check path for `getCustomerOrThrow` call sites that
      don't need the full relational graph; stop the double-query in `listLmcPipeRecords` /
      `listDocuments` — `customers.service.ts`
- [ ] **MOD-2** 🟡 Push `documents.service.ts` `list()` filtering/sorting/pagination into SQL
      instead of loading full tables into memory — `documents.service.ts`
- [ ] **MOD-3** 🟡 Add pagination to `planning.service.ts` `listSitePlans`/`listDprRecords`
- [ ] **MOD-4** ⚪ Column-scope `customers.service.ts` `list()` instead of pulling every jsonb
      section for list views
- [ ] **MOD-5** ⚪ Point search (`ILIKE`) at the normalized+indexed columns instead of the raw
      unindexed ones — `customers.service.ts`, `work-progress.service.ts`
- [ ] **MOD-6** ⚪ Use `parsePagination` in `work-progress.service.ts` `list()` instead of
      hand-rolled clamping with different magic numbers than `listQueue()` in the same file

**Commercial / finance** (payments, bills, materials, wages, plumbers)
- [ ] **MOD-7** 🟡 Compute running balances (`paidAmount`, `currentBalance`) via SQL increment
      instead of JS float math re-stringified — `bills.service.ts`, `materials.service.ts`
- [ ] **MOD-8** 🟡 Replace `materials.service.ts` `plumberBalances`'s JS `Map` aggregation with a
      grouped SQL query
- [ ] **MOD-9** 🟡 Switch `wages.service.ts` `upsert` to `.insert(...).onConflictDoUpdate(...)`
      instead of find-then-write (TOCTOU race against its own unique index)
- [ ] **MOD-10** ⚪ Add a `customerId` filter to payment list queries, matching the material
      transaction query's equivalent filter

**Admin / people** (auth, users, staff, masters, audit-logs)
- [ ] **MOD-11** 🟡 Wrap `auth.service.ts` `login` and `resetPassword` multi-step writes in
      `db.transaction`
- [ ] **MOD-12** 🟡 Wrap `staff.service.ts` `update()` in `db.transaction` to match its own
      `create()`
- [ ] **MOD-13** 🟡 Add pagination to all 3 masters list endpoints (values, custom fields,
      holidays) — currently unbounded, schema doesn't even accept `page`/`limit`
- [ ] **MOD-14** ⚪ Column-scope user lookups in `auth.service.ts`/`users.service.ts` instead of
      selecting `passwordHash` and stripping it after
- [ ] **MOD-15** ⚪ Collapse the 3 copy-pasted masters CRUD controllers into one
      `createCrudController(service, resourceLabel)` factory
- [ ] **MOD-16** ⚪ Have `auth.routes.ts` reuse the shared `auth` plugin's derived `currentUser`
      for `/me` and `/change-password` instead of a second parallel JWT resolver

**Comms / misc** (announcements, notifications, complaints, stats, system)
- [ ] **MOD-17** 🟠 Rewrite `stats.service.ts` to compute counts via SQL (`count() filter`,
      `GROUP BY`) instead of loading full tables and aggregating with `.filter()`/`.map()`;
      paginate `getDetails` — biggest single query-quality item in the codebase
- [ ] **MOD-18** 🟡 Add pagination to `notifications.service.ts` `list()`; switch the controller
      to `paginated()` instead of `ok()`
- [ ] **MOD-19** ⚪ Use a boolean-coercing schema type for `read` instead of hand-comparing
      strings — `notifications.schema.ts`/`.service.ts`
- [ ] **MOD-20** ⚪ Standardize `page`/`limit` schema typing on `t.Optional(t.String())`
      everywhere — `announcements.schema.ts` is the lone `t.Number()` outlier

**Uploads / import** (uploads, master-import, upload services)
- [ ] **MOD-21** 🟡 Add real `body` schemas (`t.File()`/`t.Object()`) to `uploads.routes.ts`
      POST `/` and `master-import.routes.ts` POST `/preview`; delete the hand-rolled runtime
      guards
- [ ] **MOD-22** 🟡 Persist `storageKey` on evidence records and call `uploadService.remove()` on
      delete/replace — closes the storage-leak gap (ties to Phase 4 dead-code item on `.remove()`)
- [ ] **MOD-23** ⚪ Dedupe `getUploadFile(body)` between `uploads.controller.ts` and
      `master-import.controller.ts` into `upload.helpers.ts`
- [ ] **MOD-24** ⚪ Extract shared `resolveMimeType(file)` — the `file.type || "application/..."`
      fallback is pasted 4x across the 3 upload providers
- [ ] **MOD-25** ⚪ Make the Cloudinary provider's `remove()` surface/log failed settlements
      instead of silently swallowing them via untouched `Promise.allSettled`

## Phase 4 — Dead code

- [ ] **DEAD-1** ⚪ Remove the unreachable `default` branch in `computeQuantityDelta` —
      `materials.service.ts`
- [ ] **DEAD-2** ⚪ Remove (or wire up) the 2 unused `SupervisorStatDetailStatus` union members —
      `stats.types.ts`
- [ ] **DEAD-3** ⚪ Remove unused `background-job.service.ts` `getStats()` export
- [ ] **DEAD-4** ⚪ Remove unused `StoredFile.originalStorageKey`/`optimizedStorageKey`/
      `optimizedSize` fields, or actually populate them once **MOD-22** lands
- [ ] **DEAD-5** ⚪ Add `<name>.schema.ts` to `uploads/` and `master-import/` modules to match the
      codebase's own per-module file convention (mechanically follows from **MOD-21**)

---

## Notes

- Severity tags mirror the original audit; re-triage if something turns out easier/harder than it
  looked once you're in the code.
- Phase 0 and Phase 1 can run in parallel — they touch different files. Phase 3 items generally
  assume Phase 0's shared helpers already exist, so land those first within a cluster.
- After each phase: `bun run check` (tsc) and a manual smoke test of the touched routes before
  moving on.
