(function () {
  const id = window.ChantierProof.getValidationId();
  const clientEl = document.getElementById("recap-client");
  const titleEl = document.getElementById("recap-title");
  const signerEl = document.getElementById("recap-signer");
  const dateEl = document.getElementById("recap-date");

  async function loadRecap() {
    let row = null;
    try {
      const client = window.ChantierProof.getClient();
      const response = await client.from("validations").select("*").eq("id", id).single();
      if (response.error) throw response.error;
      row = response.data;
    } catch (error) {
      row = {
        client_name: "Client demo",
        intervention_title: "Intervention demo",
        signer_name: "-",
        signed_at: new Date().toISOString()
      };
    }

    clientEl.textContent = row.client_name || "-";
    titleEl.textContent = row.intervention_title || "-";
    signerEl.textContent = row.signer_name || "-";
    dateEl.textContent = window.ChantierProof.formatDate(row.signed_at);
  }

  loadRecap();
})();
