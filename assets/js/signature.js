(function () {
  window.ChantierProof = window.ChantierProof || {};

  window.ChantierProof.createSignaturePad = function (canvas) {
    const context = canvas.getContext("2d");
    let drawing = false;
    let hasInk = false;

    function resizeCanvas() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineWidth = 2.2;
      context.lineCap = "round";
      context.strokeStyle = "#020617";
    }

    function point(event) {
      const rect = canvas.getBoundingClientRect();
      const source = event.touches ? event.touches[0] : event;
      return {
        x: source.clientX - rect.left,
        y: source.clientY - rect.top
      };
    }

    function start(event) {
      event.preventDefault();
      drawing = true;
      const p = point(event);
      context.beginPath();
      context.moveTo(p.x, p.y);
    }

    function move(event) {
      if (!drawing) return;
      event.preventDefault();
      const p = point(event);
      context.lineTo(p.x, p.y);
      context.stroke();
      hasInk = true;
    }

    function stop() {
      drawing = false;
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", stop);

    return {
      clear() {
        context.clearRect(0, 0, canvas.width, canvas.height);
        hasInk = false;
      },
      isEmpty() {
        return !hasInk;
      },
      toBlob() {
        return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      }
    };
  };
})();
