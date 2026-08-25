(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function stripSensitiveQuery() {
    try {
      var url = new URL(window.location.href);
      var keys = [
        "password",
        "confirmPassword",
        "newPassword",
        "pass",
        "pwd",
        "np1",
        "np2",
      ];
      var changed = false;
      keys.forEach(function (k) {
        if (url.searchParams.has(k)) {
          url.searchParams.delete(k);
          changed = true;
        }
      });
      if (changed) {
        window.history.replaceState({}, document.title, url.pathname + url.search);
      }
    } catch (_) {}
  }

  function show(el, text) {
    if (!el) return;
    if (el.id === "errMsg") {
      var t = $("errText");
      if (t) t.textContent = text || "";
    } else {
      el.textContent = text || "";
    }
    el.classList.add("show");
  }

  function hide(el) {
    if (el) el.classList.remove("show");
  }

  function clearPasswords() {
    ["np1", "np2"].forEach(function (id) {
      var input = $(id);
      if (input) input.value = "";
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    stripSensitiveQuery();
    clearPasswords();

    var form = $("resetForm");
    var np1 = $("np1");
    var np2 = $("np2");
    var tokenEl = $("token");
    var idUserEl = $("idUser");
    var okMsg = $("okMsg");
    var errMsg = $("errMsg");
    var submitBtn = $("submitBtn");
    var doneBox = $("doneBox");

    var params = new URLSearchParams(window.location.search);
    var token = params.get("token") || "";
    var idUser = params.get("idUser") || "";

    if (tokenEl) tokenEl.value = token;
    if (idUserEl) idUserEl.value = idUser;

    [np1, np2].forEach(function (input) {
      if (!input) return;
      input.addEventListener("focus", function () {
        input.removeAttribute("readonly");
      });
    });

    // Autofill tardío del navegador
    window.setTimeout(clearPasswords, 50);
    window.setTimeout(function () {
      [np1, np2].forEach(function (input) {
        if (input && document.activeElement !== input) input.value = "";
      });
    }, 400);

    document.querySelectorAll(".eye").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-target");
        var field = id ? $(id) : null;
        if (!field) return;
        var showText = field.type === "password";
        field.type = showText ? "text" : "password";
        btn.classList.toggle("on", showText);
        btn.setAttribute(
          "aria-label",
          showText ? "Ocultar contraseña" : "Mostrar contraseña",
        );
      });
    });

    if (!form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      hide(okMsg);
      hide(errMsg);

      var pass = (np1 && np1.value ? np1.value : "").trim();
      var confirm = (np2 && np2.value ? np2.value : "").trim();

      if (!token || !idUser) {
        show(errMsg, "El enlace no es válido o está incompleto. Solicita uno nuevo.");
        return;
      }
      if (!pass || !confirm) {
        show(errMsg, "Completa ambos campos.");
        return;
      }
      if (pass.length < 8) {
        show(errMsg, "La contraseña debe tener al menos 8 caracteres.");
        return;
      }
      if (pass !== confirm) {
        show(errMsg, "Las contraseñas no coinciden.");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add("loading");
      }

      try {
        var res = await fetch("/api/v1/resetpassword/changePassword", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            newPassword: pass,
            token: token,
            idUser: idUser,
          }),
          cache: "no-store",
        });

        var data = {};
        try {
          data = await res.json();
        } catch (_) {}

        if (!res.ok) {
          throw new Error(data.message || "No se pudo actualizar la contraseña.");
        }

        show(okMsg, data.message || "Contraseña actualizada correctamente.");
        form.reset();
        clearPasswords();
        form.style.display = "none";
        if (doneBox) doneBox.classList.add("show");
      } catch (err) {
        show(errMsg, (err && err.message) || "Error al cambiar la contraseña.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove("loading");
        }
      }
    });
  });
})();
