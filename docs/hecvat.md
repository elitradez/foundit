# HECVAT Responses

Control responses for the Higher Education Community Vendor Assessment Toolkit.

---

## DRPV-07 — Right to Erasure / Right to be Forgotten

**Response:** Yes. Admin-mediated deletion via email request to ebunting07@gmail.com. Internal endpoint `/api/admin/erasure` executes the deletion within 10 business days per DPA. Production data deletion is immediate. Backups containing deleted records expire on a 30-day rolling window per Supabase backup policy. Self-service student-facing portal on roadmap.

**Implementation details:** See [`docs/data-erasure.md`](./data-erasure.md) for the operator runbook.
