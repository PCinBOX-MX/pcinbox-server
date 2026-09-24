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
        "idUser",
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
    var okMsg = $("okMsg");
    var errMsg = $("errMsg");
    var submitBtn = $("submitBtn");
    var doneBox = $("doneBox");
    var blockedBox = $("blockedBox");

    // Token: inyectado por el server tras validar, o ?token= del correo
    var params = new URLSearchParams(window.location.search);
    var token =
      (tokenEl && tokenEl.value ? tokenEl.value : "").trim() ||
      (params.get("token") || "").trim();

    if (tokenEl) tokenEl.value = token;

    var formBlocked = form && form.style.display === "none";

    if (!formBlocked && !token) {
      show(
        errMsg,
        "El enlace está incompleto o no es válido. Solicita uno nuevo desde «Olvidé mi contraseña».",
      );
      if (form) form.style.display = "none";
      if (blockedBox) blockedBox.classList.add("show");
      formBlocked = true;
    }

    [np1, np2].forEach(function (input) {
      if (!input) return;
      input.addEventListener("focus", function () {
        input.removeAttribute("readonly");
      });
    });

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

        var willReveal = field.type === "password";
        field.type = willReveal ? "text" : "password";
        btn.classList.toggle("is-visible", willReveal);
        var label = willReveal ? "Ocultar contraseña" : "Mostrar contraseña";
        btn.setAttribute("aria-label", label);
        btn.setAttribute("title", label);
      });
    });

    if (!form || formBlocked) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      hide(okMsg);
      hide(errMsg);

      var pass = (np1 && np1.value ? np1.value : "").trim();
      var confirm = (np2 && np2.value ? np2.value : "").trim();
      token = (tokenEl && tokenEl.value ? tokenEl.value : token).trim();

      if (!token) {
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
