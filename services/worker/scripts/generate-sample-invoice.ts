/**
 * Standalone script to generate a sample invoice PDF
 * Run with: npx ts-node scripts/generate-sample-invoice.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer-core';
import { buildInvoiceHTML } from '../src/services/invoice-generator/template';
import type { InvoiceData, BusinessConfig } from '../../../shared/types';

// Sample business config
const sampleBusinessConfig: BusinessConfig = {
  business: {
    name: 'צאלה',
    taxId: '206099137',
    taxStatus: 'עוסק פטור מס',
    email: 'tzeelaprojects@gmail.com',
    phone: '0505777928',
    address: 'מודיעין',
  },
  invoice: {
    digitalSignatureText: 'מסמך ממוחשב חתום דיגיטלית',
    generatedByText: 'הופק ע"י PaperTrail',
  },
};

// Sample invoice data
const sampleInvoiceData: InvoiceData = {
  invoiceNumber: '20261',
  documentType: 'invoice_receipt',
  customerName: 'אלעד וקורין',
  customerTaxId: undefined,
  description: 'אלבום חתונה - צילום ועריכה',
  amount: 275,
  paymentMethod: 'ביט',
  date: '2026-01-14',
};

async function generateSampleInvoice(): Promise<void> {
  console.log('🔧 Generating sample invoice...\n');

  // Load logo from docs/assets
  const logoPath = path.join(__dirname, '..', '..', '..', 'docs', 'assets', 'invoice-logo.jpeg');
  let logoBase64: string | null = null;

  if (fs.existsSync(logoPath)) {
    const logoBuffer = fs.readFileSync(logoPath);
    logoBase64 = `data:image/jpeg;base64,${logoBuffer.toString('base64')}`;
    console.log(`🖼️  Logo loaded: ${logoPath}`);
  } else {
    console.log(`⚠️  Logo not found at: ${logoPath}`);
  }

  // Build HTML with logo
  const html = buildInvoiceHTML(sampleInvoiceData, sampleBusinessConfig, logoBase64);

  // Save HTML for debugging
  const htmlPath = path.join(__dirname, 'sample-invoice.html');
  fs.writeFileSync(htmlPath, html);
  console.log(`📄 HTML saved to: ${htmlPath}`);

  // Try to find Chrome/Chromium
  const chromePaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];

  let chromePath: string | undefined;
  for (const p of chromePaths) {
    if (fs.existsSync(p)) {
      chromePath = p;
      break;
    }
  }

  if (!chromePath) {
    console.log(
      '\n⚠️  Chrome/Chromium not found. HTML file saved - open it in a browser to preview.'
    );
    console.log('   To generate PDF, install Chrome or set PUPPETEER_EXECUTABLE_PATH');
    return;
  }

  console.log(`🌐 Using browser: ${chromePath}`);

  // Launch browser
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Set content
    await page.setContent(html, { waitUntil: 'networkidle0' });

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

    // Save PDF
    const pdfPath = path.join(__dirname, 'sample-invoice.pdf');
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
