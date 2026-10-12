(function () {
  window.ChantierProof = window.ChantierProof || {};

  window.ChantierProof.getValidationId = function () {
    return new URLSearchParams(window.location.search).get("id");
  };

  window.ChantierProof.formatDate = function (value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  };

  window.lucide?.createIcons();
})();
