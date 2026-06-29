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
      const response = await client.from("validations").select("*").eq("id", id).single();
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
      const response = await client.from("validations").update({
        pdf_url: pdfPath,
        accounting_status: "sent_to_accounting",
        sent_to_accounting_at: new Date().toISOString()
      }).eq("id", id);

      if (response.error) throw response.error;
      validationRow.pdf_url = pdfPath;
      validationRow.accounting_status = "sent_to_accounting";
      accountingMessage.textContent = "PDF envoye au comptable. Il est disponible dans le detail de la validation.";
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
