// Invite (/join) and email-link (/auth/callback, /auth/reset) pages: hand the link to the Davey app, and show the
// invite on the web when the app isn't installed. No cookies, no analytics, nothing stored.
(function () {
  "use strict";
  var config = window.DAVEY_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var page = document.body.getAttribute("data-page");
  var $ = function (id) { return document.getElementById(id); };

  function show(id, visible) { var el = $(id); if (el) el.hidden = !visible; }
  function setText(id, text) { var el = $(id); if (el) el.textContent = text; }
  var isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

  function openApp(url, auto) {
    var link = $("open-app");
    if (link) link.href = url;
    if (auto && isApple) {
      try { sessionStorage.getItem("davey-handoff-" + url) || (sessionStorage.setItem("davey-handoff-" + url, "1"), location.href = url); }
      catch (e) { /* storage blocked: the button still works */ }
    }
  }

  function copy(text, statusId, message) {
    function done() { setText(statusId, message); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(done, function () { setText(statusId, "Copy this link: " + text); });
    }
    setText(statusId, "Copy this link: " + text);
    return Promise.resolve();
  }

  function formatDate(iso) {
    var date = new Date(iso);
    if (isNaN(date)) return null;
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }

  // ---- /join ----
  function join() {
    var token = params.get("t") || "";
    var inviteURL = "https://daveypersonalfinance.com/join?t=" + encodeURIComponent(token);
    if (!token) {
      setText("title", "This invite link is incomplete");
      setText("lead", "Ask the person who invited you to send the link again, or to copy it from Davey.");
      show("actions", false); show("steps", false);
      return;
    }
    openApp("davey://join?t=" + encodeURIComponent(token), false);

    var download = $("download");
    var storeURL = config.appStoreURL || config.testflightURL;
    if (storeURL) {
      download.href = storeURL;
      download.textContent = config.appStoreURL ? "Download Davey" : "Get Davey on TestFlight";
    } else {
      download.removeAttribute("href");
      download.setAttribute("aria-disabled", "true");
      download.textContent = "Download coming soon";
      setText("download-note", "Davey isn't on the App Store yet. Ask the person who invited you for the TestFlight link.");
    }
    download.addEventListener("click", function () {
      copy(inviteURL, "download-note", "Invite link copied. After installing, open Davey and tap I have an invite: it finds the link for you.");
    });
    $("copy-link").addEventListener("click", function () { copy(inviteURL, "copy-status", "Link copied."); });

    fetch(config.supabaseURL + "/functions/v1/household-invite-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.publishableKey },
      body: JSON.stringify({ token: token })
    }).then(function (response) { return response.json(); }).then(function (preview) {
      var owner = preview.owner_first_name || "Someone";
      var invitee = preview.invitee && preview.invitee.first_name;
      switch (preview.status) {
        case "pending":
          setText("greeting", invitee ? "Hi " + invitee + "," : "Hi,");
          setText("title", owner + " invited you to share their Davey budget");
          setText("lead", "You'll both see and edit the same accounts, budgets and transactions. Each of you keeps your own sign-in and Face ID lock.");
          var date = preview.expires_at && formatDate(preview.expires_at);
          if (date) setText("expiry", "This invite expires on " + date + " and works once.");
          break;
        case "expired":
          fail("This invite has expired", "Ask " + owner + " to send a new one from Davey › Settings › Household.");
          break;
        case "used":
          fail("This invite was already used", "Each invite works once. If that wasn't you, ask " + owner + " for a new one.");
          break;
        case "cancelled":
          fail("This invite was cancelled", "Ask " + owner + " to send a new one if you still want to join.");
          break;
        default:
          fail("This invite link isn't valid", "Check that you opened the whole link, or ask for a new invite.");
      }
    }).catch(function () {
      setText("title", "You're invited to Davey");
      setText("lead", "We couldn't load the invite details right now. Open Davey to see and accept it.");
    });

    function fail(title, lead) {
      setText("greeting", "");
      setText("title", title);
      setText("lead", lead);
      show("actions", false); show("steps", false); show("expiry", false);
    }
  }

  // ---- /auth/callback and /auth/reset ----
  function auth(isReset) {
    var tokenHash = params.get("token_hash") || "";
    var type = params.get("type") || (isReset ? "recovery" : "signup");
    if (!tokenHash) {
      setText("title", "This link is incomplete");
      setText("lead", "Open the whole link from the email, or request a new one in Davey.");
      show("actions", false);
      return;
    }
    var path = isReset ? "auth/reset" : "auth/callback";
    openApp("davey://" + path + "?token_hash=" + encodeURIComponent(tokenHash) + "&type=" + encodeURIComponent(type), true);
    if (isReset) return;

    var confirmable = ["signup", "email_change", "email", "invite"];
    if (confirmable.indexOf(type) === -1) return;
    show("confirm-web", true);
    $("confirm-web").addEventListener("click", function () {
      var button = $("confirm-web");
      button.disabled = true;
      fetch(config.supabaseURL + "/auth/v1/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.publishableKey },
        body: JSON.stringify({ type: type, token_hash: tokenHash })
      }).then(function (response) {
        if (!response.ok) throw new Error("verify");
        setText("title", "Email confirmed");
        setText("lead", "Open Davey and sign in.");
        show("confirm-web", false);
      }).catch(function () {
        setText("status", "This link expired or was already used. Request a new one in Davey.");
        button.disabled = false;
      });
    });
  }

  if (page === "join") join();
  if (page === "auth-callback") auth(false);
  if (page === "auth-reset") auth(true);
})();
