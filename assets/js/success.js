(function () {
  const id = window.ChantierProof.getValidationId();
  const clientEl = document.getElementById("recap-client");
  const titleEl = document.getElementById("recap-title");
  const signerEl = document.getElementById("recap-signer");
  const dateEl = document.getElementById("recap-date");
  const detailLink = document.getElementById("success-detail-link");

  async function loadRecap() {
    let row = null;
    try {
      const client = window.ChantierProof.getClient();
      const response = await client.from("validations").select("*").eq("id", id).single();
      if (response.error) throw response.error;
      row = response.data;
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

  loadRecap();
})();
