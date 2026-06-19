#!/usr/bin/env node
/*
 * One-off tool: regenerate a buyer's signed NDA/NCA (terms acceptance) PDF from the
 * production DB record, for dispute evidence. Output is byte-for-byte the same layout
 * as buyerService.generateTermsPdfAndEmailAdmin (the PDF originally emailed to admin).
 *
 * Usage:
 *   JAWSDB_URL='mysql://user:pass@host:3306/db' node scripts/exportTermsPdf.js <email-or-userId>
 *   # or DATABASE_URL instead of JAWSDB_URL
 */
const mysql = require('mysql2/promise');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/exportTermsPdf.js <email-or-userId>');
    process.exit(1);
  }
  const dbUrl = process.env.JAWSDB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('Set JAWSDB_URL (or DATABASE_URL) to the production MySQL connection string.');
    process.exit(1);
  }

  const conn = await mysql.createConnection(dbUrl);

  // Find the user by email or id
  const [users] = await conn.execute(
    'SELECT id, name, email FROM users WHERE email = ? OR id = ? LIMIT 1',
    [arg, arg]
  );
  if (!users.length) {
    console.error(`No user found for "${arg}"`);
    await conn.end();
    process.exit(2);
  }
  const user = users[0];

  // Most recent acceptance for this user
  const [rows] = await conn.execute(
    'SELECT id, termsVersion, signatureName, acceptedAt, ipAddress, userAgent, emailedToAdminAt ' +
      'FROM user_terms_acceptances WHERE userId = ? ORDER BY acceptedAt DESC',
    [user.id]
  );
  await conn.end();

  if (!rows.length) {
    console.error(`User ${user.email} (${user.id}) has NO signed terms acceptance on record.`);
    process.exit(3);
  }

  console.log(`\nUser: ${user.name} <${user.email}> (${user.id})`);
  console.log(`Acceptance records found: ${rows.length}`);
  rows.forEach((r, i) =>
    console.log(
      `  [${i}] signed "${r.signatureName}" v${r.termsVersion} at ${new Date(r.acceptedAt).toISOString()} ` +
        `IP=${r.ipAddress || 'n/a'} docId=${r.id}`
    )
  );

  const acceptance = rows[0];
  const outFile = path.resolve(`terms-acceptance-${user.id}.pdf`);
  await buildPdf(user, acceptance, outFile);
  console.log(`\n✅ Regenerated signed PDF -> ${outFile}\n`);
}

