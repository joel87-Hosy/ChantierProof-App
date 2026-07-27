(function () {
  window.ChantierProof = window.ChantierProof || {};
  let jsPdfPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        if (window.jspdf?.jsPDF) resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Chargement jsPDF impossible."));
      document.head.appendChild(script);
    });
  }

  async function ensureJsPdf() {
    if (window.jspdf?.jsPDF) return;
    if (!jsPdfPromise) {
      jsPdfPromise = loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
    }
    await jsPdfPromise;
  }

  function formatPrice(value) {
    if (value === null || value === undefined || value === "") return "-";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      maximumFractionDigits: 0
    }).format(Number(value));
  }

  async function signedUrl(client, path) {
    if (!path) return null;
    const response = await client.storage
      .from(window.CHANTIERPROOF_CONFIG.storageBucket)
      .createSignedUrl(path, 600);
    return response.error ? null : response.data.signedUrl;
  }

  async function imageData(url) {
    if (!url) return null;
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  function imageFormat(dataUrl, fallback) {
    if (!dataUrl) return fallback;
    if (dataUrl.startsWith("data:image/png")) return "PNG";
    if (dataUrl.startsWith("data:image/webp")) return "WEBP";
    return fallback;
  }

  const colors = {
    blue: [29, 78, 216],
    blueDark: [30, 64, 175],
    blueSoft: [239, 246, 255],
    cyan: [8, 145, 178],
    green: [21, 128, 61],
    greenSoft: [220, 252, 231],
    slate: [2, 6, 23],
    slateMuted: [71, 85, 105],
    slateSoft: [241, 245, 249],
    border: [226, 232, 240],
    white: [255, 255, 255]
  };

  function setColor(doc, color) {
    doc.setTextColor(color[0], color[1], color[2]);
  }

  function fill(doc, color) {
    doc.setFillColor(color[0], color[1], color[2]);
  }

  function stroke(doc, color) {
    doc.setDrawColor(color[0], color[1], color[2]);
  }

  function addLogo(doc, x, y) {
    fill(doc, colors.blue);
    doc.roundedRect(x, y, 15, 15, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setColor(doc, colors.white);
    doc.text("CP", x + 7.5, y + 9.7, { align: "center" });
  }

  function addHeader(doc, title, subtitle) {
    fill(doc, colors.blueSoft);
    doc.rect(0, 0, 210, 34, "F");
    fill(doc, colors.blue);
    doc.rect(0, 0, 210, 4, "F");
    addLogo(doc, 14, 11);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    setColor(doc, colors.slate);
    doc.text("ChantierProof", 33, 17);
    doc.setFontSize(9);
    setColor(doc, colors.blue);
    doc.text("Preuve terrain signee, prete pour la facturation", 33, 23);

    doc.setFontSize(12);
    setColor(doc, colors.blueDark);
    doc.text(title, 196, 16, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(doc, colors.slateMuted);
    doc.text(subtitle, 196, 23, { align: "right" });
  }

  function addFooter(doc, page) {
    stroke(doc, colors.border);
    doc.line(14, 282, 196, 282);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(doc, colors.slateMuted);
    doc.text("Document genere par ChantierProof pour validation de facturation.", 14, 288);
    doc.text(`Page ${page}`, 196, 288, { align: "right" });
  }

  function addSectionTitle(doc, title, x, y) {
    fill(doc, colors.blue);
    doc.roundedRect(x, y - 5, 2.2, 7, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setColor(doc, colors.slate);
    doc.text(title, x + 5, y);
  }

  function addBadge(doc, label, x, y, width) {
    fill(doc, colors.greenSoft);
    stroke(doc, colors.greenSoft);
    doc.roundedRect(x, y, width, 8, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setColor(doc, colors.green);
    doc.text(label, x + width / 2, y + 5.4, { align: "center" });
  }

  function addInfoTable(doc, rows, x, y, width) {
    const labelWidth = 46;
    const rowHeight = 12;
    stroke(doc, colors.border);
    doc.setLineWidth(.2);

    rows.forEach((row, index) => {
      const rowY = y + index * rowHeight;
      fill(doc, index % 2 === 0 ? colors.white : colors.slateSoft);
      doc.rect(x, rowY, width, rowHeight, "F");
      stroke(doc, colors.border);
      doc.rect(x, rowY, width, rowHeight);
      doc.line(x + labelWidth, rowY, x + labelWidth, rowY + rowHeight);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setColor(doc, colors.slateMuted);
      doc.text(row.label, x + 4, rowY + 7.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setColor(doc, colors.slate);
      const value = doc.splitTextToSize(String(row.value || "-"), width - labelWidth - 8);
      doc.text(value.slice(0, 2), x + labelWidth + 4, rowY + 7.5);
    });

    return y + rows.length * rowHeight;
  }

  function addTextBox(doc, text, x, y, width, height) {
    fill(doc, colors.slateSoft);
    stroke(doc, colors.border);
    doc.roundedRect(x, y, width, height, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(doc, colors.slate);
    const lines = doc.splitTextToSize(text || "-", width - 8);
    doc.text(lines.slice(0, Math.floor((height - 7) / 5)), x + 4, y + 8);
  }

  function addImageCard(doc, title, image, format, x, y, width, height) {
    fill(doc, colors.white);
    stroke(doc, colors.border);
    doc.roundedRect(x, y, width, height, 2, 2, "FD");
    fill(doc, colors.blueSoft);
    doc.roundedRect(x, y, width, 10, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setColor(doc, colors.blueDark);
    doc.text(title, x + 4, y + 6.5);

    if (image) {
      doc.addImage(image, format, x + 4, y + 14, width - 8, height - 18);
      return;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(doc, colors.slateMuted);
    doc.text("Image indisponible", x + width / 2, y + height / 2, { align: "center" });
  }

  async function generateValidationPdf(client, row) {
    await ensureJsPdf();

    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    const now = new Date();

    addHeader(
      doc,
      "Preuve d'intervention",
      `Genere le ${window.ChantierProof.formatDate(now.toISOString())}`
    );
    addBadge(doc, "INTERVENTION VALIDEE", 145, 40, 51);

    addSectionTitle(doc, "Synthese de facturation", 14, 49);
    addInfoTable(doc, [
      { label: "Client", value: row.client_name },
      { label: "Telephone", value: row.client_phone },
      { label: "Intervention", value: row.intervention_title },
      { label: "Tarif", value: formatPrice(row.intervention_price) },
      { label: "GPS", value: row.gps_position },
      { label: "Technicien", value: row.technician_name },
      { label: "Signataire", value: row.signer_name },
      { label: "Signe le", value: window.ChantierProof.formatDate(row.signed_at) }
    ], 14, 56, 182);

    addSectionTitle(doc, "Commentaire technicien", 14, 160);
    addTextBox(doc, row.technician_notes || "Aucun commentaire renseigne.", 14, 168, 182, 42);

    addSectionTitle(doc, "Controle et tracabilite", 14, 225);
    addInfoTable(doc, [
      { label: "Document", value: "Preuve terrain ChantierProof" },
      { label: "Usage", value: "Validation de facturation" },
      { label: "Statut", value: "Signe et scelle" }
    ], 14, 232, 182);

    addFooter(doc, 1);

    const beforeUrl = await signedUrl(client, row.photo_before_url);
    const afterUrl = await signedUrl(client, row.photo_after_url);
    const signatureUrl = await signedUrl(client, row.signature_png_url);
    const beforeImage = await imageData(beforeUrl);
    const afterImage = await imageData(afterUrl);
    const signatureImage = await imageData(signatureUrl);

    doc.addPage();
    addHeader(
      doc,
      "Pieces de preuve",
      `Validation ${String(row.id || "").slice(0, 8) || "-"}`
    );
    addSectionTitle(doc, "Photos terrain", 14, 48);
    addImageCard(doc, "Photo avant intervention", beforeImage, imageFormat(beforeImage, "JPEG"), 14, 56, 86, 78);
    addImageCard(doc, "Photo apres intervention", afterImage, imageFormat(afterImage, "JPEG"), 110, 56, 86, 78);

    addSectionTitle(doc, "Signature client", 14, 150);
    addImageCard(doc, "Signature", signatureImage, imageFormat(signatureImage, "PNG"), 14, 158, 86, 42);
    addInfoTable(doc, [
      { label: "Signataire", value: row.signer_name },
      { label: "Date", value: window.ChantierProof.formatDate(row.signed_at) },
      { label: "Consentement", value: "Validation acceptee pour facturation" }
    ], 110, 158, 86);

    addFooter(doc, 2);
    return doc;
  }

  async function uploadValidationPdf(client, row) {
    const doc = await generateValidationPdf(client, row);
    const blob = doc.output("blob");
    const path = `${row.id}/preuve-${Date.now()}.pdf`;
    const response = await client.storage
      .from(window.CHANTIERPROOF_CONFIG.storageBucket)
      .upload(path, blob, { contentType: "application/pdf" });

    if (response.error) throw response.error;
    return path;
  }

  async function openPdf(client, path) {
    const url = await signedUrl(client, path);
    if (!url) throw new Error("PDF indisponible.");
    window.open(url, "_blank", "noopener");
  }

  window.ChantierProof.generateValidationPdf = generateValidationPdf;
  window.ChantierProof.uploadValidationPdf = uploadValidationPdf;
  window.ChantierProof.openPdf = openPdf;
})();
