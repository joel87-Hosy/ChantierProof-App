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
  let validation = null;
  let csrfToken = "";

  function showError(message) {
    accountingError.textContent = message;
    accountingError.classList.remove("hidden");
  }

  sendButton.disabled = true;
  sendButton.classList.add("hidden");

  async function loadRecap() {
    if (!id) throw new Error("Lien de validation invalide.");
    const sessionResponse = await fetch("../api/index.php?action=session", {
      credentials: "same-origin",
      cache: "no-store"
    });
    const session = await sessionResponse.json();
    if (!sessionResponse.ok || !session.ok) throw new Error(session.error || "Session indisponible.");
    csrfToken = session.csrfToken;

    const response = await fetch(`../api/index.php?action=public-validation&id=${encodeURIComponent(id)}`, {
      credentials: "same-origin",
      cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Validation introuvable.");
    validation = result.validation;
    if (validation.status !== "signed") throw new Error("La validation n’a pas encore été scellée.");

    clientEl.textContent = validation.client_name || "-";
    titleEl.textContent = validation.intervention_title || "-";
    signerEl.textContent = validation.signer_name || "-";
    dateEl.textContent = window.ChantierProof.formatDate(validation.signed_at);
    detailLink.href = `../validation-detail.html?id=${encodeURIComponent(id)}`;
    if (validation.accounting_status === "sent_to_accounting") {
      sendButton.classList.add("hidden");
      accountingMessage.textContent = "Cette preuve a déjà été envoyée à la comptabilité.";
      accountingMessage.classList.remove("hidden");
    } else {
      sendButton.disabled = false;
      sendButton.classList.remove("hidden");
    }
  }

  sendButton.addEventListener("click", async () => {
    sendButton.disabled = true;
    accountingError.classList.add("hidden");
    accountingMessage.classList.add("hidden");
    try {
      await window.ChantierProof.submitAccountingRequest(validation, csrfToken);
      sendButton.classList.add("hidden");
      accountingMessage.textContent = "Preuve générée et envoyée au comptable.";
      accountingMessage.classList.remove("hidden");
    } catch (error) {
      console.error("Accounting request submission failed:", error);
      showError(error.message || "Impossible d’envoyer la preuve au comptable.");
      sendButton.disabled = false;
    }
  });

  loadRecap().catch((error) => {
    console.error("Load Hostinger validation recap failed:", error);
    showError(error.message || "Impossible de charger le récapitulatif.");
    sendButton.disabled = true;
  });
  window.lucide?.createIcons();
})();
