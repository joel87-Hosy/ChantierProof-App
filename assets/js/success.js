(function () {
  const id = window.ChantierProof.getValidationId();
  const clientEl = document.getElementById("recap-client");
  const titleEl = document.getElementById("recap-title");
  const signerEl = document.getElementById("recap-signer");
  const dateEl = document.getElementById("recap-date");
  const detailLink = document.getElementById("success-detail-link");
  const accountingMessage = document.getElementById("accounting-message");
  const accountingError = document.getElementById("accounting-error");
  const sendButton = document.getElementById("send-accounting-btn");

  async function loadRecap() {
    if (!id) {
      throw new Error("Lien de validation invalide.");
    }

    const response = await fetch(`../api/index.php?action=public-validation&id=${encodeURIComponent(id)}`, {
      credentials: "same-origin",
      cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Validation introuvable.");
    const row = result.validation;

    if (row.status !== "signed") {
      throw new Error("La validation n’a pas encore été scellée.");
    }

    clientEl.textContent = row.client_name || "-";
    titleEl.textContent = row.intervention_title || "-";
    signerEl.textContent = row.signer_name || "-";
    dateEl.textContent = window.ChantierProof.formatDate(row.signed_at);
    detailLink.href = `../validation-detail.html?id=${encodeURIComponent(id)}`;
  }

  sendButton.disabled = true;
  sendButton.classList.add("hidden");
  accountingMessage.textContent = "L’envoi au comptable sera disponible après la migration du module comptabilité.";
  accountingMessage.classList.remove("hidden");

  loadRecap().catch((error) => {
    console.error("Load Hostinger validation recap failed:", error);
    accountingError.textContent = error.message || "Impossible de charger le récapitulatif.";
    accountingError.classList.remove("hidden");
  });

  window.lucide?.createIcons();
})();
