(function () {
  const id = window.ChantierProof.getValidationId();
  const clientEl = document.getElementById("recap-client");
  const titleEl = document.getElementById("recap-title");
  const signerEl = document.getElementById("recap-signer");
  const dateEl = document.getElementById("recap-date");
  const detailLink = document.getElementById("success-detail-link");
  const sendButton = document.getElementById("send-accounting-btn");
  const accountingMessage = document.getElementById("accounting-message");
  const accountingError = document.getElementById("accounting-error");
  let validationRow = null;

  async function loadRecap() {
    let row = null;
    try {
      const client = window.ChantierProof.getClient();
      const response = await client
        .from("validations")
        .select([
          "id",
          "client_name",
          "client_phone",
          "intervention_title",
          "intervention_price",
          "gps_position",
          "technician_name",
          "technician_notes",
          "signer_name",
          "signed_at",
          "photo_before_url",
          "photo_after_url",
          "signature_png_url"
        ].join(","))
        .eq("id", id)
        .single();
      if (response.error) throw response.error;
      row = response.data;
      validationRow = row;
    } catch (error) {
      console.error("Load success recap failed:", error);
      row = {
        client_name: "-",
        intervention_title: "-",
        signer_name: "-",
        signed_at: null
      };
    }

    clientEl.textContent = row.client_name || "-";
    titleEl.textContent = row.intervention_title || "-";
    signerEl.textContent = row.signer_name || "-";
    dateEl.textContent = window.ChantierProof.formatDate(row.signed_at);
    if (id) {
      detailLink.href = `../validation-detail.html?id=${encodeURIComponent(id)}`;
      detailLink.innerHTML = '<i data-lucide="file-check-2" class="icon"></i>Voir le detail';
      window.lucide?.createIcons();
    }
  }

  sendButton.addEventListener("click", async () => {
    accountingMessage.classList.add("hidden");
    accountingError.classList.add("hidden");

    if (!validationRow) {
      accountingError.textContent = "Validation introuvable.";
      accountingError.classList.remove("hidden");
      return;
    }

    sendButton.disabled = true;
    sendButton.textContent = "Generation du PDF...";

    try {
      const client = window.ChantierProof.getClient();
      const pdfPath = await window.ChantierProof.uploadValidationPdf(client, validationRow);
      const response = await client
        .from("accounting_requests")
        .insert({
          validation_id: id,
          pdf_url: pdfPath,
          status: "pending",
          requested_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (response.error) throw response.error;
      accountingMessage.textContent = "Demande envoyee au compte comptable. Elle est disponible dans l'interface comptabilite.";
      accountingMessage.classList.remove("hidden");
    } catch (error) {
      console.error("Send accounting failed:", error);
      accountingError.textContent = error.message || "Impossible d'envoyer le PDF au comptable.";
      accountingError.classList.remove("hidden");
    } finally {
      sendButton.disabled = false;
      sendButton.innerHTML = '<i data-lucide="send" class="icon"></i>Generer et envoyer au comptable';
      window.lucide?.createIcons();
    }
  });

  loadRecap();
})();
