/**
 * Standalone script to generate a sample invoice PDF
 * Run with: npx ts-node scripts/invoice/generate-sample-invoice.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { buildInvoiceHTML } from '../../src/services/invoice-generator/template';
import type { InvoiceData, BusinessConfig } from '../../../../shared/types';

// Demo business config (generic for GitHub)
const sampleBusinessConfig: BusinessConfig = {
  business: {
    name: 'העסק שלי בע״מ',
    taxId: '512345678',
    taxStatus: 'עוסק מורשה',
    email: 'demo@example.com',
    phone: '03-1234567',
    address: 'רחוב הדוגמה 42, תל אביב',
  },
  invoice: {
    digitalSignatureText: 'מסמך ממוחשב חתום דיגיטלית',
    generatedByText: 'הופק ע"י Papertrail',
  },
};

// Demo invoice data (generic for GitHub)
const sampleInvoiceData: InvoiceData = {
  invoiceNumber: '20260001',
  documentType: 'invoice_receipt',
  customerName: 'ישראל ישראלי',
  customerTaxId: '123456789',
  description: 'שירותי ייעוץ - ינואר 2026',
  amount: 1500,
  paymentMethod: 'העברה',
  date: '2026-01-15',
};

async function generateSampleInvoice(): Promise<void> {
  console.log('🔧 Generating sample invoice...\n');

  // For the demo sample, we don't include a logo (shows placeholder icon instead)
  // This keeps real business logos out of the git repo
  const logoBase64: string | null = null;
  console.log('🖼️  Using placeholder logo (no custom logo for demo)');

  // Build HTML with logo
  const html = buildInvoiceHTML(sampleInvoiceData, sampleBusinessConfig, logoBase64);

  // Save HTML for debugging (output folder)
  const outputDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const htmlPath = path.join(outputDir, 'sample-invoice.html');
  fs.writeFileSync(htmlPath, html);
  console.log(`📄 HTML saved to: ${htmlPath}`);

  console.log('🌐 Using Playwright Chromium (auto-installed)');

  // Launch browser using Playwright
  // Playwright manages its own Chromium browser installation
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Set content
    await page.setContent(html, { waitUntil: 'networkidle' });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
    });

    // Save PDF (output folder)
    const pdfPath = path.join(outputDir, 'sample-invoice.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);

    console.log(`\n✅ PDF generated successfully!`);
    console.log(`📁 Location: ${pdfPath}`);
    console.log(`📊 Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  } finally {
    await browser.close();
  }
}

// Run
generateSampleInvoice()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
