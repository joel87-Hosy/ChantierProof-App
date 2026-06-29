(function () {
  const id = window.ChantierProof.getValidationId();
  const form = document.getElementById("validation-form");
  const errorBox = document.getElementById("form-error");
  const clientName = document.getElementById("client-name");
  const interventionTitle = document.getElementById("intervention-title");
  const beforeInput = document.getElementById("photo-before");
  const afterInput = document.getElementById("photo-after");
  const beforeName = document.getElementById("photo-before-name");
  const afterName = document.getElementById("photo-after-name");
  const signerInput = document.getElementById("signer-name");
  const consentInput = document.getElementById("legal-consent");
  const sealButton = document.getElementById("seal-btn");
  const signature = window.ChantierProof.createSignaturePad(document.getElementById("signature-canvas"));

  let validation = null;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function setFileName(input, target) {
    const file = input.files && input.files[0];
    target.textContent = file ? file.name : "Caméra requise";
  }

  async function loadValidation() {
    if (!id) {
      showError("Lien de validation invalide.");
      return;
    }

    try {
      const client = window.ChantierProof.getClient();
      const response = await client.from("validations").select("*").eq("id", id).single();
      if (response.error) throw response.error;
      validation = response.data;
    } catch (error) {
      validation = {
        id,
        client_name: "Client demo",
        intervention_title: "Intervention demo",
        status: "pending"
      };
    }

    clientName.textContent = validation.client_name;
    interventionTitle.textContent = validation.intervention_title;
  }

  async function uploadFile(client, file, path) {
    if (!file) return null;
    const response = await client.storage
      .from(window.CHANTIERPROOF_CONFIG.storageBucket)
      .upload(path, file, { upsert: true });
    if (response.error) throw response.error;
    return response.data.path;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");

    if (!beforeInput.files[0] || !afterInput.files[0]) {
      showError("Ajoute les deux photos avant et après.");
      return;
    }
    if (signature.isEmpty()) {
      showError("La signature est obligatoire.");
      return;
    }
    if (!signerInput.value.trim() || !consentInput.checked) {
      showError("Renseigne le nom du signataire et coche le consentement.");
      return;
    }

    sealButton.disabled = true;
    sealButton.textContent = "Scellement...";

    try {
      const client = window.ChantierProof.getClient();
      const signatureBlob = await signature.toBlob();
      const prefix = `${id}/${Date.now()}`;
      const beforePath = await uploadFile(client, beforeInput.files[0], `${prefix}-before.jpg`);
      const afterPath = await uploadFile(client, afterInput.files[0], `${prefix}-after.jpg`);
      const signaturePath = await uploadFile(client, signatureBlob, `${prefix}-signature.png`);

      const response = await client.from("validations").update({
        status: "signed",
        photo_before_url: beforePath,
        photo_after_url: afterPath,
        signature_png_url: signaturePath,
        signer_name: signerInput.value.trim(),
        signed_at: new Date().toISOString()
      }).eq("id", id);

      if (response.error) throw response.error;
      window.location.href = `./success.html?id=${encodeURIComponent(id)}`;
    } catch (error) {
      showError("Impossible de sceller l'intervention. Vérifie la configuration Supabase.");
      sealButton.disabled = false;
      sealButton.textContent = "Valider et Sceller l'intervention";
    }
  });

  beforeInput.addEventListener("change", () => setFileName(beforeInput, beforeName));
  afterInput.addEventListener("change", () => setFileName(afterInput, afterName));
  document.getElementById("clear-signature").addEventListener("click", () => signature.clear());

  loadValidation();
})();
