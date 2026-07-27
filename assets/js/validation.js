(function () {
  const id = window.ChantierProof.getValidationId();
  const form = document.getElementById("validation-form");
  const errorBox = document.getElementById("form-error");
  const clientName = document.getElementById("client-name");
  const interventionTitle = document.getElementById("intervention-title");
  const beforeCameraInput = document.getElementById("photo-before-camera");
  const beforeImportInput = document.getElementById("photo-before-import");
  const afterCameraInput = document.getElementById("photo-after-camera");
  const afterImportInput = document.getElementById("photo-after-import");
  const beforeName = document.getElementById("photo-before-name");
  const afterName = document.getElementById("photo-after-name");
  const technicianNameInput = document.getElementById("technician-name");
  const fieldGpsInput = document.getElementById("field-gps-position");
  const captureGpsButton = document.getElementById("capture-field-gps");
  const technicianNotesInput = document.getElementById("technician-notes");
  const signerInput = document.getElementById("signer-name");
  const consentInput = document.getElementById("legal-consent");
  const sealButton = document.getElementById("seal-btn");
  const signature = window.ChantierProof.createSignaturePad(document.getElementById("signature-canvas"));

  let validation = null;
  let beforeFile = null;
  let afterFile = null;
  const imageOptions = {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.78
  };

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function setFileName(input, target, assignFile) {
    const file = input.files && input.files[0];
    if (!file) return;
    assignFile(file);
    target.textContent = file.name;
  }

  function restoreButtonIcon(button, icon, label) {
    button.innerHTML = `<i data-lucide="${icon}" class="icon"></i>${label}`;
    window.lucide?.createIcons();
  }

  function disableValidationForm() {
    form.querySelectorAll("input, button, textarea, canvas").forEach((element) => {
      if (element.id !== "clear-signature") element.disabled = true;
    });
  }

  function isExpired(value) {
    return value && new Date(value).getTime() <= Date.now();
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Compression image impossible."));
        }
      }, type, quality);
    });
  }

  function imageFromFile(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file);
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image illisible."));
      image.src = URL.createObjectURL(file);
    });
  }

  async function compressImage(file, label) {
    if (!file || !file.type.startsWith("image/")) {
      throw new Error(`${label} : fichier image invalide.`);
    }

    const source = await imageFromFile(file);
    const ratio = Math.min(
      1,
      imageOptions.maxWidth / source.width,
      imageOptions.maxHeight / source.height
    );
    const width = Math.max(1, Math.round(source.width * ratio));
    const height = Math.max(1, Math.round(source.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(source, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", imageOptions.quality);
    const compressedName = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
    return new File([blob], compressedName, {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  }

  async function loadValidation() {
    if (!id) {
      showError("Lien de validation invalide.");
      return;
    }

    try {
      const client = window.ChantierProof.getClient();
      let response = await client
        .from("validations")
        .select("id,client_name,intervention_title,status,validation_link_expires_at")
        .eq("id", id)
        .single();

      if (response.error?.code === "42703") {
        response = await client
          .from("validations")
          .select("id,client_name,intervention_title,status")
          .eq("id", id)
          .single();
      }

      if (response.error) throw response.error;
      validation = response.data;
    } catch (error) {
      console.error("Load validation failed:", error);
      showError(`Validation introuvable ou expiree : ${error.message || "verifie le lien genere."}`);
      clientName.textContent = "Lien invalide";
      interventionTitle.textContent = "";
      disableValidationForm();
      return;
    }

    clientName.textContent = validation.client_name;
    interventionTitle.textContent = validation.intervention_title;

    if (isExpired(validation.validation_link_expires_at)) {
      showError("Ce lien terrain n'est plus valide car la demande a deja ete envoyee au comptable.");
      disableValidationForm();
    }
  }

  async function uploadFile(client, file, path, label) {
    if (!file) return null;
    const response = await client.storage
      .from(window.CHANTIERPROOF_CONFIG.storageBucket)
      .upload(path, file);
    if (response.error) {
      throw new Error(`${label} : ${response.error.message}`);
    }
    return response.data.path;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");

    if (!beforeFile || !afterFile) {
      showError("Ajoute les deux photos avant et apres, depuis la camera ou la galerie.");
      return;
    }
    if (!technicianNameInput.value.trim()) {
      showError("Renseigne le nom du technicien ou de l'equipe.");
      return;
    }
    if (!fieldGpsInput.value.trim()) {
      showError("Renseigne ou capture la position GPS du site.");
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
      const compressedBefore = await compressImage(beforeFile, "Photo avant");
      const compressedAfter = await compressImage(afterFile, "Photo apres");
      const beforePath = await uploadFile(client, compressedBefore, `${prefix}-before.jpg`, "Upload photo avant");
      const afterPath = await uploadFile(client, compressedAfter, `${prefix}-after.jpg`, "Upload photo apres");
      const signaturePath = await uploadFile(client, signatureBlob, `${prefix}-signature.png`, "Upload signature");

      const response = await client
        .from("validations")
        .update({
          status: "signed",
          photo_before_url: beforePath,
          photo_after_url: afterPath,
          signature_png_url: signaturePath,
          technician_name: technicianNameInput.value.trim(),
          gps_position: fieldGpsInput.value.trim(),
          technician_notes: technicianNotesInput.value.trim() || null,
          signer_name: signerInput.value.trim(),
          signed_at: new Date().toISOString()
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("id,photo_before_url,photo_after_url")
        .single();

      if (response.error) {
        throw new Error(`Mise a jour validation : ${response.error.message}`);
      }
      if (!response.data?.photo_before_url || !response.data?.photo_after_url) {
        throw new Error("Les photos ont ete envoyees, mais leurs chemins n'ont pas ete enregistres.");
      }
      window.location.href = `./success.html?id=${encodeURIComponent(id)}`;
    } catch (error) {
      console.error("Seal validation failed:", error);
      showError(`Impossible de sceller l'intervention : ${error.message || "verifie la configuration Supabase."}`);
      sealButton.disabled = false;
      sealButton.textContent = "Valider et Sceller l'intervention";
    }
  });

  beforeCameraInput.addEventListener("change", () => setFileName(beforeCameraInput, beforeName, (file) => { beforeFile = file; }));
  beforeImportInput.addEventListener("change", () => setFileName(beforeImportInput, beforeName, (file) => { beforeFile = file; }));
  afterCameraInput.addEventListener("change", () => setFileName(afterCameraInput, afterName, (file) => { afterFile = file; }));
  afterImportInput.addEventListener("change", () => setFileName(afterImportInput, afterName, (file) => { afterFile = file; }));
  captureGpsButton.addEventListener("click", () => {
    errorBox.classList.add("hidden");
    if (!navigator.geolocation) {
      showError("La geolocalisation n'est pas disponible dans ce navigateur.");
      return;
    }

    captureGpsButton.disabled = true;
    captureGpsButton.textContent = "Localisation...";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fieldGpsInput.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        restoreButtonIcon(captureGpsButton, "map-pin", "Capturer ma position");
        captureGpsButton.disabled = false;
      },
      (error) => {
        showError(`Position GPS indisponible : ${error.message}`);
        restoreButtonIcon(captureGpsButton, "map-pin", "Capturer ma position");
        captureGpsButton.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
  document.getElementById("clear-signature").addEventListener("click", () => signature.clear());

  loadValidation();
})();
