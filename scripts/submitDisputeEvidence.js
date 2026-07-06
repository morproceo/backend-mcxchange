#!/usr/bin/env node
/*
 * Attach dispute-evidence files to a Stripe dispute and populate the evidence
 * fields — including customer_signature and terms_of_service — WITHOUT final
 * submission, so you can review in the Stripe Dashboard before submitting.
 *
 * Prep (download from the admin panel first):
 *   1. Admin → Users → [customer] → Download Dispute Evidence   → evidence.pdf
 *      (its last page is the standalone "Signed Payment Authorization")
 *   2. Admin → Download Terms of Service  (GET /admin/terms-of-service.pdf) → terms.pdf
 *
 * Usage:
 *   STRIPE_SECRET_KEY=rk_live_... node scripts/submitDisputeEvidence.js \
 *     --dispute dp_123 --evidence ./evidence.pdf --terms ./terms.pdf \
 *     [--signature ./signature.pdf] [--submit]
 *
 * By default it uploads + fills the evidence but does NOT submit (submit=false).
 * Add --submit to submit to Stripe immediately (irreversible for this round).
 */
const Stripe = require('stripe');
const fs = require('fs');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

async function uploadFile(stripe, path) {
  const file = await stripe.files.create({
    purpose: 'dispute_evidence',
    file: { data: fs.readFileSync(path), name: path.split('/').pop(), type: 'application/pdf' },
  });
  return file.id;
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { console.error('Set STRIPE_SECRET_KEY'); process.exit(1); }

  const disputeId = arg('dispute');
  const evidencePath = arg('evidence');
  const termsPath = arg('terms');
  const signaturePath = arg('signature'); // optional; falls back to the evidence PDF
  const submit = arg('submit', false) === true;

  if (!disputeId || !evidencePath) {
    console.error('Usage: --dispute dp_123 --evidence ./evidence.pdf [--terms ./terms.pdf] [--signature ./sig.pdf] [--submit]');
    process.exit(1);
  }
  for (const p of [evidencePath, termsPath, signaturePath].filter(Boolean)) {
    if (!fs.existsSync(p)) { console.error(`File not found: ${p}`); process.exit(2); }
  }

  const stripe = new Stripe(key);

  console.log(`Uploading evidence files for dispute ${disputeId}...`);
  const evidenceFileId = await uploadFile(stripe, evidencePath);
  const termsFileId = termsPath ? await uploadFile(stripe, termsPath) : undefined;
  const signatureFileId = signaturePath ? await uploadFile(stripe, signaturePath) : evidenceFileId;

  const evidence = {
    uncategorized_file: evidenceFileId,
    customer_signature: signatureFileId,
    product_description:
      'Marketplace subscription; credits unlock confidential motor-carrier contact data. ' +
      'Customer signed the payment terms at checkout (see attached).',
  };
  if (termsFileId) evidence.terms_of_service = termsFileId;

  console.log(`Updating dispute (submit=${submit})...`);
  const updated = await stripe.disputes.update(disputeId, { evidence, submit });

  console.log('\nDone.');
  console.log(`  dispute:          ${updated.id}`);
  console.log(`  status:           ${updated.status}`);
  console.log(`  submission_count: ${updated.evidence_details?.submission_count}`);
  console.log(`  evidence.customer_signature: ${signatureFileId}`);
  if (termsFileId) console.log(`  evidence.terms_of_service:   ${termsFileId}`);
  console.log(`  evidence.uncategorized_file: ${evidenceFileId}`);
  if (!submit) {
    console.log('\nNOT submitted yet. Review in the Stripe Dashboard, then submit there,');
    console.log('or re-run this command with --submit to submit now.');
  }
}

main().catch((err) => { console.error('Failed:', err.message); process.exit(1); });
