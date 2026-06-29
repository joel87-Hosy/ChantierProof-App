(function () {
  window.ChantierProof = window.ChantierProof || {};

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

  function addText(doc, label, value, x, y) {
    doc.setFont("helvetica", "bold");
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(value || "-"), x + 50, y);
  }

  async function generateValidationPdf(client, row) {
    if (!window.jspdf?.jsPDF) {
      throw new Error("jsPDF n'est pas charge.");
    }

    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    const now = new Date();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("ChantierProof - Preuve d'intervention", 14, 18);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`PDF genere le ${window.ChantierProof.formatDate(now.toISOString())}`, 14, 26);

    doc.setFontSize(11);
    addText(doc, "Client", row.client_name, 14, 40);
    addText(doc, "Telephone", row.client_phone, 14, 48);
    addText(doc, "Intervention", row.intervention_title, 14, 56);
    addText(doc, "Tarif", formatPrice(row.intervention_price), 14, 64);
    addText(doc, "GPS", row.gps_position, 14, 72);
    addText(doc, "Technicien", row.technician_name, 14, 80);
    addText(doc, "Signataire", row.signer_name, 14, 88);
    addText(doc, "Signe le", window.ChantierProof.formatDate(row.signed_at), 14, 96);

    doc.setFont("helvetica", "bold");
    doc.text("Commentaire technicien", 14, 110);
    doc.setFont("helvetica", "normal");
    const notes = doc.splitTextToSize(row.technician_notes || "-", 180);
    doc.text(notes, 14, 118);

    const beforeUrl = await signedUrl(client, row.photo_before_url);
    const afterUrl = await signedUrl(client, row.photo_after_url);
    const signatureUrl = await signedUrl(client, row.signature_png_url);
    const beforeImage = await imageData(beforeUrl);
    const afterImage = await imageData(afterUrl);
    const signatureImage = await imageData(signatureUrl);

    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.text("Photos", 14, 18);
    if (beforeImage) {
      doc.text("Avant intervention", 14, 30);
      doc.addImage(beforeImage, imageFormat(beforeImage, "JPEG"), 14, 36, 84, 63);
    }
    if (afterImage) {
      doc.text("Apres intervention", 112, 30);
      doc.addImage(afterImage, imageFormat(afterImage, "JPEG"), 112, 36, 84, 63);
    }
    if (signatureImage) {
      doc.text("Signature client", 14, 118);
      doc.addImage(signatureImage, imageFormat(signatureImage, "PNG"), 14, 124, 84, 34);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Document genere par ChantierProof pour validation de facturation.", 14, 282);
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
