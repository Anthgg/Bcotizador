import PDFDocument from "pdfkit";
import { DEFAULT_LOGO_PNG_BASE64 } from "./greda-logo.data";

export interface PdfCompany {
  tradeName?: string | null;
  legalName?: string | null;
  ruc?: string | null;
  address?: string | null;
  addressReference?: string | null;
  district?: string | null;
  province?: string | null;
  department?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  contactName?: string | null;
  contactRole?: string | null;
}
export interface PdfDocumentSettings {
  showLogo: boolean;
  showLegalName: boolean;
  showRuc: boolean;
  showAddress: boolean;
  showPhones: boolean;
  showEmail: boolean;
  showWebsite: boolean;
  validityText?: string | null;
  conditions?: string | null;
  observations?: string | null;
  estimatedTime?: string | null;
  paymentTerms?: string | null;
  bankName?: string | null;
  bankAccountHolder?: string | null;
  bankAccount?: string | null;
  bankCci?: string | null;
  closingMessage?: string | null;
  showSignature: boolean;
  signatureName?: string | null;
  signatureRole?: string | null;
}
export interface PdfQuoteItem {
  name: string;
  detail?: string | null;
  quantity: string | number;
  unit?: string | null;
  unitPrice: string | number | null;
  lineTotal: string | number | null;
}
export interface PdfQuote {
  code: string | null;
  status: string;
  issuedAt: string | Date;
  validUntil: string | Date;
  validityDays: number;
  customer: {
    name: string;
    documentType?: string | null;
    documentNumber?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  items: PdfQuoteItem[];
  totals: {
    subtotal: string | number | null;
    igvRate: string | number | null;
    igvAmount: string | number | null;
    total: string | number | null;
  };
  sample?: boolean;
}
export interface PdfLogo {
  data: Buffer;
  mimeType: string;
}

const INK = "#111111",
  TEXT = "#2b2b2b",
  MUTED = "#6f6f6b",
  LINE = "#e3e3df",
  SOFT = "#f6f6f3",
  ZEBRA = "#fafaf8";
const PAGE = { left: 42, right: 42, top: 40, bottom: 58 };

const amount = (value: unknown) =>
  "S/ " +
  Number(value ?? 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const quantityText = (value: unknown) =>
  Number(value ?? 0).toLocaleString("es-PE", { maximumFractionDigits: 3 });
const longDate = (value: string | Date) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
const shortDate = (value: string | Date) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
const join = (parts: Array<string | null | undefined>, separator: string) =>
  parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(separator);
const displayWebsite = (value?: string | null) =>
  value ? value.replace(/^https?:\/\//i, "").replace(/\/$/, "") : null;

/** Pick the logo PDFKit can embed: the uploaded PNG/JPEG, or the official GREDA mark when none was uploaded. */
function logoBuffer(logo: PdfLogo | null | undefined): Buffer | null {
  if (!logo) return Buffer.from(DEFAULT_LOGO_PNG_BASE64, "base64");
  if (logo.mimeType === "image/png" || logo.mimeType === "image/jpeg")
    return logo.data;
  return null;
}

export function fillDocumentText(
  template: string | null | undefined,
  quote: Pick<PdfQuote, "validityDays" | "validUntil">,
): string | null {
  if (!template) return null;
  return template
    .replace(/\{dias\}/gi, String(quote.validityDays))
    .replace(/\{vence\}/gi, longDate(quote.validUntil));
}

export function renderQuotationPdf(input: {
  company: PdfCompany;
  documents: PdfDocumentSettings;
  logo?: PdfLogo | null;
  quote: PdfQuote;
}): Promise<Buffer> {
  const { company, documents, quote } = input;
  const tradeName =
    company.tradeName?.trim() || company.legalName?.trim() || "GREDA";
  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    margins: {
      top: PAGE.top,
      bottom: PAGE.bottom,
      left: PAGE.left,
      right: PAGE.right,
    },
    info: {
      Title: "Cotización " + (quote.code ?? "borrador") + " · " + tradeName,
      Author: tradeName,
      Subject: "Cotización para " + quote.customer.name,
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const width = doc.page.width - PAGE.left - PAGE.right;
  const right = doc.page.width - PAGE.right;
  const bottomLimit = () => doc.page.height - PAGE.bottom - 6;
  const label = (
    text: string,
    x: number,
    y: number,
    options: PDFKit.Mixins.TextOptions = {},
  ) =>
    doc
      .font("Helvetica-Bold")
      .fontSize(7.2)
      .fillColor(MUTED)
      .text(text.toUpperCase(), x, y, {
        characterSpacing: 0.8,
        lineBreak: false,
        ...options,
      });

  // ---------- Header ----------
  let y = PAGE.top;
  const blockWidth = 186;
  const titleX = right - blockWidth;
  let textX = PAGE.left;
  let leftBottom = y;
  const logo = documents.showLogo ? logoBuffer(input.logo) : null;
  if (logo) {
    try {
      doc.image(logo, PAGE.left, y, { fit: [96, 64] });
      textX = PAGE.left + 108;
      leftBottom = y + 64;
    } catch {
      textX = PAGE.left;
    }
  }
  const companyWidth = titleX - textX - 14;
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(INK)
    .text(tradeName, textX, y, { width: companyWidth });
  let cy = doc.y + 2;
  const companyLine = (text: string | null, bold = false) => {
    if (!text) return;
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(8.2)
      .fillColor(bold ? TEXT : MUTED)
      .text(text, textX, cy, { width: companyWidth, lineGap: 1 });
    cy = doc.y + 1;
  };
  if (
    documents.showLegalName &&
    company.legalName &&
    company.legalName.trim() !== tradeName
  )
    companyLine(company.legalName, true);
  if (documents.showRuc && company.ruc)
    companyLine(
      "RUC " + company.ruc,
      !(documents.showLegalName && company.legalName),
    );
  if (documents.showAddress) {
    companyLine(
      join(
        [
          company.address,
          company.district,
          company.province,
          company.department,
        ],
        ", ",
      ) || null,
    );
    if (company.addressReference)
      companyLine("Ref.: " + company.addressReference);
  }
  if (documents.showPhones)
    companyLine(
      join(
        [
          company.phone ? "Tel. " + company.phone : null,
          company.mobile ? "Cel. " + company.mobile : null,
        ],
        "   ·   ",
      ) || null,
    );
  const contactLine = join(
    [
      documents.showEmail ? company.email : null,
      documents.showWebsite ? displayWebsite(company.website) : null,
    ],
    "   ·   ",
  );
  if (contactLine) companyLine(contactLine);
  leftBottom = Math.max(leftBottom, cy);

  doc
    .font("Helvetica-Bold")
    .fontSize(19)
    .fillColor(INK)
    .text("COTIZACIÓN", titleX, y - 2, {
      width: blockWidth,
      align: "right",
      characterSpacing: 1.2,
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(INK)
    .text(quote.code ?? "Sin código", titleX, doc.y + 1, {
      width: blockWidth,
      align: "right",
    });
  let ry = doc.y + 8;
  const metaRow = (name: string, value: string) => {
    doc
      .font("Helvetica")
      .fontSize(8.2)
      .fillColor(MUTED)
      .text(name, titleX, ry, { width: 80, lineBreak: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(8.2)
      .fillColor(TEXT)
      .text(value, titleX + 80, ry, {
        width: blockWidth - 80,
        align: "right",
        lineBreak: false,
      });
    ry += 13;
  };
  metaRow("Fecha de emisión", shortDate(quote.issuedAt));
  metaRow("Válida hasta", shortDate(quote.validUntil));
  metaRow("Moneda", "Soles (PEN)");
  const badge = quote.sample
    ? "VISTA PREVIA"
    : quote.status === "DRAFT"
      ? "BORRADOR"
      : quote.status === "CANCELLED"
        ? "ANULADA"
        : null;
  if (badge) {
    doc.font("Helvetica-Bold").fontSize(7);
    const badgeWidth = doc.widthOfString(badge, { characterSpacing: 0.8 }) + 14;
    doc
      .roundedRect(right - badgeWidth, ry + 2, badgeWidth, 15, 7.5)
      .lineWidth(0.8)
      .strokeColor(quote.status === "CANCELLED" ? "#b42318" : INK)
      .stroke();
    doc
      .fillColor(quote.status === "CANCELLED" ? "#b42318" : INK)
      .text(badge, right - badgeWidth, ry + 6, {
        width: badgeWidth,
        align: "center",
        characterSpacing: 0.8,
        lineBreak: false,
      });
    ry += 20;
  }
  y = Math.max(leftBottom, ry) + 14;
  doc
    .moveTo(PAGE.left, y)
    .lineTo(right, y)
    .lineWidth(1.6)
    .strokeColor(INK)
    .stroke();
  y += 16;

  // ---------- Client and summary ----------
  const clientWidth = width * 0.62;
  const summaryX = PAGE.left + clientWidth + 12;
  const summaryWidth = width - clientWidth - 12;
  const customer = quote.customer;
  const clientLines = [
    customer.documentNumber
      ? `${customer.documentType ?? "Documento"} ${customer.documentNumber}`
      : null,
    customer.address ?? null,
    join([customer.email, customer.phone], "   ·   ") || null,
  ].filter((line): line is string => !!line);
  doc.font("Helvetica-Bold").fontSize(11);
  const nameHeight = doc.heightOfString(customer.name, {
    width: clientWidth - 28,
  });
  doc.font("Helvetica").fontSize(8.6);
  const linesHeight = clientLines.reduce(
    (sum, line) =>
      sum + doc.heightOfString(line, { width: clientWidth - 28 }) + 2,
    0,
  );
  const summaryRows: Array<[string, string]> = [
    ["Vigencia", `${quote.validityDays} días`],
    [
      "Piezas",
      quantityText(
        quote.items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
      ),
    ],
  ];
  if (documents.estimatedTime)
    summaryRows.push(["Entrega", documents.estimatedTime]);
  const cardHeight =
    Math.max(30 + nameHeight + linesHeight, 26 + summaryRows.length * 15) + 8;
  doc.roundedRect(PAGE.left, y, clientWidth, cardHeight, 6).fill(SOFT);
  doc
    .roundedRect(summaryX, y, summaryWidth, cardHeight, 6)
    .lineWidth(0.8)
    .strokeColor(LINE)
    .stroke();
  label("Cliente", PAGE.left + 14, y + 12);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(customer.name, PAGE.left + 14, y + 25, { width: clientWidth - 28 });
  let ly = doc.y + 3;
  for (const line of clientLines) {
    doc
      .font("Helvetica")
      .fontSize(8.6)
      .fillColor(TEXT)
      .text(line, PAGE.left + 14, ly, { width: clientWidth - 28 });
    ly = doc.y + 2;
  }
  label("Resumen", summaryX + 12, y + 12);
  let sy = y + 27;
  for (const [name, value] of summaryRows) {
    doc
      .font("Helvetica")
      .fontSize(8.4)
      .fillColor(MUTED)
      .text(name, summaryX + 12, sy, { width: 60, lineBreak: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(8.4)
      .fillColor(TEXT)
      .text(value, summaryX + 70, sy, {
        width: summaryWidth - 82,
        align: "right",
        ellipsis: true,
        height: 12,
      });
    sy += 15;
  }
  y += cardHeight + 18;

  // ---------- Items table ----------
  const columns = [
    { key: "index", title: "#", width: 30, align: "left" as const },
    {
      key: "description",
      title: "Descripción",
      width: width - 30 - 54 - 56 - 84 - 88,
      align: "left" as const,
    },
    { key: "quantity", title: "Cant.", width: 54, align: "right" as const },
    { key: "unit", title: "Unidad", width: 56, align: "center" as const },
    {
      key: "unitPrice",
      title: "P. unitario",
      width: 84,
      align: "right" as const,
    },
    { key: "lineTotal", title: "Total", width: 88, align: "right" as const },
  ];
  const drawTableHeader = () => {
    doc.rect(PAGE.left, y, width, 22).fill(INK);
    let x = PAGE.left;
    for (const column of columns) {
      doc
        .font("Helvetica-Bold")
        .fontSize(7.4)
        .fillColor("#ffffff")
        .text(column.title.toUpperCase(), x + 8, y + 7.5, {
          width: column.width - 16,
          align: column.align,
          characterSpacing: 0.6,
          lineBreak: false,
        });
      x += column.width;
    }
    y += 22;
  };
  drawTableHeader();
  quote.items.forEach((item, index) => {
    const descriptionWidth = columns[1].width - 16;
    doc.font("Helvetica-Bold").fontSize(9);
    const titleHeight = doc.heightOfString(item.name, {
      width: descriptionWidth,
    });
    doc.font("Helvetica").fontSize(7.8);
    const detailHeight = item.detail
      ? doc.heightOfString(item.detail, { width: descriptionWidth }) + 2
      : 0;
    const rowHeight = Math.max(26, titleHeight + detailHeight + 16);
    if (y + rowHeight > bottomLimit()) {
      doc.addPage();
      y = PAGE.top;
      drawTableHeader();
    }
    if (index % 2 === 1) doc.rect(PAGE.left, y, width, rowHeight).fill(ZEBRA);
    let x = PAGE.left;
    const values: Record<string, string> = {
      index: String(index + 1).padStart(2, "0"),
      quantity: quantityText(item.quantity),
      unit: item.unit ?? "und",
      unitPrice: item.unitPrice == null ? "—" : amount(item.unitPrice),
      lineTotal: item.lineTotal == null ? "—" : amount(item.lineTotal),
    };
    for (const column of columns) {
      if (column.key === "description") {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(INK)
          .text(item.name, x + 8, y + 8, { width: descriptionWidth });
        if (item.detail)
          doc
            .font("Helvetica")
            .fontSize(7.8)
            .fillColor(MUTED)
            .text(item.detail, x + 8, doc.y + 2, { width: descriptionWidth });
      } else {
        doc
          .font(column.key === "lineTotal" ? "Helvetica-Bold" : "Helvetica")
          .fontSize(column.key === "index" ? 8 : 9)
          .fillColor(column.key === "index" ? MUTED : TEXT)
          .text(values[column.key], x + 8, y + 8, {
            width: column.width - 16,
            align: column.align,
            lineBreak: false,
          });
      }
      x += column.width;
    }
    y += rowHeight;
    doc
      .moveTo(PAGE.left, y)
      .lineTo(right, y)
      .lineWidth(0.5)
      .strokeColor(LINE)
      .stroke();
  });
  if (!quote.items.length) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text("Sin productos.", PAGE.left + 8, y + 10);
    y += 30;
  }
  y += 14;

  // ---------- Totals (kept together) ----------
  const totalsHeight = 92;
  if (y + totalsHeight > bottomLimit()) {
    doc.addPage();
    y = PAGE.top;
  }
  const totalsWidth = 236;
  const totalsX = right - totalsWidth;
  const igvPercent = (Number(quote.totals.igvRate ?? 0) * 100).toLocaleString(
    "es-PE",
    { maximumFractionDigits: 2 },
  );
  const totalRow = (name: string, value: string) => {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(name, totalsX + 12, y, { width: 120, lineBreak: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(TEXT)
      .text(value, totalsX + 120, y, {
        width: totalsWidth - 132,
        align: "right",
        lineBreak: false,
      });
    y += 17;
  };
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
    .text("Importes expresados en soles (S/).", PAGE.left, y + 2, {
      width: totalsX - PAGE.left - 20,
    });
  totalRow("Subtotal sin IGV", amount(quote.totals.subtotal));
  totalRow(`IGV (${igvPercent}%)`, amount(quote.totals.igvAmount));
  y += 3;
  doc.roundedRect(totalsX, y, totalsWidth, 38, 5).fill(INK);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#ffffff")
    .text("TOTAL", totalsX + 14, y + 14, {
      characterSpacing: 1.2,
      lineBreak: false,
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#ffffff")
    .text(amount(quote.totals.total), totalsX + 70, y + 10.5, {
      width: totalsWidth - 84,
      align: "right",
      lineBreak: false,
    });
  y += 38 + 24;

  // ---------- Conditions ----------
  const bank = join(
    [
      documents.bankName ? "Banco: " + documents.bankName : null,
      documents.bankAccountHolder
        ? "Titular: " + documents.bankAccountHolder
        : null,
      documents.bankAccount ? "Cuenta: " + documents.bankAccount : null,
      documents.bankCci ? "CCI: " + documents.bankCci : null,
    ],
    "\n",
  );
  const sections: Array<[string, string | null]> = [
    ["Validez", fillDocumentText(documents.validityText, quote)],
    ["Condiciones comerciales", documents.conditions ?? null],
    ["Tiempo estimado de entrega", documents.estimatedTime ?? null],
    ["Forma de pago", join([documents.paymentTerms, bank], "\n") || null],
    ["Observaciones", documents.observations ?? null],
  ];
  for (const [title, body] of sections) {
    if (!body) continue;
    doc.font("Helvetica").fontSize(8.8);
    const bodyHeight = doc.heightOfString(body, { width, lineGap: 2 });
    if (y + 16 + Math.min(bodyHeight, 40) > bottomLimit()) {
      doc.addPage();
      y = PAGE.top;
    }
    label(title, PAGE.left, y);
    doc
      .font("Helvetica")
      .fontSize(8.8)
      .fillColor(TEXT)
      .text(body, PAGE.left, y + 12, { width, lineGap: 2 });
    y = doc.y + 12;
  }

  // ---------- Closing and signature ----------
  if (documents.closingMessage) {
    if (y + 24 > bottomLimit()) {
      doc.addPage();
      y = PAGE.top;
    }
    doc
      .font("Helvetica-Oblique")
      .fontSize(9.2)
      .fillColor(TEXT)
      .text(documents.closingMessage, PAGE.left, y, { width });
    y = doc.y + 10;
  }
  if (documents.showSignature) {
    if (y + 70 > bottomLimit()) {
      doc.addPage();
      y = PAGE.top;
    }
    y += 34;
    const signWidth = 190;
    doc
      .moveTo(PAGE.left, y)
      .lineTo(PAGE.left + signWidth, y)
      .lineWidth(0.8)
      .strokeColor(INK)
      .stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(INK)
      .text(documents.signatureName || tradeName, PAGE.left, y + 6, {
        width: signWidth,
      });
    if (documents.signatureRole)
      doc
        .font("Helvetica")
        .fontSize(8.2)
        .fillColor(MUTED)
        .text(documents.signatureRole, PAGE.left, doc.y + 1, {
          width: signWidth,
        });
  }

  // ---------- Footer on every page ----------
  const range = doc.bufferedPageRange();
  const footerText = join(
    [
      tradeName,
      documents.showWebsite ? displayWebsite(company.website) : null,
      documents.showEmail ? company.email : null,
      documents.showPhones ? company.phone || company.mobile : null,
    ],
    "   ·   ",
  );
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const previousBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 38;
    doc
      .moveTo(PAGE.left, fy)
      .lineTo(right, fy)
      .lineWidth(0.5)
      .strokeColor(LINE)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(7.4)
      .fillColor(MUTED)
      .text(footerText, PAGE.left, fy + 9, {
        width: width - 90,
        lineBreak: false,
        ellipsis: true,
      });
    doc.text(
      `Página ${i - range.start + 1} de ${range.count}`,
      right - 90,
      fy + 9,
      { width: 90, align: "right", lineBreak: false },
    );
    doc.page.margins.bottom = previousBottom;
  }
  doc.end();
  return done;
}

/** Sample quotation used by Configuración › Documentos to preview the style without real data. */
export function sampleQuote(validityDays = 30, itemCount = 4): PdfQuote {
  const issuedAt = new Date();
  const base: PdfQuoteItem[] = [
    {
      name: "Plato hondo esmaltado",
      detail: "22 × 22 × 5 cm · Esmalte tenmoku",
      quantity: 24,
      unit: "und",
      unitPrice: 48.5,
      lineTotal: 1164,
    },
    {
      name: "Taza con asa",
      detail: "9 × 9 × 10 cm · Torno · Esmalte azul intenso",
      quantity: 24,
      unit: "und",
      unitPrice: 39.9,
      lineTotal: 957.6,
    },
    {
      name: "Fuente rectangular",
      detail: "34 × 22 × 6 cm · A mano",
      quantity: 6,
      unit: "und",
      unitPrice: 112,
      lineTotal: 672,
    },
    {
      name: "Florero con ilustración",
      detail: "14 × 14 × 28 cm · Ilustración a mano",
      quantity: 4,
      unit: "und",
      unitPrice: 165,
      lineTotal: 660,
    },
  ];
  const items = Array.from({ length: itemCount }, (_, index) => ({
    ...base[index % base.length],
    name:
      base[index % base.length].name +
      (index >= base.length ? ` · modelo ${index + 1}` : ""),
  }));
  const total = items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
  const subtotal = total / 1.18;
  return {
    code: "CTZ-" + issuedAt.getFullYear() + "-000123",
    status: "CONFIRMED",
    sample: true,
    issuedAt,
    validUntil: new Date(issuedAt.getTime() + validityDays * 86400000),
    validityDays,
    customer: {
      name: "Cliente de ejemplo S.A.C.",
      documentType: "RUC",
      documentNumber: "20123456789",
      email: "compras@cliente.pe",
      phone: "987 654 321",
    },
    items,
    totals: { subtotal, igvRate: 0.18, igvAmount: total - subtotal, total },
  };
}