function buildPdf(user, acceptance, outFile) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const stream = fs.createWriteStream(outFile);
    doc.pipe(stream);

    const accepted = new Date(acceptance.acceptedAt);
    const effectiveDate = accepted.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    doc.fontSize(14).font('Helvetica-Bold')
      .text('CONFIDENTIALITY, NON-DISCLOSURE, AND NON-CIRCUMVENTION AGREEMENT', { align: 'center' }).moveDown(0.5);
    doc.fontSize(10).font('Helvetica')
      .text('THIS AMENDED AND RESTATED CONFIDENTIALITY, NON-DISCLOSURE, AND NON-CIRCUMVENTION AGREEMENT', { align: 'center' }).moveDown();
    doc.fontSize(10)
      .text(`This Agreement is made and entered into as of ${effectiveDate} (the "Effective Date"), by and between:`).moveDown(0.5);
    doc.font('Helvetica-Bold').text('DISCLOSING PARTY: ', { continued: true }).font('Helvetica')
      .text('The Domilea Group, an Illinois limited liability company ("Provider"), acting in its capacity as the exclusive marketing consultant and intermediary for the owner(s) of the business opportunities presented hereunder ("Seller"); and').moveDown(0.5);
    doc.font('Helvetica-Bold').text('RECIPIENT: ', { continued: true }).font('Helvetica')
      .text(`${user.name} (${user.email}), the undersigned party ("Recipient").`).moveDown();
    doc.font('Helvetica-Bold').text('RECITALS').moveDown(0.3);
    doc.font('Helvetica').fontSize(9)
      .text('WHEREAS, Provider serves as an intermediary for the sale of certain transportation, logistics, and trucking business assets (the "Business"); and WHEREAS, Provider possesses certain proprietary, non-public, and highly confidential information regarding the Business; and WHEREAS, Recipient has expressed an interest in evaluating a potential acquisition (the "Transaction");').moveDown(0.5);
    doc.text('NOW, THEREFORE, in consideration of the mutual covenants set forth herein, the Parties agree as follows:').moveDown();
    doc.font('Helvetica-Bold').fontSize(10).text('ARTICLE 1: CONFIDENTIAL INFORMATION').moveDown(0.3);
    doc.font('Helvetica').fontSize(9)
      .text('1.1. "Confidential Information" includes: (a) Corporate Identity; (b) Financial Data; (c) Operational Assets; (d) Commercial Relationships; (e) Human Capital; (f) Regulatory Status; and (g) The "Fact of Sale."').moveDown(0.3)
      .text('1.4. Recipient shall use Confidential Information solely for evaluating the Transaction and shall not compete with Seller or gain unfair commercial advantage.').moveDown();
    doc.font('Helvetica-Bold').fontSize(10).text('ARTICLE 2: NON-CIRCUMVENTION').moveDown(0.3);
    doc.font('Helvetica').fontSize(9)
      .text('2.1. Recipient shall not initiate contact with Seller, its owners, employees, or vendors without Provider\'s prior written consent. All communications must go through Provider.').moveDown(0.3)
      .text('2.2. For 24 months following the Effective Date, Recipient shall not: (a) Bypass Provider in any Transaction; (b) Enter alternative arrangements with Seller; (c) Interfere with Provider\'s agreement with Seller.').moveDown(0.3)
      .text('2.3. Liability for Circumvention: Recipient shall pay Provider 10% of Total Transaction Value or Provider\'s commission, whichever is greater.').moveDown();
    doc.font('Helvetica-Bold').fontSize(10).text('ARTICLE 3: NON-SOLICITATION').moveDown(0.3);
    doc.font('Helvetica').fontSize(9)
      .text('3.1. For 24 months, Recipient shall not solicit or hire Seller\'s employees, drivers, or contractors.').moveDown();
    doc.font('Helvetica-Bold').fontSize(10).text('ARTICLE 4: DISCLAIMER AND RELEASE').moveDown(0.3);
    doc.font('Helvetica').fontSize(9)
      .text('4.2. PROVIDER MAKES NO WARRANTIES OF ANY KIND. Recipient relies solely on its own due diligence.').moveDown(0.3)
      .text('4.4. Recipient releases Provider from all claims arising from inaccuracies in Confidential Information.').moveDown();
    doc.font('Helvetica-Bold').fontSize(10).text('ARTICLE 6: DISPUTE RESOLUTION').moveDown(0.3);
    doc.font('Helvetica').fontSize(9)
      .text('6.1. Governed by New York law. 6.2. Binding arbitration in New York, NY.').moveDown(0.3)
      .text('6.4. WAIVER OF JURY TRIAL. 6.5. Provider may seek injunctive relief without bond.').moveDown();

    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).text('SIGNATURE PAGE', { align: 'center' }).moveDown();
    doc.font('Helvetica').fontSize(10)
      .text('IN WITNESS WHEREOF, the Recipient has executed this Agreement as of the Effective Date.').moveDown(2);
    doc.font('Helvetica-Bold').text('RECIPIENT INFORMATION:').moveDown(0.5);
    doc.font('Helvetica').text(`Name: ${user.name}`).text(`Email: ${user.email}`).text(`User ID: ${user.id}`).moveDown();
    doc.font('Helvetica-Bold').text('ELECTRONIC SIGNATURE:').moveDown(0.5);
    doc.fontSize(18).font('Helvetica-Oblique').text(acceptance.signatureName, { align: 'center' }).moveDown(0.5);
    doc.fontSize(10).font('Helvetica')
      .text(`Date Signed: ${effectiveDate}`, { align: 'center' })
      .text(`Time: ${accepted.toLocaleTimeString()}`, { align: 'center' })
      .text(`IP Address: ${acceptance.ipAddress || 'Not recorded'}`, { align: 'center' }).moveDown(2);
    doc.fontSize(8)
      .text('This document was electronically signed through the MC-Xchange platform.', { align: 'center' })
      .text(`Document ID: ${acceptance.id}`, { align: 'center' })
      .text(`Terms Version: ${acceptance.termsVersion}`, { align: 'center' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
